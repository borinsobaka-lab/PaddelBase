import { describe, expect, it } from 'vitest';

import { generateMexicanoRound, type MexicanoParticipant } from './mexicano.js';

function participant(
  playerId: string,
  overrides: Partial<MexicanoParticipant> = {},
): MexicanoParticipant {
  return { playerId, points: 0, pointsDiff: 0, restCount: 0, level: 3.0, ...overrides };
}

/** a — сильнейший, h — слабейший. */
const byLevel = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, index) =>
  participant(id, { level: 8 - index }),
);

describe('посев первого раунда (ТЗ §4.3)', () => {
  const round = generateMexicanoRound({
    roundNumber: 1,
    participants: byLevel,
    courtsCount: 2,
    seed: 'seed',
  });

  it('ставит на корт четвёрку по уровню и разводит её как 1+4 против 2+3', () => {
    expect(round.matches).toEqual([
      { courtNumber: 1, teamA: ['a', 'd'], teamB: ['b', 'c'] },
      { courtNumber: 2, teamA: ['e', 'h'], teamB: ['f', 'g'] },
    ]);
  });

  it('без посева по уровню раскладывает жеребьёвкой от seed', () => {
    const drawn = generateMexicanoRound({
      roundNumber: 1,
      participants: byLevel,
      courtsCount: 2,
      seed: 'seed',
      seedFirstRoundByLevel: false,
    });

    expect(drawn.matches).not.toEqual(round.matches);
    expect(drawn.matches.flatMap((m) => [...m.teamA, ...m.teamB]).sort()).toEqual([
      'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',
    ]);
  });
});

describe('раунды со второго (ТЗ §4.3)', () => {
  it('сортирует по очкам, а не по уровню', () => {
    // Уровни возрастают к концу алфавита, очки — наоборот.
    const standings = ['a', 'b', 'c', 'd'].map((id, index) =>
      participant(id, { points: (4 - index) * 10, level: index + 1 }),
    );

    const round = generateMexicanoRound({
      roundNumber: 2,
      participants: standings,
      courtsCount: 1,
      seed: 'seed',
    });

    expect(round.matches).toEqual([{ courtNumber: 1, teamA: ['a', 'd'], teamB: ['b', 'c'] }]);
  });

  it('разрешает равенство очков разницей, затем уровнем, затем id', () => {
    const standings = [
      participant('x', { points: 20, pointsDiff: 2, level: 3 }),
      participant('y', { points: 20, pointsDiff: 8, level: 3 }),
      participant('z', { points: 20, pointsDiff: 2, level: 5 }),
      participant('w', { points: 20, pointsDiff: 2, level: 3 }),
    ];

    const round = generateMexicanoRound({
      roundNumber: 2,
      participants: standings,
      courtsCount: 1,
      seed: 'seed',
    });

    // y (лучшая разница) → z (тот же diff, выше уровень) → w, x (по id)
    expect(round.matches).toEqual([{ courtNumber: 1, teamA: ['y', 'x'], teamB: ['z', 'w'] }]);
  });

  it('детерминирован: один и тот же вход даёт ту же сетку', () => {
    const input = {
      roundNumber: 3,
      participants: byLevel,
      courtsCount: 2,
      seed: 'seed',
    } as const;

    expect(generateMexicanoRound(input)).toEqual(generateMexicanoRound(input));
  });
});

describe('отдыхающие', () => {
  const ten = Array.from({ length: 10 }, (_, index) =>
    participant(`p${index}`, { points: (10 - index) * 10 }),
  );

  it('при равных пропусках отдыхает низ таблицы', () => {
    const round = generateMexicanoRound({
      roundNumber: 2,
      participants: ten,
      courtsCount: 2,
      seed: 'seed',
    });

    expect(round.resting).toEqual(['p8', 'p9']);
    expect(round.matches).toHaveLength(2);
  });

  it('выравнивание пропусков важнее положения в таблице', () => {
    // Двое из низа уже отдыхали — теперь очередь тех, кто ещё не пропускал.
    const withRests = ten.map((p) =>
      p.playerId === 'p8' || p.playerId === 'p9' ? { ...p, restCount: 1 } : p,
    );

    const round = generateMexicanoRound({
      roundNumber: 2,
      participants: withRests,
      courtsCount: 2,
      seed: 'seed',
    });

    expect(round.resting).toEqual(['p6', 'p7']);
  });

  it('не отправляет отдыхать, если кортов хватает на всех', () => {
    const round = generateMexicanoRound({
      roundNumber: 2,
      participants: byLevel,
      courtsCount: 2,
      seed: 'seed',
    });

    expect(round.resting).toEqual([]);
  });

  it('ограничивает число кортов числом игроков', () => {
    const round = generateMexicanoRound({
      roundNumber: 1,
      participants: byLevel.slice(0, 6),
      courtsCount: 4,
      seed: 'seed',
    });

    expect(round.matches).toHaveLength(1);
    expect(round.resting).toHaveLength(2);
  });
});

describe('валидация', () => {
  it('требует минимум четырёх игроков', () => {
    expect(() =>
      generateMexicanoRound({
        roundNumber: 1,
        participants: byLevel.slice(0, 3),
        courtsCount: 1,
        seed: 's',
      }),
    ).toThrow(/минимум 4/);
  });

  it('не принимает дубликаты', () => {
    expect(() =>
      generateMexicanoRound({
        roundNumber: 1,
        participants: [...byLevel.slice(0, 3), participant('a')],
        courtsCount: 1,
        seed: 's',
      }),
    ).toThrow(/дубликаты/);
  });
});
