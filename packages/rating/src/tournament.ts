import { RATING_CONFIG, RATING_CONFIG_VERSION, type RatingConfig } from './config.js';
import { clampLevel, roundLevel } from './level.js';
import { computeMatchDeltas } from './match.js';
import type {
  MatchOutcome,
  PlayerSnapshot,
  TournamentPlayerRating,
  TournamentRatingInput,
  TournamentRatingResult,
  TournamentRoundBreakdown,
  TournamentRoundInput,
} from './types.js';

/**
 * Весь турнир — один расчётный период (ТЗ §3.6).
 *
 * Каждый раунд считается от снимка уровней на старте турнира, дельты
 * суммируются, ограничиваются одним потолком и применяются один раз. Расчёт
 * от снимка принципиален: иначе игрок, поднявший уровень в первом раунде,
 * во всех последующих играет против смещённых ожиданий, и возникает эффект
 * снежного кома.
 *
 * Функция не начисляет ratedMatchesCount — это делает вызывающий код, ровно
 * один раз за турнир, а не за каждый раунд (ТЗ §3.6, п. 6).
 */
export function computeTournamentDeltas(
  input: TournamentRatingInput,
  config: RatingConfig = RATING_CONFIG,
): TournamentRatingResult {
  const snapshots = new Map<string, PlayerSnapshot>();
  for (const player of input.levelsAtStart) {
    if (snapshots.has(player.id)) {
      throw new Error(`Игрок ${player.id} указан в снимке уровней дважды`);
    }
    snapshots.set(player.id, player);
  }

  const resolve = (playerId: string, roundNumber: number): PlayerSnapshot => {
    const snapshot = snapshots.get(playerId);
    if (!snapshot) {
      throw new Error(`Раунд ${roundNumber}: игрока ${playerId} нет в снимке уровней на старте турнира`);
    }
    return snapshot;
  };

  const rawTotals = new Map<string, number>();
  const playedRounds = new Map<string, number>();
  const perRound: TournamentRoundBreakdown[] = [];

  for (const round of input.rounds) {
    const result = computeMatchDeltas(
      {
        teamA: pairOf(round.teamA, round.roundNumber, resolve),
        teamB: pairOf(round.teamB, round.roundNumber, resolve),
        scoreA: round.scoreA,
        scoreB: round.scoreB,
        winner: outcomeOf(round),
        format: input.format,
        duration: input.duration,
        // Ротация внутри турнира сама разводит составы, а W_repeat описывает
        // накрутку между отдельными матчами за 30 дней (ТЗ §3.5, п. 2).
        repeatCount: 1,
      },
      config,
    );

    for (const delta of result.deltas) {
      rawTotals.set(delta.playerId, (rawTotals.get(delta.playerId) ?? 0) + delta.delta);
      playedRounds.set(delta.playerId, (playedRounds.get(delta.playerId) ?? 0) + 1);
    }

    perRound.push({
      roundNumber: round.roundNumber,
      ...(round.courtNumber === undefined ? {} : { courtNumber: round.courtNumber }),
      deltas: result.deltas,
      breakdown: result.breakdown,
    });
  }

  const deltas: TournamentPlayerRating[] = [];

  for (const player of input.levelsAtStart) {
    const rounds = playedRounds.get(player.id) ?? 0;
    // Отдыхавший весь турнир не получает рейтингового события вовсе:
    // пропущенный раунд на рейтинг не влияет никак (ТЗ §3.6).
    if (rounds === 0) continue;

    const rawDelta = roundLevel(rawTotals.get(player.id) ?? 0);
    const maxStep = resolveMaxTournamentStep(player.reliability, config);
    const capped = Math.min(Math.max(rawDelta, -maxStep), maxStep);

    const levelBefore = roundLevel(player.level);
    const levelAfter = clampLevel(levelBefore + capped, config);

    deltas.push({
      playerId: player.id,
      delta: roundLevel(levelAfter - levelBefore),
      levelBefore,
      levelAfter,
      playedRounds: rounds,
      rawDelta,
      wasClamped: capped !== rawDelta,
    });
  }

  return { deltas, perRound, configVersion: RATING_CONFIG_VERSION };
}

export function resolveMaxTournamentStep(
  reliability: number,
  config: RatingConfig = RATING_CONFIG,
): number {
  return reliability < config.RELIABLE_THRESHOLD
    ? config.MAX_TOURNAMENT_STEP_CALIBRATING
    : config.MAX_TOURNAMENT_STEP_RELIABLE;
}

function outcomeOf(round: TournamentRoundInput): MatchOutcome {
  if (round.scoreA > round.scoreB) return 'A';
  if (round.scoreB > round.scoreA) return 'B';
  return 'draw';
}

function pairOf(
  ids: readonly [string, string],
  roundNumber: number,
  resolve: (playerId: string, roundNumber: number) => PlayerSnapshot,
): readonly [PlayerSnapshot, PlayerSnapshot] {
  return [resolve(ids[0], roundNumber), resolve(ids[1], roundNumber)];
}
