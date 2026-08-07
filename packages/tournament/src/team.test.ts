import { describe, expect, it } from 'vitest';

import {
  defaultTeamAmericanoRounds,
  generateTeamAmericanoSchedule,
  generateTeamMexicanoRound,
  roundRobinMatchCount,
  type TeamStanding,
} from './team.js';
import type { ScheduledTeamRound } from './types.js';

const teams = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `t${index + 1}`);

function meetings(rounds: readonly ScheduledTeamRound[]): string[] {
  return rounds.flatMap((round) =>
    round.matches.map((match) => [match.teamA, match.teamB].sort().join(' vs ')),
  );
}

describe('командный Американо: round-robin (ТЗ §4.4)', () => {
  it('чётное число команд: каждая играет с каждой ровно один раз', () => {
    const ids = teams(6);
    const rounds = generateTeamAmericanoSchedule({ teamIds: ids, courtsCount: 3, seed: 's' });

    expect(rounds).toHaveLength(defaultTeamAmericanoRounds(6));
    const played = meetings(rounds);
    expect(played).toHaveLength(roundRobinMatchCount(6));
    expect(new Set(played).size).toBe(roundRobinMatchCount(6));
    expect(rounds.every((round) => round.resting.length === 0)).toBe(true);
  });

  it('нечётное число команд: каждый раунд одна отдыхает, встречи не повторяются', () => {
    const ids = teams(5);
    const rounds = generateTeamAmericanoSchedule({ teamIds: ids, courtsCount: 2, seed: 's' });

    expect(rounds).toHaveLength(5);
    const played = meetings(rounds);
    expect(new Set(played).size).toBe(roundRobinMatchCount(5));

    for (const round of rounds) {
      expect(round.matches).toHaveLength(2);
      expect(round.resting).toHaveLength(1);
    }

    // За полный круг каждая команда пропускает ровно один раз.
    const rests = new Map(ids.map((id) => [id, 0]));
    for (const round of rounds) {
      for (const id of round.resting) rests.set(id, rests.get(id)! + 1);
    }
    expect([...rests.values()]).toEqual([1, 1, 1, 1, 1]);
  });

  it('кортов меньше, чем нужно: пропуски выравниваются', () => {
    const ids = teams(8);
    const rounds = generateTeamAmericanoSchedule({
      teamIds: ids,
      courtsCount: 2,
      roundsCount: 7,
      seed: 's',
    });

    const rests = new Map(ids.map((id) => [id, 0]));
    for (const round of rounds) {
      expect(round.matches).toHaveLength(2);
      for (const id of round.resting) rests.set(id, rests.get(id)! + 1);
    }

    const counts = [...rests.values()];
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('детерминирован по seed', () => {
    const ids = teams(6);
    const input = { teamIds: ids, courtsCount: 3, seed: 'alpha' } as const;
    expect(generateTeamAmericanoSchedule(input)).toEqual(generateTeamAmericanoSchedule(input));
  });

  it('требует минимум двух команд', () => {
    expect(() =>
      generateTeamAmericanoSchedule({ teamIds: ['t1'], courtsCount: 1, seed: 's' }),
    ).toThrow(/минимум 2/);
  });
});

describe('командный Мексикано (ТЗ §4.5)', () => {
  const standing = (teamId: string, overrides: Partial<TeamStanding> = {}): TeamStanding => ({
    teamId,
    points: 0,
    pointsDiff: 0,
    restCount: 0,
    level: 3.0,
    ...overrides,
  });

  it('первый раунд сеется по среднему уровню команды', () => {
    const round = generateTeamMexicanoRound({
      roundNumber: 1,
      teams: [
        standing('t1', { level: 2.0 }),
        standing('t2', { level: 4.0 }),
        standing('t3', { level: 3.0 }),
        standing('t4', { level: 1.0 }),
      ],
      courtsCount: 2,
      seed: 's',
    });

    expect(round.matches).toEqual([
      { courtNumber: 1, teamA: 't2', teamB: 't3' },
      { courtNumber: 2, teamA: 't1', teamB: 't4' },
    ]);
  });

  it('во втором раунде играют соседи по таблице', () => {
    const round = generateTeamMexicanoRound({
      roundNumber: 2,
      teams: [
        standing('t1', { points: 40 }),
        standing('t2', { points: 30 }),
        standing('t3', { points: 20 }),
        standing('t4', { points: 10 }),
      ],
      courtsCount: 2,
      seed: 's',
    });

    expect(round.matches).toEqual([
      { courtNumber: 1, teamA: 't1', teamB: 't2' },
      { courtNumber: 2, teamA: 't3', teamB: 't4' },
    ]);
  });

  it('сдвигает соперника, если такая пара уже встречалась', () => {
    const round = generateTeamMexicanoRound({
      roundNumber: 3,
      teams: [
        standing('t1', { points: 40 }),
        standing('t2', { points: 30 }),
        standing('t3', { points: 20 }),
        standing('t4', { points: 10 }),
      ],
      courtsCount: 2,
      seed: 's',
      previousMeetings: [['t1', 't2']],
    });

    expect(round.matches).toEqual([
      { courtNumber: 1, teamA: 't1', teamB: 't3' },
      { courtNumber: 2, teamA: 't2', teamB: 't4' },
    ]);
  });

  it('возвращается к ближайшему сопернику, если сыграно уже со всеми', () => {
    const round = generateTeamMexicanoRound({
      roundNumber: 4,
      teams: [standing('t1', { points: 40 }), standing('t2', { points: 30 })],
      courtsCount: 1,
      seed: 's',
      previousMeetings: [['t1', 't2']],
    });

    expect(round.matches).toEqual([{ courtNumber: 1, teamA: 't1', teamB: 't2' }]);
  });

  it('отправляет отдыхать, если кортов не хватает, и выравнивает пропуски', () => {
    const round = generateTeamMexicanoRound({
      roundNumber: 2,
      teams: [
        standing('t1', { points: 60 }),
        standing('t2', { points: 50 }),
        standing('t3', { points: 40 }),
        standing('t4', { points: 30 }),
        standing('t5', { points: 20 }),
        standing('t6', { points: 10, restCount: 1 }),
      ],
      courtsCount: 2,
      seed: 's',
    });

    // Ниже всех в таблице t5 и t6, но t6 уже пропускал — вместо него отдыхает t4.
    expect(round.resting).toEqual(['t4', 't5']);
    expect(round.matches).toEqual([
      { courtNumber: 1, teamA: 't1', teamB: 't2' },
      { courtNumber: 2, teamA: 't3', teamB: 't6' },
    ]);
  });
});
