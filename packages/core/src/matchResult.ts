import {
  Prisma,
  toJson,
  toLevelDecimal,
  toNumber,
  toDeltaDecimal,
  type PrismaClient,
} from '@paddelbase/db';
import {
  RATING_CONFIG,
  applyRatedMatch,
  computeMatchDeltas,
  effectiveReliability,
  type MatchRatingResult,
  type PlayerSnapshot,
  type RatingConfig,
} from '@paddelbase/rating';

import {
  autoConfirmCutoff,
  autoConfirmDeadline,
  repeatWindowStart,
  resolveRatingEligibility,
  tbilisiDayRange,
  type RatingSkipReason,
} from './guards.js';
import { durationFromSets, parseMatchScore, type SetScore } from './score.js';

type Tx = Prisma.TransactionClient;

export class MatchResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MatchResultError';
  }
}

export interface TeamAssignment {
  userId: string;
  team: 1 | 2;
}

export interface EnterResultInput {
  matchId: string;
  enteredById: string;
  sets: readonly SetScore[];
  teams: readonly TeamAssignment[];
  now: Date;
}

export interface AppliedRating {
  applied: boolean;
  skipReason?: RatingSkipReason;
  deltas?: MatchRatingResult['deltas'];
}

/**
 * Ввод счёта участником матча (ТЗ §4.1).
 *
 * Состав пар фиксируется здесь же: без него рейтинг посчитать нельзя, а
 * восстановить постфактум, кто с кем играл, уже невозможно.
 */
export async function enterMatchResult(
  prisma: PrismaClient,
  input: EnterResultInput,
): Promise<void> {
  const score = parseMatchScore(input.sets);

  await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({
      where: { id: input.matchId },
      include: { players: true, result: true },
    });

    if (!match) throw new MatchResultError('Матч не найден');
    if (match.result) throw new MatchResultError('Счёт этого матча уже введён');
    if (!match.players.some((player) => player.userId === input.enteredById)) {
      throw new MatchResultError('Счёт может ввести только участник матча');
    }

    assignTeams(match.players, input.teams);

    for (const assignment of input.teams) {
      await tx.matchPlayer.update({
        where: { matchId_userId: { matchId: match.id, userId: assignment.userId } },
        data: { team: assignment.team },
      });
    }

    await tx.matchResult.create({
      data: {
        matchId: match.id,
        sets: toJson(score.sets),
        gamesA: score.gamesA,
        gamesB: score.gamesB,
        winnerTeam: score.winnerTeam,
        enteredById: input.enteredById,
        enteredAt: input.now,
      },
    });

    await tx.match.update({ where: { id: match.id }, data: { status: 'PLAYED' } });

    // Подтвердить должен игрок из пары, которая счёт не вводила.
    const enteringTeam = input.teams.find((t) => t.userId === input.enteredById)!.team;
    const opponents = input.teams.filter((t) => t.team !== enteringTeam);

    await tx.notification.createMany({
      data: opponents.map((opponent) => ({
        userId: opponent.userId,
        type: 'RESULT_CONFIRM' as const,
        payload: toJson({ matchId: match.id, deadline: autoConfirmDeadline(input.now) }),
      })),
    });
  });
}

function assignTeams(
  players: readonly { userId: string }[],
  teams: readonly TeamAssignment[],
): void {
  if (teams.length !== players.length) {
    throw new MatchResultError('Нужно указать пару для каждого участника матча');
  }

  const known = new Set(players.map((player) => player.userId));
  for (const assignment of teams) {
    if (!known.has(assignment.userId)) {
      throw new MatchResultError(`Игрок ${assignment.userId} не участвует в этом матче`);
    }
  }

  const first = teams.filter((t) => t.team === 1).length;
  const second = teams.filter((t) => t.team === 2).length;
  if (first !== 2 || second !== 2) {
    throw new MatchResultError('В каждой паре должно быть по два игрока');
  }
}

/**
 * Подтверждение результата и, если матч рейтинговый, применение рейтинга.
 *
 * Всё в одной транзакции (ТЗ §7): подтверждение, дельты, уровни, события
 * рейтинга и уведомления. Частично применённый рейтинг починить нечем —
 * снимок «до» будет уже затёрт.
 */
