import { RATING_CONFIG } from '@paddelbase/rating';
import { describe, expect, it } from 'vitest';

import {
  autoConfirmCutoff,
  autoConfirmDeadline,
  repeatWindowStart,
  resolveRatingEligibility,
  tbilisiDayKey,
  tbilisiDayRange,
  type RatingEligibilityContext,
} from './guards.js';

function context(overrides: Partial<RatingEligibilityContext> = {}): RatingEligibilityContext {
  return {
    isRated: true,
    confirmed: true,
    disputed: false,
    totalGames: 20,
    ratedMatchesToday: 0,
    ...overrides,
  };
}

describe('допуск матча к рейтингу (ТЗ §3.5)', () => {
  it('пропускает обычный подтверждённый рейтинговый матч', () => {
    expect(resolveRatingEligibility(context())).toEqual({ eligible: true });
  });

  it('не трогает рейтинг для любительского матча', () => {
    expect(resolveRatingEligibility(context({ isRated: false }))).toEqual({
      eligible: false,
      reason: 'NOT_RATED',
    });
  });

  it('оспоренный результат не влияет на рейтинг до ручного разбора', () => {
    expect(resolveRatingEligibility(context({ disputed: true }))).toEqual({
      eligible: false,
      reason: 'DISPUTED',
    });
  });

  it('неподтверждённый результат не идёт в зачёт', () => {
    expect(resolveRatingEligibility(context({ confirmed: false }))).toEqual({
      eligible: false,
      reason: 'NOT_CONFIRMED',
    });
  });

  it('матч, завершённый досрочно, не рейтингуется', () => {
    expect(resolveRatingEligibility(context({ totalGames: 3 }))).toEqual({
      eligible: false,
      reason: 'TOO_FEW_GAMES',
    });
  });

  it('сверх дневного лимита матчи не идут в зачёт', () => {
    expect(
      resolveRatingEligibility(context({ ratedMatchesToday: RATING_CONFIG.MAX_RATED_MATCHES_PER_DAY })),
    ).toEqual({ eligible: false, reason: 'DAILY_LIMIT' });

    expect(
      resolveRatingEligibility(
        context({ ratedMatchesToday: RATING_CONFIG.MAX_RATED_MATCHES_PER_DAY - 1 }),
      ).eligible,
    ).toBe(true);
  });

  it('оспаривание важнее подтверждения', () => {
    expect(resolveRatingEligibility(context({ confirmed: false, disputed: true })).reason).toBe(
      'DISPUTED',
    );
  });
});

describe('тбилисские сутки', () => {
  it('вечерний матч по местному времени относится к тому же дню', () => {
    // 7 августа 22:00 в Тбилиси = 18:00 UTC
    expect(tbilisiDayKey(new Date('2026-08-07T18:00:00Z'))).toBe('2026-08-07');
  });

  it('матч после полуночи по местному времени уходит в следующий день', () => {
    // 8 августа 00:30 в Тбилиси = 7 августа 20:30 UTC
    expect(tbilisiDayKey(new Date('2026-08-07T20:30:00Z'))).toBe('2026-08-08');
  });

  it('границы суток — ровно 24 часа со сдвигом на UTC+4', () => {
    const { start, end } = tbilisiDayRange(new Date('2026-08-07T18:00:00Z'));

    expect(start.toISOString()).toBe('2026-08-06T20:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-07T20:00:00.000Z');
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('момент на границе попадает ровно в один день', () => {
    const boundary = new Date('2026-08-07T20:00:00Z');
    const { start } = tbilisiDayRange(boundary);
    expect(start.getTime()).toBe(boundary.getTime());
  });
});

describe('окна времени', () => {
  it('повторные встречи считаются за 30 дней', () => {
    expect(repeatWindowStart(new Date('2026-08-31T12:00:00Z')).toISOString()).toBe(
      '2026-08-01T12:00:00.000Z',
    );
  });

  it('автоподтверждение наступает через 48 часов', () => {
    const entered = new Date('2026-08-07T12:00:00Z');
    expect(autoConfirmDeadline(entered).toISOString()).toBe('2026-08-09T12:00:00.000Z');
    expect(autoConfirmCutoff(new Date('2026-08-09T12:00:00Z')).getTime()).toBe(entered.getTime());
  });
});
