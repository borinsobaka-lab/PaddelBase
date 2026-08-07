import { PairCounter } from './counters.js';
import { chain, compareIds, seededOrder, tieBreakKey } from './deterministic.js';
import { circleMethodRoundsWithBye } from './roundRobin.js';
import { compareForSeeding } from './standings.js';
import type { ScheduledTeamMatch, ScheduledTeamRound } from './types.js';

/**
 * Командные форматы (ТЗ §4.4–4.5). Пары фиксированы на весь турнир, поэтому
 * планировщику остаётся развести команды по соперникам: в Американо — круговой
 * системой, в Мексикано — по текущей таблице.
 */

export interface TeamAmericanoScheduleInput {
  teamIds: readonly string[];
  courtsCount: number;
  roundsCount?: number;
  seed: string;
}

export function defaultTeamAmericanoRounds(teamCount: number): number {
  return teamCount % 2 === 0 ? teamCount - 1 : teamCount;
}

/** Полный round-robin: `m·(m−1)/2` матчей при `m` командах (ТЗ §4.4). */
export function roundRobinMatchCount(teamCount: number): number {
  return (teamCount * (teamCount - 1)) / 2;
}

export function generateTeamAmericanoSchedule(
  input: TeamAmericanoScheduleInput,
): ScheduledTeamRound[] {
  const teams = seededOrder(validateTeams(input.teamIds), input.seed);
  const roundsCount = input.roundsCount ?? defaultTeamAmericanoRounds(teams.length);
  if (roundsCount < 1) return [];

  const courts = Math.max(1, Math.trunc(input.courtsCount));
  const matchesPerFullRound = Math.floor(teams.length / 2);

  return courts >= matchesPerFullRound
    ? teamScheduleByRoundRobin(teams, roundsCount)
    : teamScheduleGreedily(teams, courts, roundsCount, input.seed);
}

function validateTeams(teamIds: readonly string[]): string[] {
  if (teamIds.length < 2) {
    throw new Error('Для командного турнира нужно минимум 2 команды');
  }
  if (new Set(teamIds).size !== teamIds.length) {
    throw new Error('Список команд содержит дубликаты');
  }
  return [...teamIds];
}

function teamScheduleByRoundRobin(
  teams: readonly string[],
  roundsCount: number,
): ScheduledTeamRound[] {
  const factorization = circleMethodRoundsWithBye(teams);
  const rounds: ScheduledTeamRound[] = [];

  for (let index = 0; index < roundsCount; index += 1) {
    // За пределами полного круга повторение соперников неизбежно.
    const round = factorization[index % factorization.length]!;

    rounds.push({
      roundNumber: index + 1,
      matches: round.pairs.map((pair, courtIndex) => ({
        courtNumber: courtIndex + 1,
        teamA: pair[0],
        teamB: pair[1],
      })),
      resting: [...round.resting],
    });
  }

  return rounds;
}

/**
 * Кортов меньше, чем нужно на полный круг: часть команд каждый раунд отдыхает.
 * Минимизируется только повторение соперников — партнёры в командных форматах
 * зафиксированы (ТЗ §4.4).
 */
function teamScheduleGreedily(
  teams: readonly string[],
  courts: number,
  roundsCount: number,
  seed: string,
): ScheduledTeamRound[] {
  const meetings = new PairCounter();
  const restCount = new Map(teams.map((id) => [id, 0]));
  const playedCount = new Map(teams.map((id) => [id, 0]));

  const teamsPerRound = courts * 2;
  const rounds: ScheduledTeamRound[] = [];

  for (let index = 0; index < roundsCount; index += 1) {
    const selected = [...teams]
      .sort((a, b) =>
        chain(
          restCount.get(b)! - restCount.get(a)!,
          playedCount.get(a)! - playedCount.get(b)!,
          tieBreakKey(seed, a) - tieBreakKey(seed, b),
          compareIds(a, b),
        ),
      )
      .slice(0, teamsPerRound);

    const selectedSet = new Set(selected);
    const resting = teams.filter((id) => !selectedSet.has(id));

    for (const id of resting) restCount.set(id, restCount.get(id)! + 1);
    for (const id of selected) playedCount.set(id, playedCount.get(id)! + 1);

    rounds.push({
      roundNumber: index + 1,
      matches: pairMinimizingMeetings(selected, meetings),
      resting,
    });
  }

  return rounds;
}

