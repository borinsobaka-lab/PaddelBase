import { describe, expect, it } from 'vitest';

import { RATING_CONFIG, withOverrides } from './config.js';
import { computeMatchDeltas, expectedScore, resolveK, resolveRepeatWeight } from './match.js';
import type { MatchRatingInput, PlayerSnapshot } from './types.js';

/**
 * Контрольные кейсы ТЗ §3.7 посчитаны при D = 1.0. Продуктовый дефолт с тех пор
 * изменён на 2.0 (см. docs/decisions.md §3), поэтому эти кейсы прогоняются с
 * явным D = 1.0: они остаются якорем самой формулы, а не текущих констант.
 */
const TZ_CONFIG = withOverrides({ D: 1.0 });

/**
 * Контрольные кейсы из ТЗ §3.7.
 *
 * В ТЗ фикстура описана как «2 сета, счёт по геймам 6:3». Девяти геймов в двух
 * сетах не бывает; числа в ТЗ посчитаны при W_duration = 1.0 (два сета) и
 * счёте 6:3, поэтому фикстура сохранена как есть — она синтетическая и служит
 * якорем для формулы, а не примером реального матча.
 */
const p1: PlayerSnapshot = { id: 'p1', level: 3.5, reliability: 0.9 };
const p2: PlayerSnapshot = { id: 'p2', level: 4.0, reliability: 0.3 };
const p3: PlayerSnapshot = { id: 'p3', level: 3.5, reliability: 0.9 };
const p4: PlayerSnapshot = { id: 'p4', level: 3.0, reliability: 0.9 };

function baseInput(overrides: Partial<MatchRatingInput> = {}): MatchRatingInput {
  return {
    teamA: [p1, p2],
    teamB: [p3, p4],
    scoreA: 6,
    scoreB: 3,
    winner: 'A',
    format: 'match',
    duration: 'twoSets',
    repeatCount: 1,
    ...overrides,
  };
}

function levelsById(deltas: { playerId: string; levelAfter: number }[]): Record<string, number> {
  return Object.fromEntries(deltas.map((d) => [d.playerId, d.levelAfter]));
}

describe('ТЗ §3.7 — контрольный кейс 1: ожидаемая победа (D = 1.0)', () => {
  const result = computeMatchDeltas(baseInput(), TZ_CONFIG);

  it('считает уровни пар и ожидание', () => {
    expect(result.breakdown.levelA).toBe(3.75);
    expect(result.breakdown.levelB).toBe(3.25);
    expect(result.breakdown.expectedA).toBeCloseTo(0.7597, 4);
  });

  it('считает фактический результат с учётом разгромности', () => {
    expect(result.breakdown.gameShareA).toBeCloseTo(0.6667, 4);
    expect(result.breakdown.actualA).toBeCloseTo(0.8333, 4);
  });

  it('даёт уровни из ТЗ', () => {
    expect(levelsById(result.deltas)).toEqual({
      p1: 3.507,
      p2: 4.022,
      p3: 3.493,
      p4: 2.993,
    });
  });

  it('двигает некалиброванного партнёра втрое сильнее калиброванного', () => {
    const byId = Object.fromEntries(result.deltas.map((d) => [d.playerId, d.delta]));
    // K = 0.298 против 0.094 — отношение ≈ 3.17, после округления до 3 знаков ≈ 3.14
    expect(byId.p2! / byId.p1!).toBeGreaterThan(2.9);
    expect(byId.p2! / byId.p1!).toBeLessThan(3.4);
  });
});

describe('ТЗ §3.7 — контрольный кейс 2: апсет (D = 1.0)', () => {
  const result = computeMatchDeltas(baseInput({ scoreA: 3, scoreB: 6, winner: 'B' }), TZ_CONFIG);

  it('даёт уровни из ТЗ', () => {
    expect(result.breakdown.actualA).toBeCloseTo(0.1667, 4);
    expect(levelsById(result.deltas)).toMatchObject({
      p1: 3.444,
      p2: 3.823,
      p4: 3.056,
    });
  });
});

describe('надёжность на границах', () => {
  it('reliability = 0 даёт K_MAX', () => {
    expect(resolveK(0)).toBeCloseTo(RATING_CONFIG.K_MAX, 10);
  });

  it('reliability = 1 даёт K_MIN', () => {
    expect(resolveK(1)).toBeCloseTo(RATING_CONFIG.K_MIN, 10);
  });

  it('полностью откалиброванный игрок двигается заметно меньше новичка', () => {
    const rookie = computeMatchDeltas(
      baseInput({ teamA: [{ ...p1, reliability: 0 }, p2] }),
    ).deltas.find((d) => d.playerId === 'p1')!;
    const veteran = computeMatchDeltas(
      baseInput({ teamA: [{ ...p1, reliability: 1 }, p2] }),
    ).deltas.find((d) => d.playerId === 'p1')!;

    expect(Math.abs(rookie.delta)).toBeGreaterThan(Math.abs(veteran.delta) * 5);
  });
});

