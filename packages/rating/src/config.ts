/**
 * Все константы рейтинговой системы. ТЗ §3.8.
 *
 * Значения читаются из переменных окружения с дефолтами. Любое изменение
 * значений обязано сопровождаться повышением RATING_CONFIG_VERSION и
 * последующим пересчётом истории (`rating:recompute`), иначе `rating_events`
 * будут содержать несопоставимые между собой записи.
 */

/**
 * Версия конфига. Пишется в каждый RatingEvent (ТЗ §3.10), чтобы можно было
 * отличить события, посчитанные по разным наборам коэффициентов.
 */
export const RATING_CONFIG_VERSION = '1.0.0';

export type MatchFormat = 'match' | 'americano' | 'mexicano' | 'teamTournament';
export type MatchDuration = 'oneSet' | 'twoSets' | 'threeSets';

export interface RatingConfig {
  /** Границы шкалы уровня. */
  SCALE_MIN: number;
  SCALE_MAX: number;
  /**
   * Масштабный делитель в формуле ожидания. Чем меньше — тем круче кривая:
   * при D = 1.0 разница в 1.0 уровня даёт ожидание ≈ 0.91 в пользу сильной пары.
   */
  D: number;
  /**
   * Вес самого факта победы против веса разгромности счёта.
   * При W_WIN = 1.0 система превращается в чистый бинарный Elo.
   */
  W_WIN: number;
  /** Границы индивидуального K-фактора: K_MIN у калиброванного, K_MAX у новичка. */
  K_MIN: number;
  K_MAX: number;
  /** Число рейтинговых матчей до полной надёжности. */
  N_FULL: number;
  /** Порог «уровень подтверждён». */
  RELIABLE_THRESHOLD: number;
  /** Ниже этого значения надёжность не опускается при затухании. */
  RELIABILITY_FLOOR: number;
  /** Простой начинает влиять на надёжность после стольких дней. */
  DECAY_START_DAYS: number;
  /** Сколько надёжности теряется за неделю простоя после DECAY_START_DAYS. */
  DECAY_PER_WEEK: number;
  /** Максимальный шаг уровня за один матч. */
  MAX_STEP_CALIBRATING: number;
  MAX_STEP_RELIABLE: number;
  /** Максимальный суммарный шаг уровня за один турнир (ТЗ §3.6). */
  MAX_TOURNAMENT_STEP_CALIBRATING: number;
  MAX_TOURNAMENT_STEP_RELIABLE: number;
  /** Разрыв в уровне пар, после которого включается защита от фарма слабых. */
  GAP_LIMIT: number;
  W_FORMAT: Record<MatchFormat, number>;
  W_DURATION: Record<MatchDuration, number>;
  /** Индексируется числом матчей с тем же составом за 30 дней (1-based, см. resolveRepeatWeight). */
  W_REPEAT: readonly number[];
  MAX_RATED_MATCHES_PER_DAY: number;
  MIN_GAMES_FOR_RATING: number;
}

function envNumber(key: string, fallback: number): number {
  const raw = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Переменная окружения ${key} должна быть числом, получено: ${raw}`);
  }
  return parsed;
}

export const RATING_CONFIG: RatingConfig = {
  SCALE_MIN: envNumber('RATING_SCALE_MIN', 0.0),
  SCALE_MAX: envNumber('RATING_SCALE_MAX', 7.0),
  D: envNumber('RATING_D', 1.0),
  W_WIN: envNumber('RATING_W_WIN', 0.5),
  K_MIN: envNumber('RATING_K_MIN', 0.06),
  K_MAX: envNumber('RATING_K_MAX', 0.4),
  N_FULL: envNumber('RATING_N_FULL', 20),
  RELIABLE_THRESHOLD: envNumber('RATING_RELIABLE_THRESHOLD', 0.6),
  RELIABILITY_FLOOR: envNumber('RATING_RELIABILITY_FLOOR', 0.3),
  DECAY_START_DAYS: envNumber('RATING_DECAY_START_DAYS', 60),
  DECAY_PER_WEEK: envNumber('RATING_DECAY_PER_WEEK', 0.015),
  MAX_STEP_CALIBRATING: envNumber('RATING_MAX_STEP_CALIBRATING', 0.25),
  MAX_STEP_RELIABLE: envNumber('RATING_MAX_STEP_RELIABLE', 0.1),
  MAX_TOURNAMENT_STEP_CALIBRATING: envNumber('RATING_MAX_TOURNAMENT_STEP_CALIBRATING', 0.35),
  MAX_TOURNAMENT_STEP_RELIABLE: envNumber('RATING_MAX_TOURNAMENT_STEP_RELIABLE', 0.2),
  GAP_LIMIT: envNumber('RATING_GAP_LIMIT', 1.5),
  W_FORMAT: {
    match: envNumber('RATING_W_FORMAT_MATCH', 1.0),
    americano: envNumber('RATING_W_FORMAT_AMERICANO', 0.4),
    mexicano: envNumber('RATING_W_FORMAT_MEXICANO', 0.4),
    teamTournament: envNumber('RATING_W_FORMAT_TEAM_TOURNAMENT', 0.5),
  },
  W_DURATION: {
    oneSet: envNumber('RATING_W_DURATION_ONE_SET', 0.7),
    twoSets: envNumber('RATING_W_DURATION_TWO_SETS', 1.0),
    threeSets: envNumber('RATING_W_DURATION_THREE_SETS', 1.15),
  },
  W_REPEAT: [1.0, 0.85, 0.7, 0.55, 0.4],
  MAX_RATED_MATCHES_PER_DAY: envNumber('RATING_MAX_RATED_MATCHES_PER_DAY', 4),
  MIN_GAMES_FOR_RATING: envNumber('RATING_MIN_GAMES_FOR_RATING', 4),
};

/** Конфиг с точечными переопределениями — для тестов и экспериментов с калибровкой. */
export function withOverrides(overrides: Partial<RatingConfig>): RatingConfig {
  return { ...RATING_CONFIG, ...overrides };
}
