import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_WINDOW_MINUTES,
  STALE_RUN_MINUTES,
  refreshReliability,
  runOncePerWindow,
  runScheduledJobs,
  windowKeyFor,
} from './jobs.js';
import { makeCourt, makePlayers, resetDatabase, testDatabaseUrl, testPrisma } from './testDb.js';

const NOW = new Date('2026-08-07T10:07:00Z');

describe('окна выполнения', () => {
  it('округляет момент вниз до границы окна', () => {
    expect(windowKeyFor(new Date('2026-08-07T10:07:00Z'), 15)).toBe('2026-08-07T10:00:00.000Z');
    expect(windowKeyFor(new Date('2026-08-07T10:16:00Z'), 15)).toBe('2026-08-07T10:15:00.000Z');
    expect(windowKeyFor(new Date('2026-08-07T10:59:59Z'), 15)).toBe('2026-08-07T10:45:00.000Z');
  });

  it('соседние моменты одного окна дают один ключ', () => {
    const a = windowKeyFor(new Date('2026-08-07T10:00:01Z'), DEFAULT_WINDOW_MINUTES);
    const b = windowKeyFor(new Date('2026-08-07T10:14:59Z'), DEFAULT_WINDOW_MINUTES);
    expect(a).toBe(b);
  });
});

describe.skipIf(!testDatabaseUrl)('защита от двойного запуска', () => {
  afterAll(async () => {
    if (testDatabaseUrl) await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase();
    await testPrisma.jobRun.deleteMany();
  });

  it('в одном окне задача выполняется ровно один раз', async () => {
    let runs = 0;
    const body = async () => {
      runs += 1;
      return { runs };
    };

    const first = await runOncePerWindow(testPrisma, { job: 'expire-open-matches', now: NOW }, body);
    const second = await runOncePerWindow(
      testPrisma,
      { job: 'expire-open-matches', now: new Date('2026-08-07T10:12:00Z') },
      body,
    );

    expect(first.status).toBe('OK');
    expect(second.status).toBe('SKIPPED');
    expect(runs).toBe(1);
  });

  it('одновременный запуск на нескольких инстансах выполняет тело один раз', async () => {
    let runs = 0;
    const body = async () => {
      runs += 1;
      return null;
    };

    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () =>
        runOncePerWindow(testPrisma, { job: 'auto-confirm-results', now: NOW }, body),
      ),
    );

    expect(runs).toBe(1);
    expect(outcomes.filter((outcome) => outcome.status === 'OK')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'SKIPPED')).toHaveLength(4);
  });

  it('в следующем окне задача выполняется снова', async () => {
    let runs = 0;
    const body = async () => {
      runs += 1;
      return null;
    };

    await runOncePerWindow(testPrisma, { job: 'expire-open-matches', now: NOW }, body);
    await runOncePerWindow(
      testPrisma,
      { job: 'expire-open-matches', now: new Date('2026-08-07T10:20:00Z') },
      body,
    );

    expect(runs).toBe(2);
  });

  it('перехватывает зависший прогон, но не свежий', async () => {
    await testPrisma.jobRun.create({
      data: {
        job: 'expire-open-matches',
        windowKey: windowKeyFor(NOW, DEFAULT_WINDOW_MINUTES),
        startedAt: new Date(NOW.getTime() - 5 * 60 * 1000),
        status: 'RUNNING',
      },
    });

    const fresh = await runOncePerWindow(
      testPrisma,
      { job: 'expire-open-matches', now: NOW },
      async () => null,
    );
    expect(fresh.status).toBe('SKIPPED');

    // Тот же прогон, но начатый заметно раньше порога зависания.
    await testPrisma.jobRun.updateMany({
      where: { job: 'expire-open-matches' },
      data: { startedAt: new Date(NOW.getTime() - (STALE_RUN_MINUTES + 5) * 60 * 1000) },
    });

    const takeover = await runOncePerWindow(
      testPrisma,
      { job: 'expire-open-matches', now: NOW },
      async () => null,
    );
    expect(takeover.status).toBe('OK');
  });

  it('записывает ошибку и не роняет остальные задачи', async () => {
    const outcome = await runOncePerWindow(
      testPrisma,
      { job: 'refresh-reliability', now: NOW },
      async () => {
        throw new Error('Тестовый сбой');
      },
    );

    expect(outcome.status).toBe('FAILED');
    expect(outcome.error).toBe('Тестовый сбой');

    const run = await testPrisma.jobRun.findFirstOrThrow({ where: { job: 'refresh-reliability' } });
    expect(run.status).toBe('FAILED');
    expect(run.error).toBe('Тестовый сбой');
  });
});

