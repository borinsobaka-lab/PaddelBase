import { RATING_CONFIG, initialReliability } from '@paddelbase/rating';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { tbilisiDayRange } from './guards.js';
import {
  confirmMatchResult,
  disputeMatchResult,
  enterMatchResult,
  autoConfirmDueResults,
} from './matchResult.js';
import { resetDatabase, testDatabaseUrl, testPrisma as prisma } from './testDb.js';

/**
 * Интеграционные тесты транзакции применения рейтинга (ТЗ §7).
 *
 * Требуют настоящий PostgreSQL: логика опирается на транзакции, groupBy и
 * фильтры по связям, и подменять это заглушкой бессмысленно — проверять надо
 * ровно то, что поедет в прод.
 *
 *   createdb paddelbase_test
 *   TEST_DATABASE_URL=postgresql://... pnpm --filter @paddelbase/db migrate:deploy
 *   TEST_DATABASE_URL=postgresql://... pnpm --filter @paddelbase/core test
 */

const START = new Date('2026-08-07T10:00:00Z');

describe.skipIf(!testDatabaseUrl)('применение рейтинга по матчу', () => {
  afterAll(async () => {
    if (testDatabaseUrl) await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  async function makeCourt(): Promise<string> {
    const court = await prisma.court.create({
      data: { name: 'Тестовый корт', city: 'Тбилиси', address: 'Тест' },
    });
    return court.id;
  }

  async function makePlayer(
    id: string,
    level: number,
    reliability = initialReliability(),
  ): Promise<string> {
    const user = await prisma.user.create({
      data: {
        id,
        firstName: 'Тест',
        lastName: id,
        level,
        startLevel: level,
        selfAssessedLevel: level,
        reliabilityBase: reliability,
        reliability,
      },
    });
    return user.id;
  }

  async function makeMatch(options: {
    playerIds: readonly string[];
    isRated?: boolean;
    startsAt?: Date;
  }): Promise<string> {
    const match = await prisma.match.create({
      data: {
        creatorId: options.playerIds[0]!,
        courtId: await makeCourt(),
        startsAt: options.startsAt ?? START,
        durationMin: 90,
        isRated: options.isRated ?? true,
        slotsMissing: 0,
        status: 'FILLED',
        players: { create: options.playerIds.map((userId) => ({ userId })) },
      },
    });
    return match.id;
  }

  async function setupFour(isRated = true): Promise<{ matchId: string; ids: string[] }> {
    const ids = await Promise.all([
      makePlayer('p1', 3.5),
      makePlayer('p2', 3.5),
      makePlayer('p3', 3.5),
      makePlayer('p4', 3.5),
    ]);
    return { matchId: await makeMatch({ playerIds: ids, isRated }), ids };
  }

  const TEAMS = [
    { userId: 'p1', team: 1 as const },
    { userId: 'p2', team: 1 as const },
    { userId: 'p3', team: 2 as const },
    { userId: 'p4', team: 2 as const },
  ];

  async function playAndConfirm(matchId: string, now = new Date('2026-08-07T12:00:00Z')) {
    await enterMatchResult(prisma, {
      matchId,
      enteredById: 'p1',
      sets: [
        { a: 6, b: 4 },
        { a: 6, b: 3 },
      ],
      teams: TEAMS,
      now,
    });

    return confirmMatchResult(prisma, { matchId, userId: 'p3', now });
  }

  it('проводит матч от ввода счёта до изменения уровней', async () => {
    const { matchId } = await setupFour();
    const applied = await playAndConfirm(matchId);

    expect(applied.applied).toBe(true);
    expect(applied.deltas).toHaveLength(4);

    const users = await prisma.user.findMany({ orderBy: { id: 'asc' } });
    const level = (id: string) => Number(users.find((u) => u.id === id)!.level);

    // Пары равны по уровню, победила первая — она растёт, вторая падает.
    expect(level('p1')).toBeGreaterThan(3.5);
    expect(level('p2')).toBeGreaterThan(3.5);
    expect(level('p3')).toBeLessThan(3.5);
    expect(level('p4')).toBeLessThan(3.5);

    // Симметрия: у всех одинаковая надёжность, значит и шаг одинаковый.
    expect(level('p1') - 3.5).toBeCloseTo(3.5 - level('p3'), 10);
  });

  it('записывает событие рейтинга со снимком для каждого участника', async () => {
    const { matchId } = await setupFour();
    await playAndConfirm(matchId);

    const events = await prisma.ratingEvent.findMany({ orderBy: { userId: 'asc' } });
    expect(events).toHaveLength(4);

    for (const event of events) {
      expect(event.matchId).toBe(matchId);
      expect(event.configVersion).toBeTruthy();
      expect(event.snapshot).toBeTruthy();
      // levelBefore + delta должно точно сходиться с levelAfter.
      expect(Number(event.levelBefore) + Number(event.delta)).toBeCloseTo(
        Number(event.levelAfter),
        10,
      );
    }
  });

  it('поднимает надёжность и отмечает дату последнего рейтингового матча', async () => {
    const { matchId } = await setupFour();
    await playAndConfirm(matchId);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: 'p1' } });
    expect(user.ratedMatchesCount).toBe(1);
    expect(Number(user.reliabilityBase)).toBeCloseTo(initialReliability() + 1 / RATING_CONFIG.N_FULL, 10);
    expect(user.lastRatedMatchAt).not.toBeNull();
  });

  it('уведомляет участников об изменении рейтинга', async () => {
    const { matchId } = await setupFour();
    await playAndConfirm(matchId);

    const notifications = await prisma.notification.findMany({
      where: { type: 'RATING_CHANGED' },
    });
    expect(notifications).toHaveLength(4);
  });

  it('переводит матч в COMPLETED', async () => {
    const { matchId } = await setupFour();
    await playAndConfirm(matchId);

    const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(match.status).toBe('COMPLETED');
  });
});

