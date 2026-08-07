import { describe, expect, it } from 'vitest';

import {
  computeIndividualStandings,
  computeTeamStandings,
  type RoundResult,
  type StandingsOptions,
} from './standings.js';

const options: StandingsOptions = { pointsPerRound: 24, restCompensation: 0.5 };

function round(
  roundNumber: number,
  matches: RoundResult['matches'],
  resting: string[] = [],
): RoundResult {
  return { roundNumber, matches, resting };
}

describe('начисление очков (ТЗ §4.2)', () => {
  const table = computeIndividualStandings(
    ['a', 'b', 'c', 'd'],
    [
      round(1, [{ teamA: ['a', 'b'], teamB: ['c', 'd'], scoreA: 20, scoreB: 12 }]),
      round(2, [{ teamA: ['a', 'c'], teamB: ['b', 'd'], scoreA: 18, scoreB: 14 }]),
    ],
    options,
  );

  const row = (id: string) => table.find((r) => r.id === id)!;

  it('оба игрока пары получают очки пары', () => {
    expect(row('a').points).toBe(38);
    expect(row('b').points).toBe(34);
    expect(row('c').points).toBe(30);
    expect(row('d').points).toBe(26);
  });

  it('считает пропущенные очки и разницу', () => {
    expect(row('a').pointsAgainst).toBe(26);
    expect(row('a').pointsDiff).toBe(12);
    expect(row('d').pointsDiff).toBe(-12);
  });

  it('расставляет места по сумме очков', () => {
    expect(table.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(table.map((r) => r.place)).toEqual([1, 2, 3, 4]);
  });

  it('считает сыгранные раунды', () => {
    expect(row('a').playedRounds).toBe(2);
  });
});

describe('компенсация отдыхающим (ТЗ §4.3)', () => {
  it('начисляет половину номинала раунда', () => {
    const table = computeIndividualStandings(
      ['a', 'b', 'c', 'd', 'e', 'f'],
      [round(1, [{ teamA: ['a', 'b'], teamB: ['c', 'd'], scoreA: 24, scoreB: 10 }], ['e', 'f'])],
      options,
    );

    const e = table.find((r) => r.id === 'e')!;
    expect(e.compensationPoints).toBe(12);
    expect(e.points).toBe(12);
    expect(e.restCount).toBe(1);
    expect(e.playedRounds).toBe(0);
  });

  it('выключается нулевой долей', () => {
    const table = computeIndividualStandings(
      ['a', 'b', 'c', 'd', 'e', 'f'],
      [round(1, [{ teamA: ['a', 'b'], teamB: ['c', 'd'], scoreA: 24, scoreB: 10 }], ['e', 'f'])],
      { ...options, restCompensation: 0 },
    );

    expect(table.find((r) => r.id === 'e')!.points).toBe(0);
  });
});

describe('тай-брейки (ТЗ §4.2)', () => {
  it('при равных очках выше тот, у кого лучше разница', () => {
    const table = computeIndividualStandings(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      [
        round(1, [
          { teamA: ['a', 'c'], teamB: ['d', 'e'], scoreA: 20, scoreB: 10 },
          { teamA: ['b', 'f'], teamB: ['g', 'h'], scoreA: 20, scoreB: 15 },
        ]),
        round(2, [
          { teamA: ['a', 'd'], teamB: ['c', 'e'], scoreA: 10, scoreB: 20 },
          { teamA: ['b', 'g'], teamB: ['f', 'h'], scoreA: 10, scoreB: 10 },
        ]),
      ],
      options,
    );

    const a = table.find((r) => r.id === 'a')!;
    const b = table.find((r) => r.id === 'b')!;

    // Оба набрали по 30, но a пропустил 30, а b — только 25.
    expect(a.points).toBe(30);
    expect(b.points).toBe(30);
    expect(a.pointsDiff).toBe(0);
    expect(b.pointsDiff).toBe(5);
    expect(b.place).toBeLessThan(a.place);
  });

  it('при равных очках и разнице решает личная встреча', () => {
    const table = computeIndividualStandings(
      ['a', 'b', 'c', 'd'],
      [
        round(1, [{ teamA: ['a', 'c'], teamB: ['b', 'd'], scoreA: 16, scoreB: 8 }]),
        round(2, [{ teamA: ['b', 'c'], teamB: ['a', 'd'], scoreA: 16, scoreB: 8 }]),
      ],
      options,
    );

    // a и b: по 24 очка и одинаковая разница; в очной встрече раунда 1 победил a
    const a = table.find((r) => r.id === 'a')!;
    const b = table.find((r) => r.id === 'b')!;
    expect(a.points).toBe(b.points);
    expect(a.pointsDiff).toBe(b.pointsDiff);
    expect(a.place).toBeLessThan(b.place);
  });

  it('падает, если в раунде участвует посторонний', () => {
    expect(() =>
      computeIndividualStandings(
        ['a', 'b', 'c', 'd'],
        [round(1, [{ teamA: ['a', 'b'], teamB: ['c', 'x'], scoreA: 20, scoreB: 12 }])],
        options,
      ),
    ).toThrow(/x/);
  });
});

describe('командная таблица (ТЗ §4.4)', () => {
  it('считает очки команд целиком', () => {
    const table = computeTeamStandings(
      ['t1', 't2', 't3'],
      [
        {
          roundNumber: 1,
          matches: [{ teamA: 't1', teamB: 't2', scoreA: 21, scoreB: 15 }],
          resting: ['t3'],
        },
        {
          roundNumber: 2,
          matches: [{ teamA: 't1', teamB: 't3', scoreA: 10, scoreB: 21 }],
          resting: ['t2'],
        },
      ],
      { pointsPerRound: 21, restCompensation: 0.5 },
    );

    expect(table.find((r) => r.id === 't1')!.points).toBe(31);
    expect(table.find((r) => r.id === 't3')!.points).toBe(31.5);
    expect(table.find((r) => r.id === 't2')!.points).toBe(25.5);
    expect(table[0]!.id).toBe('t3');
  });
});
