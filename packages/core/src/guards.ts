import { RATING_CONFIG, type RatingConfig } from '@paddelbase/rating';

/**
 * Проверки из ТЗ §3.5, решающие, идёт ли матч в зачёт рейтинга.
 *
 * Вынесены в чистые функции: контекст собирает вызывающий код запросами к БД,
 * а само решение принимается без побочных эффектов — это делает его
 * воспроизводимым при полном пересчёте истории.
 */

export type RatingSkipReason =
  | 'NOT_RATED'
  | 'TOO_FEW_GAMES'
  | 'DAILY_LIMIT'
  | 'NOT_CONFIRMED'
  | 'DISPUTED';

export interface RatingEligibilityContext {
  /** Заявлен ли матч как рейтинговый при создании. */
  isRated: boolean;
  confirmed: boolean;
  disputed: boolean;
  /** Суммарное число геймов (или очков раунда). */
  totalGames: number;
  /**
   * Сколько рейтинговых матчей уже зачтено участникам в этот день по Тбилиси.
   * Берётся максимум по четверым: лимит индивидуальный, но матч либо идёт
   * в зачёт целиком, либо не идёт — считать половине пары, а половине нет
   * нельзя, иначе дельты перестанут быть сопоставимыми.
   */
  ratedMatchesToday: number;
}

export interface RatingEligibility {
  eligible: boolean;
  reason?: RatingSkipReason;
}

export function resolveRatingEligibility(
  context: RatingEligibilityContext,
  config: RatingConfig = RATING_CONFIG,
): RatingEligibility {
  if (!context.isRated) return { eligible: false, reason: 'NOT_RATED' };
  if (context.disputed) return { eligible: false, reason: 'DISPUTED' };
  if (!context.confirmed) return { eligible: false, reason: 'NOT_CONFIRMED' };

  // Матч, завершённый досрочно, не рейтингуется (§3.5 п. 5).
  if (context.totalGames < config.MIN_GAMES_FOR_RATING) {
    return { eligible: false, reason: 'TOO_FEW_GAMES' };
  }

  // Не более N рейтинговых матчей в сутки идут в зачёт (§3.5 п. 4).
  if (context.ratedMatchesToday >= config.MAX_RATED_MATCHES_PER_DAY) {
    return { eligible: false, reason: 'DAILY_LIMIT' };
  }

  return { eligible: true };
}

export const SKIP_REASON_TEXT: Record<RatingSkipReason, string> = {
  NOT_RATED: 'Матч не рейтинговый',
  TOO_FEW_GAMES: 'Слишком мало сыгранных геймов',
  DAILY_LIMIT: 'Превышен дневной лимит рейтинговых матчей',
  NOT_CONFIRMED: 'Результат не подтверждён',
  DISPUTED: 'Результат оспорен',
};

// --- Время ---

/**
 * Asia/Tbilisi — UTC+4 круглый год, без перехода на летнее время. Поэтому
 * границы суток считаются фиксированным сдвигом, без часовой библиотеки,
 * и результат не зависит от настроек сервера. Это важно для пересчёта истории:
 * дневной лимит обязан давать один и тот же ответ через год.
 */
export const TBILISI_UTC_OFFSET_HOURS = 4;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Календарный день по Тбилиси в виде «2026-08-07». */
export function tbilisiDayKey(date: Date): string {
  const shifted = new Date(date.getTime() + TBILISI_UTC_OFFSET_HOURS * HOUR_MS);
  return shifted.toISOString().slice(0, 10);
}

/** Границы тбилисских суток, которым принадлежит момент, в UTC. */
export function tbilisiDayRange(date: Date): { start: Date; end: Date } {
  const shifted = date.getTime() + TBILISI_UTC_OFFSET_HOURS * HOUR_MS;
  const dayStartShifted = Math.floor(shifted / DAY_MS) * DAY_MS;

  return {
    start: new Date(dayStartShifted - TBILISI_UTC_OFFSET_HOURS * HOUR_MS),
    end: new Date(dayStartShifted + DAY_MS - TBILISI_UTC_OFFSET_HOURS * HOUR_MS),
  };
}

/** Окно для подсчёта повторных встреч (ТЗ §3.5 п. 2). */
export const REPEAT_WINDOW_DAYS = 30;

export function repeatWindowStart(reference: Date): Date {
  return new Date(reference.getTime() - REPEAT_WINDOW_DAYS * DAY_MS);
}

/** Через сколько неподтверждённый результат засчитывается автоматически (ТЗ §3.5 п. 3). */
export const AUTO_CONFIRM_HOURS = 48;

export function autoConfirmDeadline(enteredAt: Date): Date {
  return new Date(enteredAt.getTime() + AUTO_CONFIRM_HOURS * HOUR_MS);
}

/** Результаты, введённые раньше этого момента, пора засчитывать автоматически. */
export function autoConfirmCutoff(now: Date): Date {
  return new Date(now.getTime() - AUTO_CONFIRM_HOURS * HOUR_MS);
}
