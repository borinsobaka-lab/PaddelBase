import { prisma } from '@paddelbase/db';

export const dynamic = 'force-dynamic';

/**
 * Health check для Coolify.
 *
 * Проверка ходит в базу, а не просто отвечает «процесс жив». Приложение без
 * базы не показывает ни одного экрана, и зелёный статус у такого контейнера —
 * ложь, из-за которой выкатка сломанной версии считается успешной.
 *
 * Обратная сторона: моргание базы уронит проверку и Coolify перезапустит
 * контейнер. Это осознанный размен — перезапуск здесь дешевле, чем инстанс,
 * который отвечает пятисотками и считается здоровым.
 */
export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error: unknown) {
    return Response.json(
      {
        status: 'error',
        database: 'unreachable',
        message: error instanceof Error ? error.message : 'неизвестная ошибка',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return Response.json(
    { status: 'ok', database: 'ok', latencyMs: Date.now() - startedAt },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
