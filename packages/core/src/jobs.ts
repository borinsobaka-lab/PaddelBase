import { toJson, type PrismaClient } from '@paddelbase/db';
import { RATING_CONFIG, effectiveReliability, type RatingConfig } from '@paddelbase/rating';

import { toLevelDecimal, toNumber } from '@paddelbase/db';

import {
  expireOpenMatches,
  markPlayedMatches,
  sendMatchReminders,
} from './matchLifecycle.js';
import { autoConfirmDueResults } from './matchResult.js';

/**
 * Фоновые задачи (ТЗ §11 п. 9).
 *
 * Главная сложность здесь не в самих задачах, а в том, что приложение в Coolify
 * может быть поднято в нескольких экземплярах, и `node-cron` внутри процесса
 * отработает в каждом. Без защиты автоподтверждение результатов и рассылка
 * напоминаний сработали бы столько раз, сколько инстансов.
 *
 * Мьютексом служит уникальность пары «задача + окно» в `job_runs`: вставку
 * выигрывает ровно один экземпляр, остальные видят конфликт и пропускают ход.
 * Побочная польза — история прогонов: без неё «задача перестала выполняться»
 * остаётся молчаливым отказом.
 */

export type JobName =
  | 'expire-open-matches'
  | 'mark-played-matches'
  | 'send-match-reminders'
  | 'auto-confirm-results'
  | 'refresh-reliability';

export interface JobOutcome {
  job: JobName;
  status: 'OK' | 'FAILED' | 'SKIPPED';
  details?: unknown;
  error?: string;
}

/** Длительность окна по умолчанию: задачи выполняются не чаще раза в 15 минут. */
export const DEFAULT_WINDOW_MINUTES = 15;

/**
 * Прогон, который считается зависшим. Экземпляр мог упасть, не дописав строку;
 * без этого задача заблокировалась бы навсегда.
 */
export const STALE_RUN_MINUTES = 30;

export function windowKeyFor(now: Date, windowMinutes: number): string {
  const size = windowMinutes * 60 * 1000;
  return new Date(Math.floor(now.getTime() / size) * size).toISOString();
}

/**
 * Выполнить задачу не более одного раза за окно во всём кластере.
 * Возвращает SKIPPED, если окно уже занято другим экземпляром.
 */
export async function runOncePerWindow(
  prisma: PrismaClient,
  input: { job: JobName; now: Date; windowMinutes?: number },
  body: () => Promise<unknown>,
): Promise<JobOutcome> {
  const windowKey = windowKeyFor(input.now, input.windowMinutes ?? DEFAULT_WINDOW_MINUTES);

  const claimed = await claimWindow(prisma, input.job, windowKey, input.now);
  if (!claimed) return { job: input.job, status: 'SKIPPED' };

  try {
    const details = await body();
    await prisma.jobRun.update({
      where: { id: claimed },
      data: { status: 'OK', finishedAt: new Date(input.now), details: toJson(details ?? null) },
    });
    return { job: input.job, status: 'OK', details };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.jobRun.update({
      where: { id: claimed },
      data: { status: 'FAILED', finishedAt: new Date(input.now), error: message },
    });
    return { job: input.job, status: 'FAILED', error: message };
  }
}

async function claimWindow(
  prisma: PrismaClient,
  job: JobName,
  windowKey: string,
  now: Date,
): Promise<string | null> {
  try {
    const run = await prisma.jobRun.create({
      data: { job, windowKey, startedAt: now, status: 'RUNNING' },
    });
    return run.id;
  } catch {
    // Уникальный индекс сработал: окно занято. Забрать его можно, только если
    // предыдущий прогон явно завис.
    const existing = await prisma.jobRun.findUnique({
      where: { job_windowKey: { job, windowKey } },
    });

    if (!existing || existing.status !== 'RUNNING') return null;

    const staleAfter = new Date(now.getTime() - STALE_RUN_MINUTES * 60 * 1000);
    if (existing.startedAt > staleAfter) return null;

    const taken = await prisma.jobRun.updateMany({
      where: { id: existing.id, status: 'RUNNING' },
      data: { startedAt: now },
    });

    return taken.count === 1 ? existing.id : null;
  }
}

/**
 * Материализация текущей надёжности в денормализованную колонку.
 *
 * Источник истины — `reliabilityBase` плюс дата последнего матча; колонка
 * `reliability` нужна только для сортировок и фильтров. Поэтому пропуск или
 * двойной запуск этой задачи ни на что не влияет — в отличие от остальных.
 */
export async function refreshReliability(
  prisma: PrismaClient,
  now: Date,
  config: RatingConfig = RATING_CONFIG,
): Promise<{ updated: number }> {
  const users = await prisma.user.findMany({
    where: { lastRatedMatchAt: { not: null } },
    select: {
      id: true,
      reliabilityBase: true,
      reliability: true,
      lastRatedMatchAt: true,
      ratedMatchesCount: true,
    },
  });

  let updated = 0;

  for (const user of users) {
    const current = effectiveReliability(
      {
        reliabilityBase: toNumber(user.reliabilityBase),
        lastRatedMatchAt: user.lastRatedMatchAt,
        ratedMatchesCount: user.ratedMatchesCount,
      },
      now,
      config,
    );

    if (Math.abs(current - toNumber(user.reliability)) < 0.0005) continue;

    await prisma.user.update({
      where: { id: user.id },
      data: { reliability: toLevelDecimal(current) },
    });
    updated += 1;
  }

  return { updated };
}

/** Один тик планировщика: все задачи, каждая под своей защитой окна. */
export async function runScheduledJobs(
  prisma: PrismaClient,
  now: Date,
  options: { windowMinutes?: number; config?: RatingConfig } = {},
): Promise<JobOutcome[]> {
  const windowMinutes = options.windowMinutes ?? DEFAULT_WINDOW_MINUTES;
  const common = { now, windowMinutes };

  return [
    await runOncePerWindow(prisma, { ...common, job: 'expire-open-matches' }, async () => ({
      expired: await expireOpenMatches(prisma, now),
    })),
    await runOncePerWindow(prisma, { ...common, job: 'mark-played-matches' }, async () => ({
      played: (await markPlayedMatches(prisma, now)).length,
    })),
    await runOncePerWindow(prisma, { ...common, job: 'send-match-reminders' }, async () => ({
      reminded: (await sendMatchReminders(prisma, now, windowMinutes)).length,
    })),
    await runOncePerWindow(prisma, { ...common, job: 'auto-confirm-results' }, async () => ({
      confirmed: (
        await autoConfirmDueResults(prisma, now, options.config ?? RATING_CONFIG)
      ).length,
    })),
    await runOncePerWindow(prisma, { ...common, job: 'refresh-reliability' }, async () =>
      refreshReliability(prisma, now, options.config ?? RATING_CONFIG),
    ),
  ];
}
