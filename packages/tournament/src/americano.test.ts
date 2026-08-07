import { describe, expect, it } from 'vitest';

import {
  analyzeSchedule,
  defaultAmericanoRounds,
  fullRotationMatchCount,
  generateAmericanoSchedule,
} from './americano.js';
import type { ScheduledRound } from './types.js';

const players = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `p${String(index + 1).padStart(2, '0')}`);

function partnerPairs(rounds: readonly ScheduledRound[]): string[] {
  return rounds.flatMap((round) =>
    round.matches.flatMap((match) =>
      [match.teamA, match.teamB].map((team) => [...team].sort().join('+')),
    ),
  );
}

function playersOfRound(round: ScheduledRound): string[] {
  return round.matches.flatMap((match) => [...match.teamA, ...match.teamB]);
}

describe('полная ротация Американо (ТЗ §11)', () => {
  for (const count of [8, 12, 16, 20]) {
    describe(`${count} игроков`, () => {
      const ids = players(count);
      const rounds = generateAmericanoSchedule({
        playerIds: ids,
        courtsCount: count / 4,
        seed: 'tournament-seed',
      });

      it(`даёт ${count - 1} раундов по умолчанию`, () => {
        expect(defaultAmericanoRounds(count)).toBe(count - 1);
        expect(rounds).toHaveLength(count - 1);
      });

      it('никто не оказывается в паре дважды', () => {
        const pairs = partnerPairs(rounds);
        expect(new Set(pairs).size).toBe(pairs.length);
        expect(analyzeSchedule(rounds, ids).isPerfectPartnerRotation).toBe(true);
      });

      it('каждый сыграл в паре с каждым', () => {
        expect(new Set(partnerPairs(rounds)).size).toBe((count * (count - 1)) / 2);
      });

      it(`даёт ${fullRotationMatchCount(count)} матчей`, () => {
        expect(rounds.flatMap((round) => round.matches)).toHaveLength(fullRotationMatchCount(count));
      });

      it('в каждом раунде играют все и ровно по одному разу', () => {
        for (const round of rounds) {
          const onCourt = playersOfRound(round);
          expect(onCourt).toHaveLength(count);
          expect(new Set(onCourt).size).toBe(count);
          expect(round.resting).toEqual([]);
        }
      });

      /**
       * Идеальная сетка (whist tournament) даёт ровно 2 встречи с каждым, но она
       * существует не для всякого n и строится нетривиально. Планировщик
       * гарантирует полноту ротации партнёров, а по соперникам выбирает лучшую
       * из перебранных факторизаций. Порог держим как контракт: если он поедет
       * вверх, тест это покажет.
       */
      it('соперники повторяются не больше четырёх раз', () => {
        expect(analyzeSchedule(rounds, ids).maxOpponentRepeat).toBeLessThanOrEqual(4);
      });
    });
  }
});

