import { toNumber, type PrismaClient } from '@paddelbase/db';
import { RATING_CONFIG, levelCategory, type RatingConfig } from '@paddelbase/rating';

/**
 * Метрики, которые ТЗ §12 требует снимать с первого дня.
 *
 * Без них коэффициенты из §3.8 нельзя откалибровать: сейчас все они —
 * инженерная реконструкция, и подтвердить или опровергнуть их можно только
 * данными. Метрики читают `rating_events`, поэтому доступны сразу за всю
 * историю и не требуют отдельного накопления.
 */

export interface RatingMetrics {
  /** Границы периода, за который посчитано. */
  from: Date | null;
  to: Date;

  /** Средний модуль изменения уровня за матч — отдельно по стадии калибровки. */
  averageAbsDelta: { calibrating: number | null; calibrated: number | null };

  /**
   * Доля матчей, где сильнейшая по ожиданию пара действительно победила.
   * Целевой коридор §12 — 60–70 %: выше означает, что матчи слишком неравные,
   * ниже — что модель не работает.
   */
  predictionAccuracy: { value: number | null; sample: number };

  /** Распределение уровней активных игроков и его сдвиг. */
  levels: {
    activePlayers: number;
    average: number | null;
    median: number | null;
    byCategory: Record<string, number>;
  };

  /**
   * Дрейф среднего уровня за период. §3.3 требует вводить нормировку,
   * если он превысит 0.15 за квартал.
   */
  drift: { value: number | null; overQuarterlyLimit: boolean };

  /** Сколько матчей реально уходит на подтверждение уровня. */
  calibration: { medianMatchesToReliable: number | null; sample: number };

  /**
   * Систематическое занижение самооценки: разница между уровнем после
   * N матчей и заявленным в анкете.
   */
  sandbagging: { averageGap: number | null; sample: number };

  /** Доля оспоренных и неподтверждённых результатов. */
  results: { total: number; disputedShare: number; unconfirmedShare: number };
}

export const QUARTERLY_DRIFT_LIMIT = 0.15;
/** После скольких матчей сравнивать уровень с самооценкой (ТЗ §12). */
export const SANDBAGGING_AFTER_MATCHES = 20;

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

export async function collectRatingMetrics(
  prisma: PrismaClient,
  input: { now: Date; from?: Date; config?: RatingConfig } = { now: new Date() },
): Promise<RatingMetrics> {
  const config = input.config ?? RATING_CONFIG;
  const from = input.from ?? null;
  const period = from ? { gte: from, lte: input.now } : { lte: input.now };

  const events = await prisma.ratingEvent.findMany({
    where: { occurredAt: period },
    select: {
      userId: true,
      matchId: true,
      delta: true,
      levelBefore: true,
      levelAfter: true,
      reliabilityBefore: true,
      occurredAt: true,
      snapshot: true,
    },
    orderBy: { occurredAt: 'asc' },
  });

  const calibrating: number[] = [];
  const calibrated: number[] = [];

  for (const event of events) {
    const bucket =
      toNumber(event.reliabilityBefore) < config.RELIABLE_THRESHOLD ? calibrating : calibrated;
    bucket.push(Math.abs(toNumber(event.delta)));
  }

  // --- Качество предсказания ---
  // Считается по снимку матча: в нём лежат и ожидание, и фактический результат,
  // поэтому метрика не зависит от того, менялись ли с тех пор коэффициенты.
  const seenMatches = new Set<string>();
  let correct = 0;
  let sample = 0;

  for (const event of events) {
    if (!event.matchId || seenMatches.has(event.matchId)) continue;
    seenMatches.add(event.matchId);

    const snapshot = event.snapshot as { input?: { expectedA?: number; actualA?: number } } | null;
    const expectedA = snapshot?.input?.expectedA;
    const actualA = snapshot?.input?.actualA;
    if (expectedA === undefined || actualA === undefined) continue;
    // Равное ожидание не является предсказанием — такие матчи не в счёт.
    if (Math.abs(expectedA - 0.5) < 1e-9) continue;

    sample += 1;
    const favouriteWasA = expectedA > 0.5;
    const aPerformedBetter = actualA > 0.5;
    if (favouriteWasA === aPerformedBetter) correct += 1;
  }

  // --- Распределение уровней ---
  const activeUsers = await prisma.user.findMany({
    where: { ratedMatchesCount: { gt: 0 } },
    select: {
      id: true,
      level: true,
      startLevel: true,
      selfAssessedLevel: true,
      ratedMatchesCount: true,
    },
  });

  const levels = activeUsers.map((user) => toNumber(user.level));
  const byCategory: Record<string, number> = {};
  for (const level of levels) {
    const category = levelCategory(level);
    byCategory[category] = (byCategory[category] ?? 0) + 1;
  }

  // --- Дрейф ---
  // Средний уровень «до» самых ранних событий периода против текущего среднего.
  const earliestPerUser = new Map<string, number>();
  for (const event of events) {
    if (!earliestPerUser.has(event.userId)) {
      earliestPerUser.set(event.userId, toNumber(event.levelBefore));
    }
  }

  const averageNow = mean(levels);
  const averageThen = mean([...earliestPerUser.values()]);
  const drift = averageNow !== null && averageThen !== null ? averageNow - averageThen : null;

  // --- Сколько матчей до подтверждения уровня ---
  const matchesToReliable: number[] = [];
  const perUserEvents = new Map<string, typeof events>();
  for (const event of events) {
    const list = perUserEvents.get(event.userId) ?? [];
    list.push(event);
    perUserEvents.set(event.userId, list);
  }

  for (const list of perUserEvents.values()) {
    const index = list.findIndex(
      (event) => toNumber(event.reliabilityBefore) >= config.RELIABLE_THRESHOLD,
    );
    if (index >= 0) matchesToReliable.push(index);
  }

  // --- Сэндбэггинг ---
  const matured = activeUsers.filter(
    (user) => user.ratedMatchesCount >= SANDBAGGING_AFTER_MATCHES,
  );
  const gaps = matured.map((user) => toNumber(user.level) - toNumber(user.selfAssessedLevel));

  // --- Качество ввода результатов ---
  const total = await prisma.matchResult.count();
  const disputed = await prisma.matchResult.count({ where: { disputedAt: { not: null } } });
  const unconfirmed = await prisma.matchResult.count({
    where: { confirmedAt: null, disputedAt: null },
  });

  return {
    from,
    to: input.now,
    averageAbsDelta: { calibrating: mean(calibrating), calibrated: mean(calibrated) },
    predictionAccuracy: { value: sample === 0 ? null : correct / sample, sample },
    levels: {
      activePlayers: activeUsers.length,
      average: averageNow,
      median: median(levels),
      byCategory,
    },
    drift: {
      value: drift,
      overQuarterlyLimit: drift !== null && Math.abs(drift) > QUARTERLY_DRIFT_LIMIT,
    },
    calibration: {
      medianMatchesToReliable: median(matchesToReliable),
      sample: matchesToReliable.length,
    },
    sandbagging: { averageGap: mean(gaps), sample: gaps.length },
    results: {
      total,
      disputedShare: total === 0 ? 0 : disputed / total,
      unconfirmedShare: total === 0 ? 0 : unconfirmed / total,
    },
  };
}

