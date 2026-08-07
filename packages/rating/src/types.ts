import type { MatchDuration, MatchFormat } from './config.js';

export type TeamSide = 'A' | 'B';

/** Ничья возможна только в турнирных раундах, где счёт вводит организатор. */
export type MatchOutcome = TeamSide | 'draw';

/** Состояние игрока на момент расчёта. Уровень и надёжность — уже разрешённые числа. */
export interface PlayerSnapshot {
  id: string;
  level: number;
  reliability: number;
}

export interface MatchRatingInput {
  teamA: readonly [PlayerSnapshot, PlayerSnapshot];
  teamB: readonly [PlayerSnapshot, PlayerSnapshot];
  /** Геймы (обычный матч) или очки раунда (Американо/Мексикано). */
  scoreA: number;
  scoreB: number;
  winner: MatchOutcome;
  format: MatchFormat;
  duration: MatchDuration;
  /** Сколько раз этот же состав соперников уже играл за последние 30 дней (1 = первый раз). */
  repeatCount: number;
}

export interface RatingDelta {
  playerId: string;
  delta: number;
  levelBefore: number;
  levelAfter: number;
}

export interface MatchRatingDelta extends RatingDelta {
  team: TeamSide;
}

/**
 * Все промежуточные величины расчёта. Целиком пишется в `rating_events.snapshot`
 * (ТЗ §3.10) — по нему можно воспроизвести и объяснить любое изменение уровня
 * без обращения к остальной базе.
 */
export interface MatchRatingBreakdown {
  levelA: number;
  levelB: number;
  expectedA: number;
  expectedB: number;
  actualA: number;
  actualB: number;
  gameShareA: number;
  wFormat: number;
  wDuration: number;
  wRepeat: number;
  /** Множитель разрыва считается отдельно для каждой стороны — он асимметричен. */
  wGapA: number;
  wGapB: number;
}

export interface MatchRatingResult {
  deltas: MatchRatingDelta[];
  breakdown: MatchRatingBreakdown;
  configVersion: string;
}

/** Один раунд турнира в терминах движка рейтинга. Отдыхающие в раунд не входят. */
export interface TournamentRoundInput {
  roundNumber: number;
  courtNumber?: number;
  teamA: readonly [string, string];
  teamB: readonly [string, string];
  scoreA: number;
  scoreB: number;
}

export interface TournamentRatingInput {
  format: MatchFormat;
  duration: MatchDuration;
  /**
   * Снимок уровней ВСЕХ участников на момент старта турнира (ТЗ §3.6, п. 1–2).
   * Каждый раунд считается от этого снимка, а не от уровня, обновлённого
   * предыдущим раундом — иначе возникает эффект снежного кома.
   */
  levelsAtStart: readonly PlayerSnapshot[];
  rounds: readonly TournamentRoundInput[];
}

export interface TournamentPlayerRating extends RatingDelta {
  /** Сколько раундов игрок реально провёл. Отдыхающие раунды сюда не входят. */
  playedRounds: number;
  /** Сумма раундовых дельт до ограничения MAX_TOURNAMENT_STEP. */
  rawDelta: number;
  /** true, если суммарная дельта упёрлась в потолок турнира. */
  wasClamped: boolean;
}

export interface TournamentRoundBreakdown {
  roundNumber: number;
  courtNumber?: number;
  deltas: MatchRatingDelta[];
  breakdown: MatchRatingBreakdown;
}

export interface TournamentRatingResult {
  /** По одной записи на игрока, сыгравшего хотя бы один раунд. */
  deltas: TournamentPlayerRating[];
  /** Раскладка по раундам — для отладки и для объяснения игроку, откуда взялось изменение. */
  perRound: TournamentRoundBreakdown[];
  configVersion: string;
}