describe('качество ротации на типичных размерах', () => {
  // 8 и 12 игроков — самые частые Американо. Круговой метод даёт здесь 4 повтора,
  // поиск по факторизациям — 3. Тест закрепляет выигрыш, чтобы он не потерялся.
  for (const count of [8, 12, 16, 20]) {
    it(`${count} игроков: не больше трёх встреч с одним соперником`, () => {
      const ids = players(count);
      const rounds = generateAmericanoSchedule({
        playerIds: ids,
        courtsCount: count / 4,
        seed: 'tournament-seed',
      });

      expect(analyzeSchedule(rounds, ids).maxOpponentRepeat).toBeLessThanOrEqual(3);
    });
  }

  it('генерация сетки на 32 игрока укладывается в секунду', () => {
    const ids = players(32);
    const started = performance.now();
    generateAmericanoSchedule({ playerIds: ids, courtsCount: 8, seed: 'perf' });
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('усечённый и продлённый турнир', () => {
  it('меньшее число раундов сохраняет полноту ротации', () => {
    const ids = players(12);
    const rounds = generateAmericanoSchedule({
      playerIds: ids,
      courtsCount: 3,
      roundsCount: 5,
      seed: 's',
    });

    expect(rounds).toHaveLength(5);
    expect(analyzeSchedule(rounds, ids).isPerfectPartnerRotation).toBe(true);
  });

  it('за пределами n − 1 раундов партнёры начинают повторяться', () => {
    const ids = players(8);
    const rounds = generateAmericanoSchedule({
      playerIds: ids,
      courtsCount: 2,
      roundsCount: 9,
      seed: 's',
    });

    expect(analyzeSchedule(rounds, ids).maxPartnerRepeat).toBe(2);
  });
});

describe('выравнивание отдыхающих (ТЗ §4.2)', () => {
  const cases = [
    { count: 6, courts: 1, rounds: 7 },
    { count: 10, courts: 2, rounds: 7 },
    { count: 12, courts: 2, rounds: 9 },
    { count: 14, courts: 3, rounds: 11 },
    { count: 9, courts: 2, rounds: 8 },
  ];

  for (const { count, courts, rounds: roundsCount } of cases) {
    it(`${count} игроков на ${courts} кортах: разница отдыхов не больше 1`, () => {
      const ids = players(count);
      const rounds = generateAmericanoSchedule({
        playerIds: ids,
        courtsCount: courts,
        roundsCount,
        seed: 'seed',
      });

      expect(analyzeSchedule(rounds, ids).restSpread).toBeLessThanOrEqual(1);
    });

    it(`${count} игроков на ${courts} кортах: инвариант держится после каждого раунда`, () => {
      const ids = players(count);
      const rounds = generateAmericanoSchedule({
        playerIds: ids,
        courtsCount: courts,
        roundsCount,
        seed: 'seed',
      });

      for (let index = 1; index <= rounds.length; index += 1) {
        expect(analyzeSchedule(rounds.slice(0, index), ids).restSpread).toBeLessThanOrEqual(1);
      }
    });
  }

  it('на каждом корте ровно четыре разных игрока', () => {
    const ids = players(10);
    const rounds = generateAmericanoSchedule({
      playerIds: ids,
      courtsCount: 2,
      roundsCount: 7,
      seed: 'seed',
    });

    for (const round of rounds) {
      expect(round.matches).toHaveLength(2);
      for (const match of round.matches) {
        expect(new Set([...match.teamA, ...match.teamB]).size).toBe(4);
      }
      expect(round.resting).toHaveLength(2);
      expect(new Set([...playersOfRound(round), ...round.resting]).size).toBe(10);
    }
  });

  it('число раундов по умолчанию для некратного четырём числа игроков — 7', () => {
    expect(defaultAmericanoRounds(6)).toBe(7);
    expect(defaultAmericanoRounds(11)).toBe(7);
  });
});

describe('детерминированность', () => {
  it('один и тот же seed даёт одну и ту же сетку', () => {
    const ids = players(12);
    const first = generateAmericanoSchedule({ playerIds: ids, courtsCount: 3, seed: 'alpha' });
    const second = generateAmericanoSchedule({ playerIds: ids, courtsCount: 3, seed: 'alpha' });
    expect(first).toEqual(second);
  });

  it('порядок регистрации не влияет на результат при том же seed', () => {
    const ids = players(8);
    const straight = generateAmericanoSchedule({ playerIds: ids, courtsCount: 2, seed: 'alpha' });
    const shuffled = generateAmericanoSchedule({
      playerIds: [...ids].reverse(),
      courtsCount: 2,
      seed: 'alpha',
    });
    expect(straight).toEqual(shuffled);
  });

  it('разные seed дают разные сетки', () => {
    const ids = players(12);
    const alpha = generateAmericanoSchedule({ playerIds: ids, courtsCount: 3, seed: 'alpha' });
    const beta = generateAmericanoSchedule({ playerIds: ids, courtsCount: 3, seed: 'beta' });
    expect(alpha).not.toEqual(beta);
  });
});

describe('валидация', () => {
  it('требует минимум четырёх игроков', () => {
    expect(() =>
      generateAmericanoSchedule({ playerIds: players(3), courtsCount: 1, seed: 's' }),
    ).toThrow(/минимум 4/);
  });

  it('не принимает дубликаты', () => {
    expect(() =>
      generateAmericanoSchedule({ playerIds: ['a', 'b', 'c', 'a'], courtsCount: 1, seed: 's' }),
    ).toThrow(/дубликаты/);
  });

  it('не создаёт больше кортов, чем помещается игроков', () => {
    const rounds = generateAmericanoSchedule({
      playerIds: players(6),
      courtsCount: 6,
      roundsCount: 3,
      seed: 's',
    });

    for (const round of rounds) expect(round.matches).toHaveLength(1);
  });
});