describe.skipIf(!testDatabaseUrl)('правила подтверждения', () => {
  afterAll(async () => {
    if (testDatabaseUrl) await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  async function setup(isRated = true): Promise<string> {
    for (const id of ['p1', 'p2', 'p3', 'p4']) {
      await prisma.user.create({
        data: {
          id,
          firstName: 'Тест',
          lastName: id,
          level: 3.5,
          startLevel: 3.5,
          selfAssessedLevel: 3.5,
        },
      });
    }

    const court = await prisma.court.create({
      data: { name: 'Корт', city: 'Тбилиси', address: 'Тест' },
    });

    const match = await prisma.match.create({
      data: {
        creatorId: 'p1',
        courtId: court.id,
        startsAt: START,
        durationMin: 90,
        isRated,
        slotsMissing: 0,
        status: 'FILLED',
        players: { create: ['p1', 'p2', 'p3', 'p4'].map((userId) => ({ userId })) },
      },
    });

    await enterMatchResult(prisma, {
      matchId: match.id,
      enteredById: 'p1',
      sets: [
        { a: 6, b: 4 },
        { a: 6, b: 3 },
      ],
      teams: [
        { userId: 'p1', team: 1 },
        { userId: 'p2', team: 1 },
        { userId: 'p3', team: 2 },
        { userId: 'p4', team: 2 },
      ],
      now: START,
    });

    return match.id;
  }

  it('не даёт подтвердить результат игроку из пары, которая его вводила', async () => {
    const matchId = await setup();

    await expect(
      confirmMatchResult(prisma, { matchId, userId: 'p2', now: START }),
    ).rejects.toThrow(/которая счёт не вводила/);
  });

  it('не даёт подтвердить постороннему', async () => {
    const matchId = await setup();
    await prisma.user.create({
      data: {
        id: 'outsider',
        firstName: 'Чужой',
        lastName: 'Игрок',
        level: 3.0,
        startLevel: 3.0,
        selfAssessedLevel: 3.0,
      },
    });

    await expect(
      confirmMatchResult(prisma, { matchId, userId: 'outsider', now: START }),
    ).rejects.toThrow(/только участник/);
  });

  it('не даёт подтвердить дважды', async () => {
    const matchId = await setup();
    await confirmMatchResult(prisma, { matchId, userId: 'p3', now: START });

    await expect(
      confirmMatchResult(prisma, { matchId, userId: 'p4', now: START }),
    ).rejects.toThrow(/уже подтверждён/);
  });

  it('оспоренный результат не меняет уровни', async () => {
    const matchId = await setup();
    await disputeMatchResult(prisma, { matchId, userId: 'p3', now: START });

    const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(match.status).toBe('DISPUTED');
    expect(await prisma.ratingEvent.count()).toBe(0);

    await expect(
      confirmMatchResult(prisma, { matchId, userId: 'p3', now: START }),
    ).rejects.toThrow(/оспорен/);
  });

  it('любительский матч сохраняет счёт, но не трогает рейтинг', async () => {
    const matchId = await setup(false);
    const applied = await confirmMatchResult(prisma, { matchId, userId: 'p3', now: START });

    expect(applied).toEqual({ applied: false, skipReason: 'NOT_RATED' });
    expect(await prisma.ratingEvent.count()).toBe(0);

    const result = await prisma.matchResult.findUniqueOrThrow({ where: { matchId } });
    expect(result.gamesA).toBe(12);
    expect(result.skipReason).toBe('NOT_RATED');

    const user = await prisma.user.findUniqueOrThrow({ where: { id: 'p1' } });
    expect(Number(user.level)).toBe(3.5);
  });

  it('засчитывает результат автоматически через 48 часов', async () => {
    const matchId = await setup();
    const applied = await autoConfirmDueResults(
      prisma,
      new Date(START.getTime() + 49 * 60 * 60 * 1000),
    );

    expect(applied).toHaveLength(1);
    expect(applied[0]!.result.applied).toBe(true);
    expect(await prisma.ratingEvent.count()).toBe(4);
  });

  it('не трогает результаты, у которых 48 часов ещё не прошли', async () => {
    await setup();
    const applied = await autoConfirmDueResults(
      prisma,
      new Date(START.getTime() + 47 * 60 * 60 * 1000),
    );

    expect(applied).toHaveLength(0);
  });
});

describe.skipIf(!testDatabaseUrl)('защита от накрутки', () => {
  afterAll(async () => {
    if (testDatabaseUrl) await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  async function seedPlayers(): Promise<void> {
    for (const id of ['p1', 'p2', 'p3', 'p4']) {
      await prisma.user.create({
        data: {
          id,
          firstName: 'Тест',
          lastName: id,
          level: 3.5,
          startLevel: 3.5,
          selfAssessedLevel: 3.5,
        },
      });
    }
  }

  async function playMatch(startsAt: Date): Promise<string> {
    const court = await prisma.court.create({
      data: { name: `Корт ${startsAt.toISOString()}`, city: 'Тбилиси', address: 'Тест' },
    });

    const match = await prisma.match.create({
      data: {
        creatorId: 'p1',
        courtId: court.id,
        startsAt,
        durationMin: 90,
        isRated: true,
        slotsMissing: 0,
        status: 'FILLED',
        players: { create: ['p1', 'p2', 'p3', 'p4'].map((userId) => ({ userId })) },
      },
    });

    await enterMatchResult(prisma, {
      matchId: match.id,
      enteredById: 'p1',
      sets: [
        { a: 6, b: 4 },
        { a: 6, b: 3 },
      ],
      teams: [
        { userId: 'p1', team: 1 },
        { userId: 'p2', team: 1 },
        { userId: 'p3', team: 2 },
        { userId: 'p4', team: 2 },
      ],
      now: startsAt,
    });

    await confirmMatchResult(prisma, { matchId: match.id, userId: 'p3', now: startsAt });
    return match.id;
  }

  it('вторая игра тем же составом даёт меньший прирост', async () => {
    await seedPlayers();

    const first = await playMatch(new Date('2026-08-01T10:00:00Z'));
    const second = await playMatch(new Date('2026-08-02T10:00:00Z'));

    const deltaOf = async (matchId: string) =>
      Math.abs(
        Number(
          (await prisma.ratingEvent.findFirstOrThrow({ where: { matchId, userId: 'p1' } })).delta,
        ),
      );

    // Тот же состав второй раз за 30 дней: W_repeat = 0.85.
    expect(await deltaOf(second)).toBeLessThan(await deltaOf(first));
  });

  it('сверх дневного лимита матч сохраняется, но не рейтингуется', async () => {
    await seedPlayers();

    const day = new Date('2026-08-05T10:00:00Z');
    for (let index = 0; index < RATING_CONFIG.MAX_RATED_MATCHES_PER_DAY; index += 1) {
      await playMatch(new Date(day.getTime() + index * 60 * 60 * 1000));
    }

    const extraId = await playMatch(new Date(day.getTime() + 5 * 60 * 60 * 1000));
    const result = await prisma.matchResult.findUniqueOrThrow({ where: { matchId: extraId } });

    expect(result.isRatingApplied).toBe(false);
    expect(result.skipReason).toBe('DAILY_LIMIT');

    const { start, end } = tbilisiDayRange(day);
    const counted = await prisma.ratingEvent.count({
      where: { userId: 'p1', occurredAt: { gte: start, lt: end } },
    });
    expect(counted).toBe(RATING_CONFIG.MAX_RATED_MATCHES_PER_DAY);
  });
});