export async function confirmMatchResult(
  prisma: PrismaClient,
  input: { matchId: string; userId: string; now: Date; config?: RatingConfig },
): Promise<AppliedRating> {
  return prisma.$transaction(async (tx) => {
    const match = await loadMatch(tx, input.matchId);

    if (!match.result) throw new MatchResultError('Счёт ещё не введён');
    if (match.result.confirmedAt) throw new MatchResultError('Результат уже подтверждён');
    if (match.result.disputedAt) throw new MatchResultError('Результат оспорен, нужен ручной разбор');

    const confirming = match.players.find((player) => player.userId === input.userId);
    if (!confirming) throw new MatchResultError('Подтвердить может только участник матча');

    const enteringTeam = match.players.find(
      (player) => player.userId === match.result!.enteredById,
    )?.team;

    if (enteringTeam !== undefined && confirming.team === enteringTeam) {
      throw new MatchResultError(
        'Подтвердить результат должен игрок из пары, которая счёт не вводила',
      );
    }

    await tx.matchResult.update({
      where: { matchId: match.id },
      data: { confirmedById: input.userId, confirmedAt: input.now },
    });

    return applyRatingForMatch(tx, input.matchId, input.config ?? RATING_CONFIG);
  });
}

/** Оспаривание: матч уходит в ручной разбор и на рейтинг не влияет (ТЗ §3.5 п. 3). */
export async function disputeMatchResult(
  prisma: PrismaClient,
  input: { matchId: string; userId: string; now: Date },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const match = await loadMatch(tx, input.matchId);

    if (!match.result) throw new MatchResultError('Счёт ещё не введён');
    if (match.result.confirmedAt) {
      throw new MatchResultError('Результат уже подтверждён, оспорить его нельзя');
    }
    if (!match.players.some((player) => player.userId === input.userId)) {
      throw new MatchResultError('Оспорить результат может только участник матча');
    }

    await tx.matchResult.update({
      where: { matchId: match.id },
      data: { disputedAt: input.now, skipReason: 'DISPUTED' },
    });
    await tx.match.update({ where: { id: match.id }, data: { status: 'DISPUTED' } });
  });
}

/**
 * Автоподтверждение: если за 48 часов никто не подтвердил и не оспорил,
 * результат засчитывается сам (ТЗ §3.5 п. 3).
 */
export async function autoConfirmDueResults(
  prisma: PrismaClient,
  now: Date,
  config: RatingConfig = RATING_CONFIG,
): Promise<{ matchId: string; result: AppliedRating }[]> {
  const due = await prisma.matchResult.findMany({
    where: {
      confirmedAt: null,
      disputedAt: null,
      enteredAt: { lte: autoConfirmCutoff(now) },
    },
    select: { matchId: true },
  });

  const applied: { matchId: string; result: AppliedRating }[] = [];

  for (const { matchId } of due) {
    const result = await prisma.$transaction(async (tx) => {
      await tx.matchResult.update({
        where: { matchId },
        data: { confirmedAt: now },
      });
      return applyRatingForMatch(tx, matchId, config);
    });

    applied.push({ matchId, result });
  }

  return applied;
}

async function loadMatch(tx: Tx, matchId: string) {
  const match = await tx.match.findUnique({
    where: { id: matchId },
    include: { players: true, result: true },
  });
  if (!match) throw new MatchResultError('Матч не найден');
  return match;
}

/**
 * Ядро: считает дельты и записывает их. Вызывается только внутри транзакции.
 */
