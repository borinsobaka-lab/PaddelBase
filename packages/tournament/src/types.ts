/** Матч внутри раунда индивидуального турнира (Американо / Мексикано). */
export interface ScheduledMatch {
  /** Номер корта, 1-based. */
  courtNumber: number;
  teamA: readonly [string, string];
  teamB: readonly [string, string];
}

export interface ScheduledRound {
  roundNumber: number;
  matches: ScheduledMatch[];
  /** Игроки, пропускающие раунд. */
  resting: string[];
}

/** Матч внутри раунда командного турнира: играют команды целиком. */
export interface ScheduledTeamMatch {
  courtNumber: number;
  teamA: string;
  teamB: string;
}

export interface ScheduledTeamRound {
  roundNumber: number;
  matches: ScheduledTeamMatch[];
  resting: string[];
}

/**
 * Качество сгенерированной сетки. Считается по факту, а не обещается заранее:
 * идеальная ротация достижима не при любом числе игроков и кортов, и организатор
 * должен видеть, что именно он получил.
 */
export interface ScheduleAnalysis {
  rounds: number;
  /** Сколько раз максимум одна и та же пара оказывалась партнёрами. */
  maxPartnerRepeat: number;
  /** Сколько раз максимум одни и те же игроки встречались соперниками. */
  maxOpponentRepeat: number;
  /** Разница между самым отдыхавшим и самым играющим. По ТЗ §4.2 не должна превышать 1. */
  restSpread: number;
  /** true, если каждый сыграл в паре с каждым не более одного раза. */
  isPerfectPartnerRotation: boolean;
}
