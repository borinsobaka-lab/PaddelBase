import { describe, expect, it } from 'vitest';

import { RATING_CONFIG } from './config.js';
import {
  applyRatedMatch,
  decayReliability,
  effectiveReliability,
  initialReliability,
  initialReliabilityState,
  isCalibrated,
  matchesUntilCalibrated,
  type ReliabilityState,
} from './reliability.js';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-01-01T12:00:00Z');
const at = (days: number) => new Date(T0.getTime() + days * DAY);

describe('стартовое состояние', () => {
  it('новичок после анкеты имеет надёжность 0.05', () => {
    expect(initialReliability()).toBe(0.05);
  });

  it('без сыгранных матчей надёжность не меняется со временем', () => {
    const state = initialReliabilityState();
    expect(effectiveReliability(state, at(1000))).toBe(0.05);
  });
});

describe('рост надёжности', () => {
  it('растёт на 1/N_FULL за каждый зачтённый матч', () => {
    let state = initialReliabilityState();
    state = applyRatedMatch(state, at(1));
    expect(state.reliabilityBase).toBe(0.1);
    expect(state.ratedMatchesCount).toBe(1);

    state = applyRatedMatch(state, at(2));
    expect(state.reliabilityBase).toBe(0.15);
  });

  it('достигает порога калибровки на 11-м матче и никогда не превышает 1.0', () => {
    let state = initialReliabilityState();
    for (let i = 1; i <= 11; i += 1) state = applyRatedMatch(state, at(i));
    expect(state.reliabilityBase).toBe(0.6);
    expect(isCalibrated(state.reliabilityBase)).toBe(true);

    for (let i = 12; i <= 40; i += 1) state = applyRatedMatch(state, at(i));
    expect(state.reliabilityBase).toBe(1);
  });

  it('считает, сколько матчей осталось до подтверждения уровня', () => {
    expect(matchesUntilCalibrated(0.05)).toBe(11);
    expect(matchesUntilCalibrated(0.5)).toBe(2);
    expect(matchesUntilCalibrated(0.6)).toBe(0);
  });
});

describe('затухание при простое (ТЗ §3.4)', () => {
  const played: ReliabilityState = {
    reliabilityBase: 1.0,
    lastRatedMatchAt: T0,
    ratedMatchesCount: 20,
  };

  it('первые 60 дней простоя ничего не меняют', () => {
    expect(effectiveReliability(played, at(60))).toBe(1);
  });

  it('после 60 дней теряет 0.015 за неделю', () => {
    expect(effectiveReliability(played, at(60 + 14))).toBe(0.97);
    expect(effectiveReliability(played, at(60 + 70))).toBe(0.85);
  });

  it('не опускается ниже пола 0.30', () => {
    expect(effectiveReliability(played, at(10_000))).toBe(RATING_CONFIG.RELIABILITY_FLOOR);
  });

  it('не поднимает надёжность новичка до пола', () => {
    const rookie: ReliabilityState = {
      reliabilityBase: 0.05,
      lastRatedMatchAt: T0,
      ratedMatchesCount: 1,
    };
    expect(effectiveReliability(rookie, at(10_000))).toBe(0.05);
  });

  /**
   * Ключевое свойство: затухание не накапливается в поле, а вычисляется.
   * Поэтому повторный вызов (или повторный запуск фоновой задачи) ничего
   * не портит, и требование полного пересчёта истории (§3.10) выполнимо.
   */
  it('идемпотентно: значение зависит только от (base, lastRatedMatchAt, now)', () => {
    const first = effectiveReliability(played, at(200));

    // Повторный вызов — как повторный прогон фоновой задачи в тот же день.
    expect(effectiveReliability(played, at(200))).toBe(first);
    // И то же самое, посчитанное напрямую от числа дней простоя.
    expect(decayReliability(played.reliabilityBase, 200)).toBe(first);
  });
});

describe('возвращение после перерыва', () => {
  it('надёжность восстанавливается постепенно, а не одним матчем', () => {
    const veteran: ReliabilityState = {
      reliabilityBase: 1.0,
      lastRatedMatchAt: T0,
      ratedMatchesCount: 30,
    };

    // 4 месяца простоя: 120 дней → (120 − 60)/7 ≈ 8.57 недели → −0.129
    const afterBreak = effectiveReliability(veteran, at(120));
    expect(afterBreak).toBeCloseTo(0.871, 3);

    const resumed = applyRatedMatch(veteran, at(120));
    expect(resumed.reliabilityBase).toBeCloseTo(0.921, 3);
    expect(resumed.reliabilityBase).toBeLessThan(1);
  });
});
