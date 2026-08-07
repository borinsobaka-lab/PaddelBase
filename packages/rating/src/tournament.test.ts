import { describe, expect, it } from 'vitest';

import { RATING_CONFIG } from './config.js';
import { computeMatchDeltas } from './match.js';
import { computeTournamentDeltas } from './tournament.js';
import type { PlayerSnapshot, TournamentRatingInput, TournamentRoundInput } from './types.js';

const player = (id: string, level: number, reliability: number): PlayerSnapshot => ({
  id,
  level,
  reliability,
});

const round = (
  roundNumber: number,
  teamA: [string, string],
  teamB: [string, string],
  scoreA: number,
  scoreB: number,
): TournamentRoundInput => ({ roundNumber, teamA, teamB, scoreA, scoreB });

function americano(overrides: Partial<TournamentRatingInput> = {}): TournamentRatingInput {
  return {
    format: 'americano',
    duration: 'oneSet',
    levelsAtStart: [
      player('a', 3.0, 0.9),
      player('b', 3.0, 0.9),
      player('c', 3.0, 0.9),
      player('d', 3.0, 0.9),
    ],
    rounds: [round(1, ['a', 'b'], ['c', 'd'], 24, 10), round(2, ['a', 'c'], ['b', 'd'], 24, 12)],
    ...overrides,
  };
}

describe('турнир считается от снимка уровней на старте (ТЗ §3.6)', () => {
  it('второй раунд использует стартовые уровни, а не результат первого', () => {
    const result = computeTournamentDeltas(americano());

    // После разгрома в первом раунде «a» реально сильнее, но для второго
    // раунда его уровень обязан остаться стартовым — иначе снежный ком.
    expect(result.perRound[0]!.breakdown.levelA).toBe(3.0);
    expect(result.perRound[1]!.breakdown.levelA).toBe(3.0);
    expect(result.perRound[1]!.breakdown.expectedA).toBeCloseTo(0.5, 10);
  });

  it('раунд, посчитанный в одиночку, даёт тот же результат, что и внутри турнира', () => {
    const input = americano();
    const tournament = computeTournamentDeltas(input);

    const standalone = computeMatchDeltas({
      teamA: [player('a', 3.0, 0.9), player('c', 3.0, 0.9)],
      teamB: [player('b', 3.0, 0.9), player('d', 3.0, 0.9)],
      scoreA: 24,
      scoreB: 12,
      winner: 'A',
      format: 'americano',
      duration: 'oneSet',
      repeatCount: 1,
    });

    expect(tournament.perRound[1]!.deltas).toEqual(standalone.deltas);
  });

  it('суммирует раундовые дельты игрока', () => {
    const result = computeTournamentDeltas(americano());
    const a = result.deltas.find((d) => d.playerId === 'a')!;

    const perRoundSum = result.perRound
      .flatMap((r) => r.deltas)
      .filter((d) => d.playerId === 'a')
      .reduce((sum, d) => sum + d.delta, 0);

    expect(a.playedRounds).toBe(2);
    expect(a.rawDelta).toBeCloseTo(perRoundSum, 10);
    expect(a.levelAfter).toBe(3.0 + a.delta);
  });
});

describe('ограничение суммарного шага за турнир', () => {
  const grind = (reliability: number) =>
    computeTournamentDeltas(
      americano({
        levelsAtStart: [
          player('a', 3.0, reliability),
          player('b', 3.0, 0.9),
          player('c', 3.0, 0.9),
          player('d', 3.0, 0.9),
        ],
        rounds: Array.from({ length: 10 }, (_, i) => round(i + 1, ['a', 'b'], ['c', 'd'], 24, 6)),
      }),
    );

  it('обрезает суммарную дельту некалиброванного игрока потолком турнира', () => {
    const a = grind(0.05).deltas.find((d) => d.playerId === 'a')!;

    expect(a.rawDelta).toBeGreaterThan(RATING_CONFIG.MAX_TOURNAMENT_STEP_CALIBRATING);
    expect(a.wasClamped).toBe(true);
    expect(a.delta).toBe(RATING_CONFIG.MAX_TOURNAMENT_STEP_CALIBRATING);
    expect(a.levelAfter).toBe(3.35);
  });

  it('у калиброванного игрока потолок ниже', () => {
    const a = grind(0.9).deltas.find((d) => d.playerId === 'a')!;
    expect(Math.abs(a.delta)).toBeLessThanOrEqual(RATING_CONFIG.MAX_TOURNAMENT_STEP_RELIABLE);
  });
});

describe('отдыхающие', () => {
  it('не получают рейтингового события за пропущенные раунды', () => {
    const result = computeTournamentDeltas(
      americano({
        levelsAtStart: [
          player('a', 3.0, 0.9),
          player('b', 3.0, 0.9),
          player('c', 3.0, 0.9),
          player('d', 3.0, 0.9),
          player('resting', 3.0, 0.9),
        ],
      }),
    );

    expect(result.deltas.map((d) => d.playerId).sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('валидация входа', () => {
  it('падает, если в раунде участвует игрок вне снимка', () => {
    expect(() =>
      computeTournamentDeltas(
        americano({ rounds: [round(1, ['a', 'ghost'], ['c', 'd'], 24, 10)] }),
      ),
    ).toThrow(/ghost/);
  });

  it('падает на дубликате в снимке уровней', () => {
    expect(() =>
      computeTournamentDeltas(
        americano({
          levelsAtStart: [player('a', 3.0, 0.9), player('a', 3.5, 0.9), player('c', 3.0, 0.9), player('d', 3.0, 0.9)],
        }),
      ),
    ).toThrow(/дважды/);
  });
});

describe('чистота', () => {
  it('одинаковый вход даёт одинаковый результат', () => {
    expect(computeTournamentDeltas(americano())).toEqual(computeTournamentDeltas(americano()));
  });

  it('ничья в раунде не даёт преимущества ни одной паре', () => {
    const result = computeTournamentDeltas(
      americano({ rounds: [round(1, ['a', 'b'], ['c', 'd'], 12, 12)] }),
    );

    expect(result.perRound[0]!.breakdown.actualA).toBeCloseTo(0.5, 10);
    expect(result.deltas.every((d) => d.delta === 0)).toBe(true);
  });
});