describe('клампы', () => {
  it('ограничивает шаг некалиброванного игрока величиной MAX_STEP_CALIBRATING', () => {
    const weak: PlayerSnapshot = { id: 'w1', level: 1.0, reliability: 0 };
    const result = computeMatchDeltas({
      teamA: [weak, { ...weak, id: 'w2' }],
      teamB: [
        { id: 's1', level: 5.0, reliability: 1 },
        { id: 's2', level: 5.0, reliability: 1 },
      ],
      scoreA: 12,
      scoreB: 0,
      winner: 'A',
      format: 'match',
      duration: 'twoSets',
      repeatCount: 1,
    });

    const w1 = result.deltas.find((d) => d.playerId === 'w1')!;
    expect(w1.delta).toBe(RATING_CONFIG.MAX_STEP_CALIBRATING);
    expect(w1.levelAfter).toBe(1.25);
  });

  it('не выпускает уровень за верхнюю границу шкалы', () => {
    const top: PlayerSnapshot = { id: 'top', level: 7.0, reliability: 0 };
    const result = computeMatchDeltas({
      teamA: [top, { ...top, id: 'top2' }],
      teamB: [
        { id: 'low1', level: 6.9, reliability: 0 },
        { id: 'low2', level: 6.9, reliability: 0 },
      ],
      scoreA: 12,
      scoreB: 0,
      winner: 'A',
      format: 'match',
      duration: 'twoSets',
      repeatCount: 1,
    });

    const top1 = result.deltas.find((d) => d.playerId === 'top')!;
    expect(top1.levelAfter).toBe(RATING_CONFIG.SCALE_MAX);
    expect(top1.levelBefore + top1.delta).toBe(top1.levelAfter);
  });

  it('не выпускает уровень за нижнюю границу шкалы', () => {
    const bottom: PlayerSnapshot = { id: 'b1', level: 0.0, reliability: 0 };
    const result = computeMatchDeltas({
      teamA: [bottom, { ...bottom, id: 'b2' }],
      teamB: [
        { id: 'x1', level: 0.1, reliability: 0 },
        { id: 'x2', level: 0.1, reliability: 0 },
      ],
      scoreA: 0,
      scoreB: 12,
      winner: 'B',
      format: 'match',
      duration: 'twoSets',
      repeatCount: 1,
    });

    expect(result.deltas.find((d) => d.playerId === 'b1')!.levelAfter).toBe(RATING_CONFIG.SCALE_MIN);
  });
});

describe('защита от накрутки (ТЗ §3.5)', () => {
  const strongVsWeak = (scoreA: number, scoreB: number): MatchRatingInput => ({
    teamA: [
      { id: 's1', level: 5.0, reliability: 0.3 },
      { id: 's2', level: 5.0, reliability: 0.3 },
    ],
    teamB: [
      { id: 'w1', level: 3.0, reliability: 0.3 },
      { id: 'w2', level: 3.0, reliability: 0.3 },
    ],
    scoreA,
    scoreB,
    winner: scoreA > scoreB ? 'A' : 'B',
    format: 'match',
    duration: 'twoSets',
    repeatCount: 1,
  });

  it('демпфирует прирост сильной пары при разрыве больше GAP_LIMIT', () => {
    // gap = 2.0, GAP_LIMIT = 1.5 → W_gap = max(0.15, 1 − 0.5) = 0.5
    const result = computeMatchDeltas(strongVsWeak(12, 0));
    expect(result.breakdown.wGapA).toBe(0.5);
  });

  it('засчитывает поражение сильной пары с полным весом', () => {
    const result = computeMatchDeltas(strongVsWeak(0, 12));
    expect(result.breakdown.wGapA).toBe(1);
    expect(result.deltas.find((d) => d.playerId === 's1')!.delta).toBeLessThan(0);
  });

  it('не демпфирует прирост слабой пары', () => {
    const result = computeMatchDeltas(strongVsWeak(0, 12));
    expect(result.breakdown.wGapB).toBe(1);
  });

  it('снижает вес повторных встреч по таблице ТЗ', () => {
    expect([1, 2, 3, 4, 5, 9].map((n) => resolveRepeatWeight(n))).toEqual([
      1.0, 0.85, 0.7, 0.55, 0.4, 0.4,
    ]);
  });

  it('уменьшает дельту пропорционально W_repeat', () => {
    const first = computeMatchDeltas(baseInput({ repeatCount: 1 }));
    const fifth = computeMatchDeltas(baseInput({ repeatCount: 5 }));
    const deltaOf = (r: typeof first) => r.deltas.find((d) => d.playerId === 'p2')!.delta;

    expect(deltaOf(fifth)).toBeCloseTo(deltaOf(first) * 0.4, 3);
  });
});

