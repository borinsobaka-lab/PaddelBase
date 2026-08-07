import {
  toDeltaDecimal,
  toJson,
  toLevelDecimal,
  toNumber,
  type Prisma,
  type PrismaClient,
} from '@paddelbase/db';
import {
  RATING_CONFIG,
  RATING_CONFIG_VERSION,
  applyRatedMatch,
  computeMatchDeltas,
  computeTournamentDeltas,
  effectiveReliability,
  initialReliability,
  type RatingConfig,
  type ReliabilityState,
  type TournamentRoundInput,
} from '@paddelbase/rating';

import { repeatWindowStart, resolveRatingEligibility, tbilisiDayKey } from './guards.js';
import { durationFromSets, type SetScore } from './score.js';
import { endsAt } from './matchLifecycle.js';
import { tournamentOccurredAt } from './tournamentLifecycle.js';

/**
 * Полный пересчёт истории рейтинга (ТЗ §3.10).
 *
 * Ради этой возможности движок сделан чистой функцией, а по каждому событию
 * сохраняется снимок «до». Без пересчёта менять коэффициенты после запуска
 * было бы нельзя: старые и новые уровни оказались бы несопоставимы.
 *
 * Алгоритм: откатить уровни к состоянию на дату начала пересчёта, затем
 * прогнать все зачтённые события строго в хронологическом порядке через
 * актуальный движок и переписать `rating_events`.
 *
 * Проверки §3.5 (дневной лимит, вес повторных встреч) пересчитываются по ходу
 * воспроизведения, а не берутся из старых записей: они зависят от порядка,
 * и при изменившихся коэффициентах могли бы решиться иначе.
 */

export interface RecomputeOptions {
  /** Пересчитать только события с этого момента. По умолчанию — вся история. */
  from?: Date;
  config?: RatingConfig;
  /** Посчитать и показать, но ничего не записывать. */
  dryRun?: boolean;
}

export interface RecomputeSummary {
  from: Date | null;
  matchesReplayed: number;
  tournamentsReplayed: number;
  skipped: { matchId: string; reason: string }[];
  eventsWritten: number;
  playersTouched: number;
  /** Максимальное расхождение уровня со старым значением — мера последствий. */
  maxLevelShift: number;
  dryRun: boolean;
}

interface PlayerState extends ReliabilityState {
  level: number;
}

interface ReplayEvent {
  kind: 'match' | 'tournament';
  id: string;
  occurredAt: Date;
}

