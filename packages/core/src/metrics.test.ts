import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { collectRatingMetrics, formatMetrics } from './metrics.js';
import { confirmMatchResult, enterMatchResult } from './matchResult.js';
import { makeCourt, makePlayers, resetDatabase, testDatabaseUrl, testPrisma } from './testDb.js';

const NOW = new Date('2026-09-01T00:00:00Z');
const FOUR = ['m1', 'm2', 'm3', 'm4'];

describe.skipIf(!testDatabaseUrl)('метрики рейтинга (ТЗ §12)', () => {
  afterAll(async () => {
    if (testDatabaseUrl) await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  /** Фаворит — пара m1+m2, она же и выигрывает: предсказание сбывается. */
  async function playMatch(options: {
    startsAt: Date;
    favouriteWins: boolean;
  }): Promise<void> {
    const match = await testPrisma.match.create({
      data: {
        creatorId: 'm1',
        courtId: await makeCourt(`Корт ${options.startsAt.toISOString()}`),
        startsAt: options.startsAt,
        durationMin: 90,
        isRated: true,
        slotsMissing: 0,
        status: 'FILLED',
        players: { create: FOUR.map((userId) => ({ userId })) },
      },
    });

    const winnerSets = options.favouriteWins
      ? [
          { a: 6, b: 4 },
          { a: 6, b: 3 },
        ]
      : [
          { a: 4, b: 6 },
          { a: 3, b: 6 },
        ];

    await enterMatchResult(testPrisma, {
      matchId: match.id,
      enteredById: 'm1',
      sets: winnerSets,
      teams: [
        { userId: 'm1', team: 1 },
        { userId: 'm2', team: 1 },
        { userId: 'm3', team: 2 },
        { userId: 'm4', team: 2 },
      ],
      now: options.startsAt,
    });

    await confirmMatchResult(testPrisma, {
      matchId: match.id,
      userId: 'm3',
      now: options.startsAt,
    });
  }

  async function seedUnevenPlayers(): Promise<void> {
    await testPrisma.user.createMany({
      data: [
        { id: 'm1', firstName: 'Т', lastName: 'm1', level: 4.5, startLevel: 4.5, selfAssessedLevel: 4.5 },
        { id: 'm2', firstName: 'Т', lastName: 'm2', level: 4.5, startLevel: 4.5, selfAssessedLevel: 4.5 },
        { id: 'm3', firstName: 'Т', lastName: 'm3', level: 3.0, startLevel: 3.0, selfAssessedLevel: 3.0 },
        { id: 'm4', firstName: 'Т', lastName: 'm4', level: 3.0, startLevel: 3.0, selfAssessedLevel: 3.0 },
      ],
    });
  }

  it('на пустой базе не падает и честно отдаёт пропуски', async () => {
    const metrics = await collectRatingMetrics(testPrisma, { now: NOW });

    expect(metrics.predictionAccuracy).toEqual({ value: null, sample: 0 });
    expect(metrics.levels.activePlayers).toBe(0);
    expect(metrics.averageAbsDelta).toEqual({ calibrating: null, calibrated: null });
    expect(metrics.results).toEqual({ total: 0, disputedShare: 0, unconfirmedShare: 0 });
    expect(() => formatMetrics(metrics)).not.toThrow();
  });

  it('считает качество предсказания по снимкам матчей', async () => {
    await seedUnevenPlayers();

    for (let index = 0; index < 3; index += 1) {
      await playMatch({
        startsAt: new Date(Date.UTC(2026, 7, index + 1, 10)),
        favouriteWins: true,
      });
    }
    await playMatch({ startsAt: new Date(Date.UTC(2026, 7, 10, 10)), favouriteWins: false });

    const metrics = await collectRatingMetrics(testPrisma, { now: NOW });

    expect(metrics.predictionAccuracy.sample).toBe(4);
    expect(metrics.predictionAccuracy.value).toBeCloseTo(0.75, 10);
  });

  it('разделяет шаг уровня по стадии калибровки', async () => {
    await seedUnevenPlayers();
    await playMatch({ startsAt: new Date(Date.UTC(2026, 7, 1, 10)), favouriteWins: true });

    const metrics = await collectRatingMetrics(testPrisma, { now: NOW });

    // Все четверо только зарегистрировались, значит все на калибровке.
    expect(metrics.averageAbsDelta.calibrating).toBeGreaterThan(0);
    expect(metrics.averageAbsDelta.calibrated).toBeNull();
  });

  it('раскладывает уровни по категориям', async () => {
    await seedUnevenPlayers();
    await playMatch({ startsAt: new Date(Date.UTC(2026, 7, 1, 10)), favouriteWins: true });

    const metrics = await collectRatingMetrics(testPrisma, { now: NOW });

    expect(metrics.levels.activePlayers).toBe(4);
    expect(metrics.levels.average).toBeCloseTo(3.75, 1);
    expect(Object.values(metrics.levels.byCategory).reduce((a, b) => a + b, 0)).toBe(4);
  });

  it('отмечает дрейф среднего уровня и порог §3.3', async () => {
    await seedUnevenPlayers();
    for (let index = 0; index < 4; index += 1) {
      await playMatch({
        startsAt: new Date(Date.UTC(2026, 7, index + 1, 10)),
        favouriteWins: true,
      });
    }

    const metrics = await collectRatingMetrics(testPrisma, { now: NOW });

    expect(metrics.drift.value).not.toBeNull();
    expect(typeof metrics.drift.overQuarterlyLimit).toBe('boolean');
  });

  it('считает долю оспоренных и неподтверждённых результатов', async () => {
    await seedUnevenPlayers();
    await playMatch({ startsAt: new Date(Date.UTC(2026, 7, 1, 10)), favouriteWins: true });

    // Второй матч со введённым, но не подтверждённым счётом.
    const pending = await testPrisma.match.create({
      data: {
        creatorId: 'm1',
        courtId: await makeCourt('Неподтверждённый'),
        startsAt: new Date(Date.UTC(2026, 7, 2, 10)),
        durationMin: 90,
        isRated: true,
        slotsMissing: 0,
        status: 'FILLED',
        players: { create: FOUR.map((userId) => ({ userId })) },
      },
    });

    await enterMatchResult(testPrisma, {
      matchId: pending.id,
      enteredById: 'm1',
      sets: [
        { a: 6, b: 4 },
        { a: 6, b: 4 },
      ],
      teams: [
        { userId: 'm1', team: 1 },
        { userId: 'm2', team: 1 },
        { userId: 'm3', team: 2 },
        { userId: 'm4', team: 2 },
      ],
      now: new Date(Date.UTC(2026, 7, 2, 10)),
    });

    const metrics = await collectRatingMetrics(testPrisma, { now: NOW });

    expect(metrics.results.total).toBe(2);
    expect(metrics.results.unconfirmedShare).toBeCloseTo(0.5, 10);
    expect(metrics.results.disputedShare).toBe(0);
  });

  it('измеряет расхождение уровня с самооценкой у зрелых игроков', async () => {
    await testPrisma.user.create({
      data: {
        id: 'sandbagger',
        firstName: 'Скромный',
        lastName: 'Игрок',
        level: 4.4,
        startLevel: 3.0,
        selfAssessedLevel: 3.0,
        ratedMatchesCount: 22,
      },
    });

    const metrics = await collectRatingMetrics(testPrisma, { now: NOW });

    expect(metrics.sandbagging.sample).toBe(1);
    expect(metrics.sandbagging.averageGap).toBeCloseTo(1.4, 10);
  });

  it('форматирует отчёт с ключевыми цифрами', async () => {
    await seedUnevenPlayers();
    await playMatch({ startsAt: new Date(Date.UTC(2026, 7, 1, 10)), favouriteWins: true });

    const report = formatMetrics(await collectRatingMetrics(testPrisma, { now: NOW }));

    expect(report).toContain('Качество предсказания');
    expect(report).toContain('Дрейф среднего уровня');
    expect(report).toContain('Ввод результатов');
  });
});