describe.skipIf(!testDatabaseUrl)('тик планировщика', () => {
  afterAll(async () => {
    if (testDatabaseUrl) await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase();
    await testPrisma.jobRun.deleteMany();
    await makePlayers(['j1', 'j2', 'j3', 'j4']);
  });

  it('прогоняет все задачи и закрывает просроченную заявку', async () => {
    await testPrisma.match.create({
      data: {
        creatorId: 'j1',
        courtId: await makeCourt('Просроченный'),
        startsAt: new Date('2026-08-06T10:00:00Z'),
        durationMin: 90,
        isRated: true,
        slotsMissing: 2,
        status: 'OPEN',
        players: { create: [{ userId: 'j1' }, { userId: 'j2' }] },
      },
    });

    const outcomes = await runScheduledJobs(testPrisma, NOW);

    expect(outcomes).toHaveLength(5);
    expect(outcomes.every((outcome) => outcome.status === 'OK')).toBe(true);
    expect(outcomes[0]!.details).toEqual({ expired: 1 });
  });

  it('повторный тик в том же окне ничего не выполняет', async () => {
    await runScheduledJobs(testPrisma, NOW);
    const second = await runScheduledJobs(testPrisma, new Date('2026-08-07T10:10:00Z'));

    expect(second.every((outcome) => outcome.status === 'SKIPPED')).toBe(true);
  });
});

describe.skipIf(!testDatabaseUrl)('материализация надёжности', () => {
  afterAll(async () => {
    if (testDatabaseUrl) await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase();
    await testPrisma.jobRun.deleteMany();
  });

  it('подтягивает колонку к вычисленному значению после долгого простоя', async () => {
    await testPrisma.user.create({
      data: {
        id: 'idle',
        firstName: 'Долго',
        lastName: 'Неиграл',
        level: 4.0,
        startLevel: 4.0,
        selfAssessedLevel: 4.0,
        reliabilityBase: 1.0,
        reliability: 1.0,
        ratedMatchesCount: 25,
        lastRatedMatchAt: new Date('2026-04-01T10:00:00Z'),
      },
    });

    const { updated } = await refreshReliability(testPrisma, new Date('2026-08-01T10:00:00Z'));

    expect(updated).toBe(1);
    const user = await testPrisma.user.findUniqueOrThrow({ where: { id: 'idle' } });
    expect(Number(user.reliability)).toBeLessThan(1);
    // Источник истины не тронут: пересчитывается только производная колонка.
    expect(Number(user.reliabilityBase)).toBe(1);
  });

  it('ничего не делает, когда значение уже актуально', async () => {
    await testPrisma.user.create({
      data: {
        id: 'fresh',
        firstName: 'Играл',
        lastName: 'Вчера',
        level: 4.0,
        startLevel: 4.0,
        selfAssessedLevel: 4.0,
        reliabilityBase: 0.8,
        reliability: 0.8,
        ratedMatchesCount: 16,
        lastRatedMatchAt: new Date('2026-08-06T10:00:00Z'),
      },
    });

    expect(await refreshReliability(testPrisma, NOW)).toEqual({ updated: 0 });
  });
});