export async function recomputeRatings(
  prisma: PrismaClient,
  options: RecomputeOptions = {},
): Promise<RecomputeSummary> {
  const config = options.config ?? RATING_CONFIG;
  const from = options.from ?? null;

  return prisma.$transaction(
    async (tx) => {
      const users = await tx.user.findMany();
      const levelsBefore = new Map(users.map((user) => [user.id, toNumber(user.level)]));

      // --- Откат состояния к моменту `from` ---
      const state = new Map<string, PlayerState>();

      for (const user of users) {
        if (!from) {
          state.set(user.id, {
            level: toNumber(user.startLevel),
            reliabilityBase: initialReliability(config),
            lastRatedMatchAt: null,
            ratedMatchesCount: 0,
          });
          continue;
        }

        // Состояние на дату восстанавливается из журнала: у каждого события
        // сохранён уровень «после», поэтому частичный пересчёт корректен.
        const last = await tx.ratingEvent.findFirst({
          where: { userId: user.id, occurredAt: { lt: from } },
          orderBy: { occurredAt: 'desc' },
        });

        const count = await tx.ratingEvent.count({
          where: { userId: user.id, occurredAt: { lt: from } },
        });

        state.set(user.id, {
          level: last ? toNumber(last.levelAfter) : toNumber(user.startLevel),
          reliabilityBase: last ? toNumber(last.reliabilityAfter) : initialReliability(config),
          lastRatedMatchAt: last ? last.occurredAt : null,
          ratedMatchesCount: count,
        });
      }

      await tx.ratingEvent.deleteMany(from ? { where: { occurredAt: { gte: from } } } : undefined);

      // --- Сбор потока событий ---
      const matches = await tx.match.findMany({
        where: {
          isRated: true,
          result: { confirmedAt: { not: null }, disputedAt: null },
        },
        include: { players: true, result: true },
      });

      const tournaments = await tx.tournament.findMany({
        where: { isRated: true, status: 'COMPLETED' },
        include: {
          participants: true,
          rounds: {
            where: { status: 'COMPLETED' },
            include: { matches: { include: { players: true } } },
            orderBy: { roundNumber: 'asc' },
          },
        },
      });

      const matchById = new Map(matches.map((match) => [match.id, match]));
      const tournamentById = new Map(tournaments.map((tournament) => [tournament.id, tournament]));

      const stream: ReplayEvent[] = [
        ...matches.map((match) => ({
          kind: 'match' as const,
          id: match.id,
          occurredAt: endsAt(match.startsAt, match.durationMin),
        })),
        ...tournaments.map((tournament) => ({
          kind: 'tournament' as const,
          id: tournament.id,
          occurredAt: tournamentOccurredAt(tournament),
        })),
      ]
        .filter((event) => !from || event.occurredAt >= from)
        // Порядок обязан быть полным и детерминированным: от него зависят
        // дневной лимит и вес повторных встреч.
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || (a.id < b.id ? -1 : 1));

      // --- Воспроизведение ---
      const summary: RecomputeSummary = {
        from,
        matchesReplayed: 0,
        tournamentsReplayed: 0,
        skipped: [],
        eventsWritten: 0,
        playersTouched: 0,
        maxLevelShift: 0,
        dryRun: options.dryRun ?? false,
      };

      const ratedPerDay = new Map<string, number>();
      const appliedMatchHistory: { occurredAt: Date; players: string[] }[] = [];
      const pendingEvents: Prisma.RatingEventCreateManyInput[] = [];

      const touched = new Set<string>();

      const require = (id: string): PlayerState => {
        const player = state.get(id);
        if (!player) throw new Error(`Игрок ${id} отсутствует в базе, пересчёт невозможен`);
        return player;
      };

      const dayKeyOf = (userId: string, at: Date) => `${userId}:${tbilisiDayKey(at)}`;

      // При частичном пересчёте окна §3.5 не начинаются с нуля: матч сразу
      // после `from` может быть третьей встречей того же состава за месяц и
      // пятым матчем за те же сутки. История до даты подтягивается из журнала —
      // иначе частичный пересчёт молча разошёлся бы с полным.
      if (from) {
        const priorEvents = await tx.ratingEvent.findMany({
          where: {
            matchId: { not: null },
            occurredAt: { gte: repeatWindowStart(from), lt: from },
          },
          select: { matchId: true, occurredAt: true, userId: true },
          orderBy: { occurredAt: 'asc' },
        });

        const byMatch = new Map<string, { occurredAt: Date; players: string[] }>();
        for (const priorEvent of priorEvents) {
          const entry = byMatch.get(priorEvent.matchId!) ?? {
            occurredAt: priorEvent.occurredAt,
            players: [],
          };
          entry.players.push(priorEvent.userId);
          byMatch.set(priorEvent.matchId!, entry);

          if (tbilisiDayKey(priorEvent.occurredAt) === tbilisiDayKey(from)) {
            const key = dayKeyOf(priorEvent.userId, priorEvent.occurredAt);
            ratedPerDay.set(key, (ratedPerDay.get(key) ?? 0) + 1);
          }
        }

        appliedMatchHistory.push(
          ...[...byMatch.values()].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()),
        );
      }

      for (const event of stream) {
        if (event.kind === 'match') {
          const match = matchById.get(event.id)!;
          const teamA = match.players.filter((p) => p.team === 1);
          const teamB = match.players.filter((p) => p.team === 2);

          if (teamA.length !== 2 || teamB.length !== 2) {
            summary.skipped.push({ matchId: match.id, reason: 'NO_TEAMS' });
            continue;
          }

          const playerIds = match.players.map((p) => p.userId);
          const todayMax = Math.max(
            ...playerIds.map((id) => ratedPerDay.get(dayKeyOf(id, event.occurredAt)) ?? 0),
          );

          const eligibility = resolveRatingEligibility(
            {
              isRated: true,
              confirmed: true,
              disputed: false,
              totalGames: match.result!.gamesA + match.result!.gamesB,
              ratedMatchesToday: todayMax,
            },
            config,
          );

          if (!eligibility.eligible) {
            summary.skipped.push({ matchId: match.id, reason: eligibility.reason ?? 'UNKNOWN' });
            continue;
          }

          const windowStart = repeatWindowStart(event.occurredAt);
          const repeatCount =
            appliedMatchHistory.filter(
              (previous) =>
                previous.occurredAt >= windowStart &&
                previous.players.length === playerIds.length &&
                playerIds.every((id) => previous.players.includes(id)),
            ).length + 1;

          const snapshotOf = (userId: string) => {
            const player = require(userId);
            return {
              id: userId,
              level: player.level,
              reliability: effectiveReliability(player, event.occurredAt, config),
            };
          };

          const rating = computeMatchDeltas(
            {
              teamA: [snapshotOf(teamA[0]!.userId), snapshotOf(teamA[1]!.userId)],
              teamB: [snapshotOf(teamB[0]!.userId), snapshotOf(teamB[1]!.userId)],
              scoreA: match.result!.gamesA,
              scoreB: match.result!.gamesB,
              winner: match.result!.winnerTeam === 1 ? 'A' : 'B',
              format: 'match',
              duration: durationFromSets((match.result!.sets as unknown as SetScore[]).length),
              repeatCount,
            },
            config,
          );

          for (const delta of rating.deltas) {
            const player = require(delta.playerId);
            const reliabilityBefore = effectiveReliability(player, event.occurredAt, config);
            const next = applyRatedMatch(player, event.occurredAt, config);

            player.level = delta.levelAfter;
            player.reliabilityBase = next.reliabilityBase;
            player.lastRatedMatchAt = next.lastRatedMatchAt;
            player.ratedMatchesCount = next.ratedMatchesCount;
            touched.add(delta.playerId);

            pendingEvents.push({
              userId: delta.playerId,
              matchId: match.id,
              occurredAt: event.occurredAt,
              levelBefore: toLevelDecimal(delta.levelBefore),
              levelAfter: toLevelDecimal(delta.levelAfter),
              delta: toDeltaDecimal(delta.delta),
              reliabilityBefore: toLevelDecimal(reliabilityBefore),
              reliabilityAfter: toLevelDecimal(next.reliabilityBase),
              snapshot: toJson({ input: rating.breakdown, team: delta.team, repeatCount }),
              configVersion: RATING_CONFIG_VERSION,
            });

            const key = dayKeyOf(delta.playerId, event.occurredAt);
            ratedPerDay.set(key, (ratedPerDay.get(key) ?? 0) + 1);
          }

          appliedMatchHistory.push({ occurredAt: event.occurredAt, players: playerIds });
          summary.matchesReplayed += 1;
          continue;
        }

        const tournament = tournamentById.get(event.id)!;
        const rounds: TournamentRoundInput[] = [];

        for (const round of tournament.rounds) {
          for (const match of round.matches) {
            const teamA = match.players.filter((p) => p.team === 1).map((p) => p.userId);
            const teamB = match.players.filter((p) => p.team === 2).map((p) => p.userId);
            if (teamA.length !== 2 || teamB.length !== 2) continue;

            rounds.push({
              roundNumber: round.roundNumber,
              courtNumber: match.courtNumber,
              teamA: [teamA[0]!, teamA[1]!],
              teamB: [teamB[0]!, teamB[1]!],
              scoreA: match.scoreA ?? 0,
              scoreB: match.scoreB ?? 0,
            });
          }
        }

        if (rounds.length === 0) continue;

        // Снимок уровней берётся из текущего состояния воспроизведения, а не из
        // levelAtStart: при пересчёте уровни на момент турнира другие.
        const result = computeTournamentDeltas(
          {
            format:
              tournament.format === 'TEAM_AMERICANO' || tournament.format === 'TEAM_MEXICANO'
                ? 'teamTournament'
                : tournament.format === 'MEXICANO'
                  ? 'mexicano'
                  : 'americano',
            duration: 'oneSet',
            levelsAtStart: tournament.participants.map((participant) => {
              const player = require(participant.userId);
              return {
                id: participant.userId,
                level: player.level,
                reliability: effectiveReliability(player, event.occurredAt, config),
              };
            }),
            rounds,
          },
          config,
        );

        for (const delta of result.deltas) {
          const player = require(delta.playerId);
          const reliabilityBefore = effectiveReliability(player, event.occurredAt, config);
          const next = applyRatedMatch(player, event.occurredAt, config);

          player.level = delta.levelAfter;
          player.reliabilityBase = next.reliabilityBase;
          player.lastRatedMatchAt = next.lastRatedMatchAt;
          player.ratedMatchesCount = next.ratedMatchesCount;
          touched.add(delta.playerId);

          pendingEvents.push({
            userId: delta.playerId,
            tournamentId: tournament.id,
            occurredAt: event.occurredAt,
            levelBefore: toLevelDecimal(delta.levelBefore),
            levelAfter: toLevelDecimal(delta.levelAfter),
            delta: toDeltaDecimal(delta.delta),
            reliabilityBefore: toLevelDecimal(reliabilityBefore),
            reliabilityAfter: toLevelDecimal(next.reliabilityBase),
            snapshot: toJson({
              playedRounds: delta.playedRounds,
              rawDelta: delta.rawDelta,
              wasClamped: delta.wasClamped,
            }),
            configVersion: RATING_CONFIG_VERSION,
          });
        }

        summary.tournamentsReplayed += 1;
      }

      summary.eventsWritten = pendingEvents.length;
      summary.playersTouched = touched.size;

      for (const [userId, player] of state) {
        const before = levelsBefore.get(userId) ?? player.level;
        summary.maxLevelShift = Math.max(summary.maxLevelShift, Math.abs(player.level - before));
      }

      if (options.dryRun) {
        // Транзакция откатывается: удаление событий и обнуление уровней не
        // должны пережить прогон «на посмотреть».
        throw new DryRunRollback(summary);
      }

      for (const [userId, player] of state) {
        await tx.user.update({
          where: { id: userId },
          data: {
            level: toLevelDecimal(player.level),
            reliabilityBase: toLevelDecimal(player.reliabilityBase),
            reliability: toLevelDecimal(
              effectiveReliability(player, player.lastRatedMatchAt ?? new Date(0), config),
            ),
            ratedMatchesCount: player.ratedMatchesCount,
            lastRatedMatchAt: player.lastRatedMatchAt,
          },
        });
      }

      if (pendingEvents.length > 0) {
        await tx.ratingEvent.createMany({ data: pendingEvents });
      }

      return summary;
    },
    { timeout: 120_000 },
  ).catch((error: unknown) => {
    if (error instanceof DryRunRollback) return error.summary;
    throw error;
  });
}

/** Служебная ошибка: единственный способ откатить транзакцию Prisma. */
class DryRunRollback extends Error {
  constructor(readonly summary: RecomputeSummary) {
    super('dry run');
    this.name = 'DryRunRollback';
  }
}
