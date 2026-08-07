import { RATING_CONFIG, type RatingConfig } from './config.js';

/**
 * Уровень хранится с тремя знаками (decimal(4,3)) и округляется до трёх знаков
 * после каждого расчёта. Это не косметика: без округления в движке значение
 * в памяти и значение, прочитанное из БД, разойдутся, и пересчёт истории
 * перестанет быть идемпотентным (ТЗ §3.10).
 */
export const LEVEL_PRECISION = 3;

/** Знаков после запятой в UI (ТЗ §3.1). */
export const LEVEL_DISPLAY_PRECISION = 2;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function roundTo(value: number, precision: number): number {
  const factor = 10 ** precision;
  // Math.round(-0.5) === -0 в JS, поэтому нормализуем нулевой результат.
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

export function roundLevel(value: number): number {
  return roundTo(value, LEVEL_PRECISION);
}

export function clampLevel(value: number, config: RatingConfig = RATING_CONFIG): number {
  return roundLevel(clamp(value, config.SCALE_MIN, config.SCALE_MAX));
}

/**
 * Строка уровня для UI. Округление идёт через тот же roundTo, что и категория:
 * если пользоваться напрямую toFixed, цифра и буква рядом с ней могут разойтись
 * на граничных значениях, потому что это два разных правила округления.
 */
export function formatLevel(value: number): string {
  return roundTo(value, LEVEL_DISPLAY_PRECISION).toFixed(LEVEL_DISPLAY_PRECISION);
}

export type LevelCategory = 'D' | 'D+' | 'C' | 'C+' | 'B' | 'A';

const CATEGORY_BOUNDS: readonly { upTo: number; category: LevelCategory }[] = [
  { upTo: 1.5, category: 'D' },
  { upTo: 2.2, category: 'D+' },
  { upTo: 3.2, category: 'C' },
  { upTo: 5.0, category: 'C+' },
  { upTo: 6.5, category: 'B' },
];

/**
 * Буквенная категория (ТЗ §3.11). Считается от значения, округлённого до двух
 * знаков, — чтобы категория никогда не противоречила цифре, показанной рядом
 * с ней в интерфейсе.
 */
export function levelCategory(level: number): LevelCategory {
  const displayed = roundTo(level, LEVEL_DISPLAY_PRECISION);
  for (const bound of CATEGORY_BOUNDS) {
    if (displayed <= bound.upTo) return bound.category;
  }
  return 'A';
}
