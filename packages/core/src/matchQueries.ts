import { toNumber, type PrismaClient } from '@paddelbase/db';

import { fullName } from './onboarding.js';
import { endsAt } from './matchLifecycle.js';

/**
 * Чтение лент матчей и турниров для экранов (ТЗ §5.1, §5.7).
 *
 * Карточки собираются здесь, а не в компонентах: экранам нужен один и тот же
 * набор полей, а средний уровень состава и число свободных мест считаются
 * из связей — размазывать это по вёрстке значит рано или поздно разойтись.
 */

export interface PlayerBadge {
  id: string;
  name: string;
  level: number;
}

export interface MatchCard {
  id: string;
  startsAt: Date;
  endsAt: Date;
  durationMin: number;
  isRated: boolean;
  courtBooked: boolean;
  status: string;
  courtName: string;
  courtCity: string;
  creatorId: string;
  players: PlayerBadge[];
  slotsMissing: number;
  /** Средний уровень уже собранного состава: по нему видно, «мой» ли это матч. */
  averageLevel: number | null;
  levelMin: number | null;
  levelMax: number | null;
  comment: string | null;
  /** Текущий игрок уже откликнулся и ждёт ответа. */
  hasPendingApplication: boolean;
  pendingApplications: number;
  /**
   * Что приложение ждёт от смотрящего прямо сейчас.
   *
   * Считается здесь, а не в вёрстке: экран должен уметь поставить такой матч
   * первым и выделить его, а для этого ему нужен готовый ответ, а не набор
   * флагов, из которых он будет выводить его сам — и по-своему на каждом
   * экране.
   */
  needsAction: 'ENTER_SCORE' | 'CONFIRM_SCORE' | 'REVIEW_APPLICATIONS' | null;
}

type MatchWithRelations = Awaited<ReturnType<typeof loadMatches>>[number];

async function loadMatches(prisma: PrismaClient, where: object) {
  return prisma.match.findMany({
    where,
    include: {
      court: true,
      players: { include: { user: { select: { id: true, firstName: true, lastName: true, level: true } } } },
      applications: { select: { userId: true, status: true } },
      result: { select: { enteredById: true, confirmedAt: true, disputedAt: true } },
    },
    orderBy: { startsAt: 'asc' },
  });
}

function resolveAction(
  match: MatchWithRelations,
  viewerId: string | undefined,
): MatchCard['needsAction'] {
  if (!viewerId) return null;

  const isPlayer = match.players.some((player) => player.userId === viewerId);
  const pending = match.applications.filter((app) => app.status === 'PENDING').length;

  if (match.creatorId === viewerId && match.status === 'OPEN' && pending > 0) {
    return 'REVIEW_APPLICATIONS';
  }
  if (!isPlayer) return null;

  if (match.status === 'PLAYED' && match.result === null) return 'ENTER_SCORE';

  const awaitingConfirmation =
    match.result !== null &&
    match.result.confirmedAt === null &&
    match.result.disputedAt === null &&
    match.result.enteredById !== viewerId;

  return awaitingConfirmation ? 'CONFIRM_SCORE' : null;
}

function toCard(match: MatchWithRelations, viewerId?: string): MatchCard {
  const players = match.players.map((player) => ({
    id: player.user.id,
    name: fullName(player.user),
    level: toNumber(player.user.level),
  }));

  return {
    id: match.id,
    startsAt: match.startsAt,
    endsAt: endsAt(match.startsAt, match.durationMin),
    durationMin: match.durationMin,
    isRated: match.isRated,
    courtBooked: match.courtBooked,
    status: match.status,
    courtName: match.court.name,
    courtCity: match.court.city,
    creatorId: match.creatorId,
    players,
    slotsMissing: match.slotsMissing,
    averageLevel:
      players.length === 0
        ? null
        : players.reduce((sum, player) => sum + player.level, 0) / players.length,
    levelMin: match.levelMin === null ? null : toNumber(match.levelMin),
    levelMax: match.levelMax === null ? null : toNumber(match.levelMax),
    comment: match.comment,
    hasPendingApplication:
      viewerId !== undefined &&
      match.applications.some((app) => app.userId === viewerId && app.status === 'PENDING'),
    pendingApplications: match.applications.filter((app) => app.status === 'PENDING').length,
    needsAction: resolveAction(match, viewerId),
  };
}

/** Матчи, где игрок в составе: предстоящие и требующие ввода счёта. */
export async function listMyMatches(
  prisma: PrismaClient,
  input: { userId: string; now: Date },
): Promise<MatchCard[]> {
  const matches = await loadMatches(prisma, {
    OR: [{ players: { some: { userId: input.userId } } }, { creatorId: input.userId }],
    status: { in: ['OPEN', 'FILLED', 'PLAYED'] },
  });

  // Матчи, ждущие действия, идут первыми: главный экран показывает их наверху,
  // и сортировать по дате там, где счёт не введён третьи сутки, бессмысленно.
  return matches
    .map((match) => toCard(match, input.userId))
    .sort((a, b) => {
      if (Boolean(a.needsAction) !== Boolean(b.needsAction)) return a.needsAction ? -1 : 1;
      return a.startsAt.getTime() - b.startsAt.getTime();
    });
}

/**
 * Открытые заявки других игроков.
 *
 * Скрываются те, где игрок уже в составе: они и так показаны в «моих матчах»,
 * а дублировать карточку в двух лентах — верный способ запутать (ТЗ §5.1).
 */
export async function listOpenMatches(
  prisma: PrismaClient,
  input: { viewerId: string; now: Date; limit?: number },
): Promise<MatchCard[]> {
  const matches = await loadMatches(prisma, {
    status: 'OPEN',
    visibility: 'PUBLIC',
    startsAt: { gt: input.now },
    players: { none: { userId: input.viewerId } },
  });

  return matches.slice(0, input.limit ?? 20).map((match) => toCard(match, input.viewerId));
}