async function applyRatingForMatch(
  tx: Tx,
  matchId: string,
  config: RatingConfig,
): Promise<AppliedRating> {
  const match = await loadMatch(tx, matchId);
  const result = match.result!;

  const teamA = match.players.filter((player) => player.team === 1);
  const teamB = match.players.filter((player) => player.team === 2);

  if (teamA.length !== 2 || teamB.length !== 2) {
    throw new MatchResultError('Состав пар не заполнен: рейтинг посчитать нельзя');
  }

  const playerIds = match.players.map((player) => player.userId);
  const occurredAt = new Date(match.startsAt.getTime() + match.durationMin * 60_000);

  const eligibility = resolveRatingEligibility(
    {
      isRated: match.isRated,
      confirmed: result.confirmedAt !== null,
      disputed: result.disputedAt !== null,
      totalGames: result.gamesA + result.gamesB,
      ratedMatchesToday: await countRatedMatchesToday(tx, playerIds, match.startsAt, matchId),
    },
    config,
  );

  if (!eligibility.eligible) {
    await tx.matchResult.update({
      where: { matchId },
      data: { isRatingApplied: false, skipReason: eligibility.reason ?? null },
    });
    await tx.match.update({ where: { id: matchId }, data: { status: 'COMPLETED' } });
    return { applied: false, ...(eligibility.reason ? { skipReason: eligibility.reason } : {}) };
  }

  const users = await tx.user.findMany({ where: { id: { in: playerIds } } });
  const byId = new Map(users.map((user) => [user.id, user]));

  const snapshot = (userId: string): PlayerSnapshot => {
    const user = byId.get(userId);
    if (!user) throw new MatchResultError(`Игрок ${userId} не найден`);

    return {
      id: user.id,
      level: toNumber(user.level),
      reliability: effectiveReliability(
        {
          reliabilityBase: toNumber(user.reliabilityBase),
          lastRatedMatchAt: user.lastRatedMatchAt,
          ratedMatchesCount: user.ratedMatchesCount,
        },
        occurredAt,
        config,
      ),
    };
  };

  const rating = computeMatchDeltas(
    {
      teamA: [snapshot(teamA[0]!.userId), snapshot(teamA[1]!.userId)],
      teamB: [snapshot(teamB[0]!.userId), snapshot(teamB[1]!.userId)],
      scoreA: result.gamesA,
      scoreB: result.gamesB,
      winner: result.winnerTeam === 1 ? 'A' : 'B',
      format: 'match',
      duration: durationFromSets((result.sets as unknown as SetScore[]).length),
      repeatCount: await countRepeats(tx, playerIds, match.startsAt, matchId),
    },
    config,
  );

  for (const delta of rating.deltas) {
    const user = byId.get(delta.playerId)!;

    const nextReliability = applyRatedMatch(
      {
        reliabilityBase: toNumber(user.reliabilityBase),
        lastRatedMatchAt: user.lastRatedMatchAt,
        ratedMatchesCount: user.ratedMatchesCount,
      },
      occurredAt,
      config,
    );

    const reliabilityBefore = effectiveReliability(
      {
        reliabilityBase: toNumber(user.reliabilityBase),
        lastRatedMatchAt: user.lastRatedMatchAt,
        ratedMatchesCount: user.ratedMatchesCount,
      },
      occurredAt,
      config,
    );

    await tx.user.update({
      where: { id: delta.playerId },
      data: {
        level: toLevelDecimal(delta.levelAfter),
        reliabilityBase: toLevelDecimal(nextReliability.reliabilityBase),
        reliability: toLevelDecimal(nextReliability.reliabilityBase),
        ratedMatchesCount: nextReliability.ratedMatchesCount,
        lastRatedMatchAt: occurredAt,
      },
    });

    await tx.ratingEvent.create({
      data: {
        userId: delta.playerId,
        matchId,
        occurredAt,
        levelBefore: toLevelDecimal(delta.levelBefore),
        levelAfter: toLevelDecimal(delta.levelAfter),
        delta: toDeltaDecimal(delta.delta),
        reliabilityBefore: toLevelDecimal(reliabilityBefore),
        reliabilityAfter: toLevelDecimal(nextReliability.reliabilityBase),
        snapshot: toJson({ input: rating.breakdown, team: delta.team }),
        configVersion: rating.configVersion,
      },
    });
  }

  await tx.matchResult.update({
    where: { matchId },
    data: { isRatingApplied: true, skipReason: null },
  });
  await tx.match.update({ where: { id: matchId }, data: { status: 'COMPLETED' } });

  await tx.notification.createMany({
    data: rating.deltas.map((delta) => ({
      userId: delta.playerId,
      type: 'RATING_CHANGED' as const,
      payload: toJson({
        matchId,
        levelBefore: delta.levelBefore,
        levelAfter: delta.levelAfter,
        delta: delta.delta,
      }),
    })),
  });

  return { applied: true, deltas: rating.deltas };
}

/**
 * Сколько рейтинговых матчей уже зачтено участникам в эти тбилисские сутки.
 * Берётся максимум по четверым: матч либо идёт в зачёт целиком, либо не идёт —
 * зачесть половине пары, а половине нет нельзя, дельты перестанут быть
 * сопоставимыми.
 */
async function countRatedMatchesToday(
  tx: Tx,
  playerIds: readonly string[],
  startsAt: Date,
  excludeMatchId: string,
): Promise<number> {
  const { start, end } = tbilisiDayRange(startsAt);

  const grouped = await tx.ratingEvent.groupBy({
    by: ['userId'],
    where: {
      userId: { in: [...playerIds] },
      occurredAt: { gte: start, lt: end },
      matchId: { not: excludeMatchId },
    },
    _count: { _all: true },
  });

  return grouped.reduce((max, row) => Math.max(max, row._count._all), 0);
}

/**
 * Который раз этот состав играет за последние 30 дней (ТЗ §3.5 п. 2).
 *
 * Состав считается по множеству из четырёх игроков, без учёта того, кто с кем
 * был в паре: накрутка — это повторная игра одной и той же компанией, а не
 * конкретная расстановка. Отсчёт строго по матчам раньше текущего, чтобы
 * пересчёт истории давал тот же ответ.
 */
async function countRepeats(
  tx: Tx,
  playerIds: readonly string[],
  startsAt: Date,
  excludeMatchId: string,
): Promise<number> {
  const candidates = await tx.match.findMany({
    where: {
      id: { not: excludeMatchId },
      startsAt: { gte: repeatWindowStart(startsAt), lt: startsAt },
      result: { isRatingApplied: true },
      AND: playerIds.map((userId) => ({ players: { some: { userId } } })),
    },
    select: { _count: { select: { players: true } } },
  });

  return candidates.filter((match) => match._count.players === playerIds.length).length + 1;
}