/**
 * Главное продуктовое свойство шкалы: обычная победа не должна снижать рейтинг.
 *
 * Оно определяется парой D и W_WIN. При D = 1.0 из ТЗ фаворит, сильнее соперника
 * на 1.0 уровня, терял рейтинг за победу 6:3, 6:4 — для «оправдания ожиданий»
 * ему требовалась доля геймов, недостижимая на практике. Рабочее значение D = 2.0
 * это чинит, сохраняя защиту от фарма слабых при больших разрывах.
 */
describe('фаворит и обычная победа', () => {
  const favouriteWins = (
    gap: number,
    scoreA: number,
    scoreB: number,
    config = RATING_CONFIG,
  ): number =>
    computeMatchDeltas(
      {
        teamA: [
          { id: 'f1', level: 3.0 + gap, reliability: 0.9 },
          { id: 'f2', level: 3.0 + gap, reliability: 0.9 },
        ],
        teamB: [
          { id: 'u1', level: 3.0, reliability: 0.9 },
          { id: 'u2', level: 3.0, reliability: 0.9 },
        ],
        scoreA,
        scoreB,
        winner: 'A',
        format: 'match',
        duration: 'twoSets',
        repeatCount: 1,
      },
      config,
    ).deltas.find((d) => d.playerId === 'f1')!.delta;

  // 6:4, 6:4 — самая заурядная победа в двух сетах.
  for (const gap of [0.25, 0.5, 0.75, 1.0]) {
    it(`разрыв ${gap.toFixed(2)}: победа 6:4, 6:4 не снижает рейтинг`, () => {
      expect(favouriteWins(gap, 12, 8)).toBeGreaterThan(0);
    });
  }

  it('при D = 1.0 из ТЗ та же победа при разрыве 1.0 снижала рейтинг', () => {
    expect(favouriteWins(1.0, 12, 8, TZ_CONFIG)).toBeLessThan(0);
  });

  it('при большом разрыве обычной победы уже недостаточно — фарм слабых не окупается', () => {
    // Разрыв 2.0: чтобы выйти в плюс, нужно не меньше 6:1, 6:1.
    expect(favouriteWins(2.0, 12, 8)).toBeLessThan(0);
    expect(favouriteWins(2.0, 12, 2)).toBeGreaterThan(0);
  });

  it('апсет остаётся сильным сигналом: аутсайдер получает заметно больше', () => {
    const underdogGain = computeMatchDeltas({
      teamA: [
        { id: 'u1', level: 3.0, reliability: 0.9 },
        { id: 'u2', level: 3.0, reliability: 0.9 },
      ],
      teamB: [
        { id: 'f1', level: 4.0, reliability: 0.9 },
        { id: 'f2', level: 4.0, reliability: 0.9 },
      ],
      scoreA: 12,
      scoreB: 8,
      winner: 'A',
      format: 'match',
      duration: 'twoSets',
      repeatCount: 1,
    }).deltas.find((d) => d.playerId === 'u1')!.delta;

    expect(underdogGain).toBeGreaterThan(favouriteWins(1.0, 12, 8) * 5);
  });
});

describe('чистота и воспроизводимость', () => {
  it('одинаковый вход даёт побайтово одинаковый результат', () => {
    expect(computeMatchDeltas(baseInput())).toEqual(computeMatchDeltas(baseInput()));
  });

  it('не мутирует вход', () => {
    const input = baseInput();
    const before = structuredClone(input);
    computeMatchDeltas(input);
    expect(input).toEqual(before);
  });

  it('levelBefore + delta точно равно levelAfter (устойчивость к round-trip через decimal(4,3))', () => {
    for (const delta of computeMatchDeltas(baseInput()).deltas) {
      expect(Math.round((delta.levelBefore + delta.delta) * 1000)).toBe(
        Math.round(delta.levelAfter * 1000),
      );
    }
  });

  it('ничья учитывается как половина веса победы', () => {
    const draw = computeMatchDeltas(baseInput({ scoreA: 12, scoreB: 12, winner: 'draw' }));
    expect(draw.breakdown.actualA).toBeCloseTo(0.5, 10);
  });
});

describe('вспомогательные формулы', () => {
  it('ожидание симметрично', () => {
    expect(expectedScore(3.0, 4.0) + expectedScore(4.0, 3.0)).toBeCloseTo(1, 10);
  });

  it('при рабочем D = 2.0 разница в 1.0 уровня даёт ожидание ≈ 0.76', () => {
    expect(expectedScore(4.0, 3.0)).toBeCloseTo(0.76, 2);
  });

  it('при D = 1.0 из ТЗ та же разница давала ≈ 0.91', () => {
    expect(expectedScore(4.0, 3.0, TZ_CONFIG)).toBeCloseTo(0.909, 3);
  });
});
