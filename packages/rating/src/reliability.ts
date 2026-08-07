import { RATING_CONFIG, type RatingConfig } from './config.js';
import { clamp, roundTo } from './level.js';

/**
 * Надёжность уровня (ТЗ §3.4).
 *
 * Отличие от буквального текста ТЗ и причина этого отличия:
 *
 * 1. В ТЗ рост записан как присваивание `reliability = min(1, n / N_FULL)`,
 *    а затухание — как вычитание. При такой паре формул первый же матч после
 *    перерыва стирает всё накопленное затухание, то есть затухание не работает.
 *    Здесь рост инкрементальный (+1/N_FULL за матч), поэтому после простоя
 *    надёжность восстанавливается постепенно — это выбранное продуктовое
 *    поведение.
 *
 * 2. В ТЗ затухание применяет ежедневная фоновая задача, мутирующая поле.
 *    Тогда состояние зависит от того, в какие дни крон отработал, и требование
 *    полного пересчёта истории (§3.10) становится невыполнимым. Здесь
 *    надёжность — чистая функция от (base, lastRatedMatchAt, now): затухание
 *    не накапливается в поле, а вычисляется. Фоновая задача нужна только для
 *    материализации значения в денормализованную колонку (для сортировок
 *    и выборок), и её пропуск ни на что не влияет.
 */
export const RELIABILITY_PRECISION = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_WEEK = 7;

export interface ReliabilityState {
  /** Надёжность на момент последнего рейтингового события. */
  reliabilityBase: number;
  /** null, пока не сыграно ни одного рейтингового матча. */
  lastRatedMatchAt: Date | null;
  ratedMatchesCount: number;
}

export function roundReliability(value: number): number {
  return roundTo(value, RELIABILITY_PRECISION);
}

/**
 * Надёжность новичка сразу после анкеты (см. RatingConfig.INITIAL_RELIABILITY).
 */
export function initialReliability(config: RatingConfig = RATING_CONFIG): number {
  return roundReliability(config.INITIAL_RELIABILITY);
}

export function initialReliabilityState(config: RatingConfig = RATING_CONFIG): ReliabilityState {
  return {
    reliabilityBase: initialReliability(config),
    lastRatedMatchAt: null,
    ratedMatchesCount: 0,
  };
}

function idleDays(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_DAY;
}

/**
 * Затухание за простой. Порог `min(base, FLOOR)` вместо просто `FLOOR` важен:
 * у новичка надёжность (0.20) заведомо ниже пола (0.30), и без этого простой
 * бы её не понижал, а поднимал.
 */
export function decayReliability(
  base: number,
  days: number,
  config: RatingConfig = RATING_CONFIG,
): number {
  if (days <= config.DECAY_START_DAYS) return roundReliability(base);

  const weeks = (days - config.DECAY_START_DAYS) / DAYS_PER_WEEK;
  const decayed = base - config.DECAY_PER_WEEK * weeks;
  const floor = Math.min(base, config.RELIABILITY_FLOOR);

  return roundReliability(clamp(decayed, floor, 1));
}

/**
 * Текущая надёжность игрока. Единственный источник истины для UI и для движка —
 * денормализованную колонку в БД читать только для сортировок и фильтров.
 */
export function effectiveReliability(
  state: ReliabilityState,
  now: Date,
  config: RatingConfig = RATING_CONFIG,
): number {
  if (state.lastRatedMatchAt === null) return roundReliability(state.reliabilityBase);
  return decayReliability(state.reliabilityBase, idleDays(state.lastRatedMatchAt, now), config);
}

/**
 * Новое состояние после зачтённого рейтингового события. Турнир целиком —
 * одно событие (ТЗ §3.6, п. 6), а не событие на каждый раунд.
 */
export function applyRatedMatch(
  state: ReliabilityState,
  occurredAt: Date,
  config: RatingConfig = RATING_CONFIG,
): ReliabilityState {
  const current = effectiveReliability(state, occurredAt, config);
  return {
    reliabilityBase: roundReliability(Math.min(1, current + 1 / config.N_FULL)),
    lastRatedMatchAt: occurredAt,
    ratedMatchesCount: state.ratedMatchesCount + 1,
  };
}

export function isCalibrated(reliability: number, config: RatingConfig = RATING_CONFIG): boolean {
  return reliability >= config.RELIABLE_THRESHOLD;
}

/** Для подписи «калибровка, ещё N матчей» на главной (ТЗ §5.1). */
export function matchesUntilCalibrated(
  reliability: number,
  config: RatingConfig = RATING_CONFIG,
): number {
  if (isCalibrated(reliability, config)) return 0;
  return Math.ceil((config.RELIABLE_THRESHOLD - reliability) * config.N_FULL);
}
