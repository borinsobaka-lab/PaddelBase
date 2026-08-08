import { runScheduledJobs } from '@paddelbase/core';
import { prisma } from '@paddelbase/db';
import { timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';

/**
 * Точка запуска фоновых задач (ТЗ §11 п. 9).
 *
 * Планировщика внутри процесса нет намеренно. Приложение в Coolify может быть
 * поднято в нескольких экземплярах, и `node-cron` отработал бы в каждом; кроме
 * того, задачи внутри веб-процесса невозможно запустить руками, когда надо
 * разобраться, почему не ушло напоминание.
 *
 * Поэтому тик приходит снаружи — из планировщика Coolify. Повторные вызовы
 * безопасны: `runScheduledJobs` держит мьютекс на паре «задача + окно», так
 * что лишний запрос вернёт SKIPPED, а не второе напоминание.
 */
function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length < 16) return false;

  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';

  // Сравнение постоянного времени: обычное `===` выходит из цикла на первом
  // несовпавшем байте и по времени ответа выдаёт длину общего префикса.
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function handle(request: Request): Promise<Response> {
  if (!process.env.CRON_SECRET) {
    return Response.json(
      { error: 'CRON_SECRET не задан: фоновые задачи выключены' },
      { status: 503 },
    );
  }

  if (!authorized(request)) {
    return Response.json({ error: 'Неверный токен' }, { status: 401 });
  }

  const startedAt = Date.now();
  const outcomes = await runScheduledJobs(prisma, new Date());
  const failed = outcomes.filter((outcome) => outcome.status === 'FAILED');

  // Провал хотя бы одной задачи отдаётся пятисоткой: планировщик Coolify
  // показывает неуспешные прогоны, и без ненулевого статуса поломка фоновых
  // задач осталась бы молчаливой.
  return Response.json(
    { ranMs: Date.now() - startedAt, outcomes },
    { status: failed.length > 0 ? 500 : 200, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  return handle(request);
}

/** GET продублирован, чтобы тик можно было дать обычным `curl` без флагов. */
export async function GET(request: Request) {
  return handle(request);
}
