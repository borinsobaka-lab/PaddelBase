import { PrismaClient } from '@paddelbase/db';

/**
 * Общая обвязка интеграционных тестов.
 *
 * Тесты доменного слоя работают против настоящего PostgreSQL: логика опирается
 * на транзакции, условные обновления и запросы по связям. Заглушка проверяла бы
 * не то, что поедет в прод.
 *
 *   createdb paddelbase_test
 *   TEST_DATABASE_URL=postgresql://... pnpm --filter @paddelbase/db migrate:deploy
 *   TEST_DATABASE_URL=postgresql://... pnpm --filter @paddelbase/core test
 */
export const testDatabaseUrl = process.env.TEST_DATABASE_URL;

export const testPrisma: PrismaClient = testDatabaseUrl
  ? new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } })
  : (null as unknown as PrismaClient);

/** Порядок важен: сначала зависимые таблицы. */
export async function resetDatabase(prisma: PrismaClient = testPrisma): Promise<void> {
  await prisma.jobRun.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.ratingEvent.deleteMany();
  await prisma.tournamentMatchPlayer.deleteMany();
  await prisma.tournamentMatch.deleteMany();
  await prisma.tournamentRound.deleteMany();
  await prisma.tournamentParticipant.deleteMany();
  await prisma.tournamentTeam.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.matchResult.deleteMany();
  await prisma.matchPlayer.deleteMany();
  await prisma.matchApplication.deleteMany();
  await prisma.match.deleteMany();
  await prisma.postComment.deleteMany();
  await prisma.postLike.deleteMany();
  await prisma.postReport.deleteMany();
  await prisma.post.deleteMany();
  await prisma.user.deleteMany();
  await prisma.court.deleteMany();
}

export async function makeCourt(
  name = 'Тестовый корт',
  prisma: PrismaClient = testPrisma,
): Promise<string> {
  const court = await prisma.court.create({
    data: { name, city: 'Тбилиси', address: 'Тест' },
  });
  return court.id;
}

export async function makePlayer(
  id: string,
  level = 3.5,
  prisma: PrismaClient = testPrisma,
): Promise<string> {
  const user = await prisma.user.create({
    data: {
      id,
      firstName: 'Тест',
      lastName: id,
      level,
      startLevel: level,
      selfAssessedLevel: level,
    },
  });
  return user.id;
}

export async function makePlayers(
  ids: readonly string[],
  level = 3.5,
  prisma: PrismaClient = testPrisma,
): Promise<string[]> {
  const created: string[] = [];
  for (const id of ids) created.push(await makePlayer(id, level, prisma));
  return created;
}
