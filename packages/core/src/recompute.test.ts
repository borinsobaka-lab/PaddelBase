import { withOverrides } from '@paddelbase/rating';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  closeRound,
  createTournament,
  enterRoundScore,
  finishTournament,
  joinTournament,
  startTournament,
} from './tournamentLifecycle.js';
import { confirmMatchResult, enterMatchResult } from './matchResult.js';
import { recomputeRatings } from './recompute.js';
import { makeCourt, makePlayers, resetDatabase, testDatabaseUrl, testPrisma } from './testDb.js';

const FOUR = ['r1', 'r2', 'r3', 'r4'];

async function levels(): Promise<Record<string, number>> {
  const users = await testPrisma.user.findMany({ orderBy: { id: 'asc' } });
  return Object.fromEntries(users.map((user) => [user.id, Number(user.level)]));
}

describe.skipIf(!testDatabaseUrl)('полный пересчёт истории (ТЗ §3.10)', () => {
  afterAll(async () => {
    if (testDatabaseUrl) await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase();
    await makePlayers(FOUR);
  });

  async function playMatch(startsAt: Date, scoreA: 6 | 3 = 6): Promise<string> {
    const match = await testPrisma.match.create({
      data: {
        creatorId: 'r1',
        courtId: await makeCourt(`Корт ${startsAt.toISOString()}`),
        startsAt,
        durationMin: 90,
        isRated: true,
        slotsMissing: 0,
        status: 'FILLED',
        players: { create: FOUR.map((userId) => ({ userId })) },
      },
    });

    await enterMatchResult(testPrisma, {
      matchId: match.id,
      enteredById: 'r1',
      sets: [
        { a: scoreA, b: scoreA === 6 ? 4 : 6 },
        { a: scoreA, b: scoreA === 6 ? 3 : 6 },
      ],
      teams: [
        { userId: 'r1', team: 1 },
        { userId: 'r2', team: 1 },
        { userId: 'r3', team: 2 },
        { userId: 'r4', team: 2 },
      ],
      now: startsAt,
    });

    await confirmMatchResult(testPrisma, { matchId: match.id, userId: 'r3', now: startsAt });
    return match.id;
  }

  async function playHistory(): Promise<void> {
    await playMatch(new Date('2026-07-01T10:00:00Z'));
    await playMatch(new Date('2026-07-05T10:00:00Z'), 3);
    await playMatch(new Date('2026-07-20T10:00:00Z'));
    await playMatch(new Date('2026-08-15T10:00:00Z'));
  }

  it('воспроизводит ровно те же уровни, что дал обычный ход событий', async () => {
    await playHistory();
    const original = await levels();
    const originalEvents = await testPrisma.ratingEvent.count();

    const summary = await recomputeRatings(testPrisma);

    expect(summary.matchesReplayed).toBe(4);
    expect(summary.maxLevelShift).toBeLessThan(0.0005);
    expect(await levels()).toEqual(original);
    expect(await testPrisma.ratingEvent.count()).toBe(originalEvents);
  });

  it('идемпотентен: второй прогон ничего не меняет', async () => {
    await playHistory();
    await recomputeRatings(testPrisma);
    const afterFirst = await levels();

    await recomputeRatings(testPrisma);
    expect(await levels()).toEqual(afterFirst);
  });

  it('восстанавливает надёжность и счётчик матчей', async () => {
    await playHistory();
    const before = await testPrisma.user.findUniqueOrThrow({ where: { id: 'r1' } });

    await recomputeRatings(testPrisma);

    const after = await testPrisma.user.findUniqueOrThrow({ where: { id: 'r1' } });
    expect(after.ratedMatchesCount).toBe(before.ratedMatchesCount);
    expect(Number(after.reliabilityBase)).toBeCloseTo(Number(before.reliabilityBase), 10);
    expect(after.lastRatedMatchAt?.toISOString()).toBe(before.lastRatedMatchAt?.toISOString());
  });

  it('пересчитывает историю по изменённому конфигу и показывает масштаб сдвига', async () => {
    await playHistory();
    const original = await levels();

    // Ровно то, ради чего пересчёт и существует: сменили коэффициент.
    const summary = await recomputeRatings(testPrisma, {
      config: withOverrides({ D: 1.0 }),
    });

    expect(summary.maxLevelShift).toBeGreaterThan(0);
    expect(await levels()).not.toEqual(original);
  });

  it('dry run считает, но ничего не записывает', async () => {
    await playHistory();
    const original = await levels();

    const summary = await recomputeRatings(testPrisma, {
      config: withOverrides({ D: 1.0 }),
      dryRun: true,
    });

    expect(summary.dryRun).toBe(true);
    expect(summary.matchesReplayed).toBe(4);
    expect(summary.maxLevelShift).toBeGreaterThan(0);
    // База осталась нетронутой, включая события.
    expect(await levels()).toEqual(original);
    expect(await testPrisma.ratingEvent.count()).toBe(16);
  });

  it('частичный пересчёт восстанавливает состояние на дату из журнала', async () => {
    await playHistory();
    const original = await levels();

    const summary = await recomputeRatings(testPrisma, {
      from: new Date('2026-07-10T00:00:00Z'),
    });

    expect(summary.from).not.toBeNull();
    // Два матча до даты не трогали, два после переиграли — результат тот же.
    expect(summary.matchesReplayed).toBe(2);
    expect(await levels()).toEqual(original);
    expect(await testPrisma.ratingEvent.count()).toBe(16);
  });

  it('пересчитывает дневной лимит заново, а не берёт из старых записей', async () => {
    const day = new Date('2026-09-01T08:00:00Z');
    for (let index = 0; index < 5; index += 1) {
      await playMatch(new Date(day.getTime() + index * 60 * 60 * 1000));
    }

    const summary = await recomputeRatings(testPrisma);

    expect(summary.matchesReplayed).toBe(4);
    expect(summary.skipped.map((s) => s.reason)).toEqual(['DAILY_LIMIT']);
  });

  it('прогоняет матчи и турниры в общем хронологическом порядке', async () => {
    await makePlayers(['r5', 'r6', 'r7', 'r8']);

    await playMatch(new Date('2026-07-01T10:00:00Z'));

    const tournamentId = await createTournament(testPrisma, {
      organizerId: 'r1',
      courtId: await makeCourt('Турнирный корт'),
      format: 'AMERICANO',
      isRated: true,
      startsAt: new Date('2026-07-10T10:00:00Z'),
      durationMin: 180,
      courtsCount: 2,
      maxParticipants: 8,
      pointsPerRound: 24,
      roundsCount: 1,
      seed: 'seed',
      now: new Date('2026-07-01T00:00:00Z'),
    });

    for (const userId of [...FOUR, 'r5', 'r6', 'r7', 'r8']) {
      await joinTournament(testPrisma, { tournamentId, userId });
    }
    await startTournament(testPrisma, {
      tournamentId,
      organizerId: 'r1',
      now: new Date('2026-07-10T10:00:00Z'),
    });

    const round = await testPrisma.tournamentRound.findFirstOrThrow({
      where: { tournamentId },
      include: { matches: true },
    });
    for (const match of round.matches) {
      await enterRoundScore(testPrisma, {
        tournamentMatchId: match.id,
        organizerId: 'r1',
        scoreA: 16,
        scoreB: 8,
      });
    }
    await closeRound(testPrisma, {
      tournamentId,
      roundNumber: 1,
      organizerId: 'r1',
      now: new Date('2026-07-10T13:00:00Z'),
    });
    await finishTournament(testPrisma, {
      tournamentId,
      organizerId: 'r1',
      now: new Date('2026-07-10T14:00:00Z'),
    });

    await playMatch(new Date('2026-07-20T10:00:00Z'));

    const original = await levels();
    const summary = await recomputeRatings(testPrisma);

    expect(summary.matchesReplayed).toBe(2);
    expect(summary.tournamentsReplayed).toBe(1);
    expect(await levels()).toEqual(original);
  });
});
