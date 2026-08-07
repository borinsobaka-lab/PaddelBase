import { chain, compareIds } from './deterministic.js';

/** Сыгранный раунд индивидуального турнира. */
export interface RoundResult {
  roundNumber: number;
  matches: readonly {
    teamA: readonly [string, string];
    teamB: readonly [string, string];
    scoreA: number;
    scoreB: number;
  }[];
  resting: readonly string[];
}

/** Сыгранный раунд командного турнира. */
export interface TeamRoundResult {
  roundNumber: number;
  matches: readonly { teamA: string; teamB: string; scoreA: number; scoreB: number }[];
  resting: readonly string[];
}

export interface StandingRow {
  /** Идентификатор игрока или команды — в зависимости от формата. */
  id: string;
  points: number;
  pointsAgainst: number;
  pointsDiff: number;
  playedRounds: number;
  restCount: number;
  /** Компенсация за пропущенные раунды, уже включённая в points. */
  compensationPoints: number;
  place: number;
}

export interface StandingsOptions {
  pointsPerRound: number;
  /** Доля номинала раунда, начисляемая отдыхающему (ТЗ §4.3). 0 выключает компенсацию. */
  restCompensation: number;
  /** Уровни участников — нужны только для посева перед раундом, не для итоговой таблицы. */
  levels?: Readonly<Record<string, number>>;
}

interface NormalizedMatch {
  sideA: readonly string[];
  sideB: readonly string[];
  scoreA: number;
  scoreB: number;
}

interface NormalizedRound {
  matches: readonly NormalizedMatch[];
  resting: readonly string[];
}

export function computeIndividualStandings(
  playerIds: readonly string[],
  rounds: readonly RoundResult[],
  options: StandingsOptions,
): StandingRow[] {
  return computeStandings(playerIds, rounds.map(normalizeIndividualRound), options);
}

export function computeTeamStandings(
  teamIds: readonly string[],
  rounds: readonly TeamRoundResult[],
  options: StandingsOptions,
): StandingRow[] {
  return computeStandings(teamIds, rounds.map(normalizeTeamRound), options);
}

function normalizeIndividualRound(round: RoundResult): NormalizedRound {
  return {
    matches: round.matches.map((match) => ({
      sideA: match.teamA,
      sideB: match.teamB,
      scoreA: match.scoreA,
      scoreB: match.scoreB,
    })),
    resting: round.resting,
  };
}

function normalizeTeamRound(round: TeamRoundResult): NormalizedRound {
  return {
    matches: round.matches.map((match) => ({
      sideA: [match.teamA],
      sideB: [match.teamB],
      scoreA: match.scoreA,
      scoreB: match.scoreB,
    })),
    resting: round.resting,
  };
}

function computeStandings(
  ids: readonly string[],
  rounds: readonly NormalizedRound[],
  options: StandingsOptions,
): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    ids.map((id) => [
      id,
      {
        id,
        points: 0,
        pointsAgainst: 0,
        pointsDiff: 0,
        playedRounds: 0,
        restCount: 0,
        compensationPoints: 0,
        place: 0,
      },
    ]),
  );

  const require = (id: string): StandingRow => {
    const row = rows.get(id);
    if (!row) throw new Error(`Участник ${id} отсутствует в списке участников турнира`);
    return row;
  };

  const compensation = options.pointsPerRound * options.restCompensation;

  for (const round of rounds) {
    for (const match of round.matches) {
      // Очки игрока за раунд = очки его пары (ТЗ §4.2).
      accumulate(match.sideA, match.scoreA, match.scoreB, require);
      accumulate(match.sideB, match.scoreB, match.scoreA, require);
    }

    for (const id of round.resting) {
      const row = require(id);
      row.restCount += 1;
      // Компенсация — турнирные очки; на рейтинг они не влияют (ТЗ §4.3).
      row.compensationPoints += compensation;
      row.points += compensation;
    }
  }

  for (const row of rows.values()) {
    row.pointsDiff = row.points - row.pointsAgainst;
  }

  const headToHead = buildHeadToHead(rounds);
  const ordered = [...rows.values()].sort((a, b) =>
    chain(
      b.points - a.points,
      b.pointsDiff - a.pointsDiff,
      headToHead(a.id, b.id),
      // При равенстве очков выше тот, кому потребовалось меньше раундов.
      a.playedRounds - b.playedRounds,
      compareIds(a.id, b.id),
    ),
  );

  ordered.forEach((row, index) => {
    row.place = index + 1;
  });

  return ordered;
}

function accumulate(
  side: readonly string[],
  scored: number,
  conceded: number,
  require: (id: string) => StandingRow,
): void {
  for (const id of side) {
    const row = require(id);
    row.points += scored;
    row.pointsAgainst += conceded;
    row.playedRounds += 1;
  }
}

/**
 * Личная встреча: сумма очков, набранных участниками друг против друга во всех
 * раундах, где они оказались по разные стороны сетки. Возвращает компаратор:
 * отрицательное значение — первый выше.
 */
function buildHeadToHead(rounds: readonly NormalizedRound[]): (a: string, b: string) => number {
  const scored = new Map<string, number>();
  const key = (a: string, b: string) => `${a} ${b}`;

  const add = (a: string, b: string, value: number) => {
    scored.set(key(a, b), (scored.get(key(a, b)) ?? 0) + value);
  };

  for (const round of rounds) {
    for (const match of round.matches) {
      for (const a of match.sideA) {
        for (const b of match.sideB) {
          add(a, b, match.scoreA);
          add(b, a, match.scoreB);
        }
      }
    }
  }

  return (a, b) => (scored.get(key(b, a)) ?? 0) - (scored.get(key(a, b)) ?? 0);
}

/**
 * Порядок участников перед генерацией следующего раунда Мексикано (ТЗ §4.3).
 *
 * Отличается от итоговой таблицы намеренно: здесь нужна дешёвая и полностью
 * детерминированная сортировка, иначе сетка будет плавать при перезагрузке
 * страницы. Личная встреча в этот порядок не входит, зато входит уровень.
 */
export function compareForSeeding(
  a: Pick<StandingRow, 'id' | 'points' | 'pointsDiff'>,
  b: Pick<StandingRow, 'id' | 'points' | 'pointsDiff'>,
  levels: Readonly<Record<string, number>> = {},
): number {
  return chain(
    b.points - a.points,
    b.pointsDiff - a.pointsDiff,
    (levels[b.id] ?? 0) - (levels[a.id] ?? 0),
    compareIds(a.id, b.id),
  );
}