export async function getMatch(
  prisma: PrismaClient,
  input: { matchId: string; viewerId: string },
): Promise<MatchCard | null> {
  const matches = await loadMatches(prisma, { id: input.matchId });
  const match = matches[0];
  return match ? toCard(match, input.viewerId) : null;
}

export interface ApplicationCard {
  id: string;
  userId: string;
  name: string;
  level: number;
  reliability: number;
  message: string | null;
  createdAt: Date;
}

export async function listPendingApplications(
  prisma: PrismaClient,
  input: { matchId: string },
): Promise<ApplicationCard[]> {
  const applications = await prisma.matchApplication.findMany({
    where: { matchId: input.matchId, status: 'PENDING' },
    include: { user: true },
    orderBy: { createdAt: 'asc' },
  });

  return applications.map((application) => ({
    id: application.id,
    userId: application.userId,
    name: fullName(application.user),
    level: toNumber(application.user.level),
    reliability: toNumber(application.user.reliability),
    message: application.message,
    createdAt: application.createdAt,
  }));
}

export interface TournamentCard {
  id: string;
  format: string;
  isRated: boolean;
  startsAt: Date;
  courtName: string;
  status: string;
  participants: number;
  maxParticipants: number;
  feeAmount: number | null;
}

export async function listOpenTournaments(
  prisma: PrismaClient,
  input: { now: Date; limit?: number },
): Promise<TournamentCard[]> {
  const tournaments = await prisma.tournament.findMany({
    where: { status: 'REGISTRATION', visibility: 'PUBLIC', startsAt: { gt: input.now } },
    include: { court: true, _count: { select: { participants: true } } },
    orderBy: { startsAt: 'asc' },
    take: input.limit ?? 20,
  });

  return tournaments.map((tournament) => ({
    id: tournament.id,
    format: tournament.format,
    isRated: tournament.isRated,
    startsAt: tournament.startsAt,
    courtName: tournament.court.name,
    status: tournament.status,
    participants: tournament._count.participants,
    maxParticipants: tournament.maxParticipants,
    feeAmount: tournament.feeAmount,
  }));
}

export async function listCourts(prisma: PrismaClient) {
  return prisma.court.findMany({
    where: { isActive: true },
    orderBy: [{ city: 'asc' }, { name: 'asc' }],
  });
}

/** Изменения уровня по матчу — для показа «3.50 → 3.51» после подтверждения (ТЗ §5.3). */
export async function listMatchRatingChanges(
  prisma: PrismaClient,
  input: { matchId: string },
): Promise<{ userId: string; name: string; levelBefore: number; levelAfter: number; delta: number }[]> {
  const events = await prisma.ratingEvent.findMany({
    where: { matchId: input.matchId },
    include: { user: { select: { firstName: true, lastName: true } } },
  });

  return events.map((event) => ({
    userId: event.userId,
    name: fullName(event.user),
    levelBefore: toNumber(event.levelBefore),
    levelAfter: toNumber(event.levelAfter),
    delta: toNumber(event.delta),
  }));
}

export interface HistoryEntry {
  matchId: string;
  playedAt: Date;
  courtName: string;
  isRated: boolean;
  score: string;
  won: boolean;
  partnerName: string | null;
  opponentNames: string[];
  levelBefore: number | null;
  levelAfter: number | null;
  delta: number | null;
}

/**
 * История сыгранных матчей игрока (ТЗ §5.6).
 *
 * Нужна не только для статистики: без неё завершённый матч исчезает из всех
 * лент и вернуться к нему становится неоткуда.
 */
export async function listMatchHistory(
  prisma: PrismaClient,
  input: { userId: string; limit?: number },
): Promise<HistoryEntry[]> {
  const matches = await prisma.match.findMany({
    where: {
      players: { some: { userId: input.userId } },
      status: { in: ['COMPLETED', 'DISPUTED'] },
      result: { isNot: null },
    },
    include: {
      court: true,
      result: true,
      players: { include: { user: { select: { firstName: true, lastName: true } } } },
      ratingEvents: { where: { userId: input.userId } },
    },
    orderBy: { startsAt: 'desc' },
    take: input.limit ?? 30,
  });

  return matches.map((match) => {
    const me = match.players.find((player) => player.userId === input.userId);
    const myTeam = me?.team ?? null;
    const event = match.ratingEvents[0] ?? null;

    const partner = match.players.find(
      (player) => player.userId !== input.userId && player.team === myTeam && myTeam !== null,
    );
    const opponents = match.players.filter(
      (player) => myTeam !== null && player.team !== null && player.team !== myTeam,
    );

    const sets = (match.result!.sets as unknown as { a: number; b: number }[]) ?? [];

    return {
      matchId: match.id,
      playedAt: match.startsAt,
      courtName: match.court.name,
      isRated: match.isRated,
      // Счёт всегда показываем с точки зрения игрока: «6:4» и «4:6» — разные
      // вещи, и переворачивать его в голове никто не должен.
      score: sets
        .map((set) => (myTeam === 2 ? `${set.b}:${set.a}` : `${set.a}:${set.b}`))
        .join(', '),
      won: myTeam !== null && match.result!.winnerTeam === myTeam,
      partnerName: partner ? fullName(partner.user) : null,
      opponentNames: opponents.map((player) => fullName(player.user)),
      levelBefore: event ? toNumber(event.levelBefore) : null,
      levelAfter: event ? toNumber(event.levelAfter) : null,
      delta: event ? toNumber(event.delta) : null,
    };
  });
}