function pairMinimizingMeetings(
  teams: readonly string[],
  meetings: PairCounter,
): ScheduledTeamMatch[] {
  const pool = [...teams];
  const matches: ScheduledTeamMatch[] = [];

  while (pool.length >= 2) {
    const teamA = pool.shift()!;

    let bestIndex = 0;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let index = 0; index < pool.length; index += 1) {
      const cost = meetings.get(teamA, pool[index]!);
      if (cost < bestCost) {
        bestCost = cost;
        bestIndex = index;
      }
    }

    const teamB = pool.splice(bestIndex, 1)[0]!;
    meetings.increment(teamA, teamB);
    matches.push({ courtNumber: matches.length + 1, teamA, teamB });
  }

  return matches;
}

// --- Командный Мексикано (ТЗ §4.5) ---

export interface TeamStanding {
  teamId: string;
  points: number;
  pointsDiff: number;
  restCount: number;
  /** Средний уровень команды: посев первого раунда и тай-брейк. */
  level: number;
}

export interface TeamMexicanoRoundInput {
  roundNumber: number;
  teams: readonly TeamStanding[];
  courtsCount: number;
  seed: string;
  /** Пары соперников, уже встречавшиеся в этом турнире. */
  previousMeetings?: readonly (readonly [string, string])[];
  seedFirstRoundByLevel?: boolean;
}

export function generateTeamMexicanoRound(input: TeamMexicanoRoundInput): ScheduledTeamRound {
  const teams = input.teams;
  if (teams.length < 2) {
    throw new Error('Для командного турнира нужно минимум 2 команды');
  }
  if (new Set(teams.map((t) => t.teamId)).size !== teams.length) {
    throw new Error('Список команд содержит дубликаты');
  }

  const order = orderTeams(input);
  const courts = Math.min(Math.max(1, Math.trunc(input.courtsCount)), Math.floor(teams.length / 2));

  const restCount = new Map(teams.map((t) => [t.teamId, t.restCount]));
  const position = new Map(order.map((id, index) => [id, index]));
  const restingCount = teams.length - courts * 2;

  const resting = new Set(
    restingCount <= 0
      ? []
      : [...order]
          .sort((a, b) =>
            chain(
              (restCount.get(a) ?? 0) - (restCount.get(b) ?? 0),
              position.get(b)! - position.get(a)!,
              compareIds(a, b),
            ),
          )
          .slice(0, restingCount),
  );

  const playing = order.filter((id) => !resting.has(id));

  return {
    roundNumber: input.roundNumber,
    matches: pairAdjacentAvoidingRematch(playing, input.previousMeetings ?? []),
    resting: order.filter((id) => resting.has(id)),
  };
}

function orderTeams(input: TeamMexicanoRoundInput): string[] {
  const ids = input.teams.map((t) => t.teamId);

  if (input.roundNumber <= 1) {
    if (input.seedFirstRoundByLevel === false) return seededOrder(ids, input.seed);

    return [...input.teams]
      .sort((a, b) =>
        chain(
          b.level - a.level,
          tieBreakKey(input.seed, a.teamId) - tieBreakKey(input.seed, b.teamId),
          compareIds(a.teamId, b.teamId),
        ),
      )
      .map((t) => t.teamId);
  }

  const levels = Object.fromEntries(input.teams.map((t) => [t.teamId, t.level]));

  return [...input.teams]
    .sort((a, b) =>
      compareForSeeding(
        { id: a.teamId, points: a.points, pointsDiff: a.pointsDiff },
        { id: b.teamId, points: b.points, pointsDiff: b.pointsDiff },
        levels,
      ),
    )
    .map((t) => t.teamId);
}

/**
 * Соседние по таблице команды играют между собой: 1-я со 2-й, 3-я с 4-й и так
 * далее. Если такая пара в этом турнире уже встречалась, соперник сдвигается
 * на позицию ниже (ТЗ §4.5) — правило применяется сверху вниз, поэтому
 * результат детерминирован.
 */
function pairAdjacentAvoidingRematch(
  playing: readonly string[],
  previousMeetings: readonly (readonly [string, string])[],
): ScheduledTeamMatch[] {
  const met = new PairCounter();
  for (const [a, b] of previousMeetings) met.increment(a, b);

  const remaining = [...playing];
  const matches: ScheduledTeamMatch[] = [];

  while (remaining.length >= 2) {
    const teamA = remaining.shift()!;

    let index = remaining.findIndex((candidate) => met.get(teamA, candidate) === 0);
    // Все оставшиеся уже играли с этой командой — берём ближайшего по таблице.
    if (index === -1) index = 0;

    const teamB = remaining.splice(index, 1)[0]!;
    met.increment(teamA, teamB);
    matches.push({ courtNumber: matches.length + 1, teamA, teamB });
  }

  return matches;
}