/** Человекочитаемый отчёт для CLI и логов фоновой задачи. */
export function formatMetrics(metrics: RatingMetrics): string {
  const percent = (value: number | null) =>
    value === null ? '—' : `${(value * 100).toFixed(1)} %`;
  const number = (value: number | null, digits = 3) =>
    value === null ? '—' : value.toFixed(digits);

  const lines = [
    `Период: ${metrics.from ? metrics.from.toISOString().slice(0, 10) : 'с начала'} — ${metrics.to.toISOString().slice(0, 10)}`,
    '',
    'Шаг уровня за матч',
    `  на калибровке:      ${number(metrics.averageAbsDelta.calibrating)}`,
    `  после калибровки:   ${number(metrics.averageAbsDelta.calibrated)}`,
    '',
    `Качество предсказания: ${percent(metrics.predictionAccuracy.value)} (выборка ${metrics.predictionAccuracy.sample})`,
    '  целевой коридор 60–70 %: выше — матчи слишком неравные, ниже — модель не работает',
    '',
    'Распределение уровней',
    `  активных игроков:   ${metrics.levels.activePlayers}`,
    `  средний уровень:    ${number(metrics.levels.average, 2)}`,
    `  медиана:            ${number(metrics.levels.median, 2)}`,
    `  по категориям:      ${Object.entries(metrics.levels.byCategory)
      .map(([category, count]) => `${category}: ${count}`)
      .join(', ')}`,
    '',
    `Дрейф среднего уровня: ${number(metrics.drift.value)}`,
    metrics.drift.overQuarterlyLimit
      ? `  ВНИМАНИЕ: дрейф превысил ${QUARTERLY_DRIFT_LIMIT} — §3.3 требует ввести нормировку`
      : `  в пределах нормы (порог ${QUARTERLY_DRIFT_LIMIT} за квартал)`,
    '',
    `Матчей до подтверждения уровня (медиана): ${number(metrics.calibration.medianMatchesToReliable, 0)} (выборка ${metrics.calibration.sample})`,
    `Расхождение с самооценкой после ${SANDBAGGING_AFTER_MATCHES} матчей: ${number(metrics.sandbagging.averageGap, 2)} (выборка ${metrics.sandbagging.sample})`,
    '  устойчивый плюс означает систематическое занижение при регистрации',
    '',
    'Ввод результатов',
    `  всего:              ${metrics.results.total}`,
    `  оспорено:           ${percent(metrics.results.disputedShare)}`,
    `  не подтверждено:    ${percent(metrics.results.unconfirmedShare)}`,
  ];

  return lines.join('\n');
}
