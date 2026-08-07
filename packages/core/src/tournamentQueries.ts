import { toNumber, type PrismaClient } from '@paddelbase/db';

import { fullName } from './onboarding.js';
import { isTeamFormat } from './tournamentLifecycle.js';

/**
 * Чтение турнира для экранов (ТЗ §5.4).
 *
 * Таблица не пересчитывается здесь заново: очки уже записаны в участников при
 * закрытии раунда, и второй источник тех же чисел рано или поздно разошёлся бы
 * с первым.
 */

export interface TournamentDetails {
  id: string;
  format: string;
  isTeam: boolean;
  isRated: boolean;
  status: string;
  startsAt: Date;
  durationMin: number;
  courtName: string;
  courtCity: string;
  courtsCount: number;
  pointsPerRound: number;
  roundsCount: number;
  maxParticipants: number;
  restCompensation: number;
  feeAmount: number | null;
  description: string | null;
  organizerId: string;
  organizerName: string;
  participantsCount: number;
  teamsCount: number;
  /** Сколько раундов уже закрыто — по этому числу видно, где турнир стоит. */
  closedRounds: number;
}

export async function getTournamentDetails(
  prisma: PrismaClient,
  input: { tournamentId: string },
): Promise<TournamentDetails | null> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: input.tournamentId },
    include: {
      court: true,
      organizer: { select: { firstName: true, lastName: true } },
      _count: { select: { participants: true, teams: true } },
    },
  });

  if (!tournament) return null;

  const closedRounds = await prisma.tournamentRound.count({
    where: { tournamentId: tournament.id, status: 'COMPLETED' },
  });

  return {
    id: tournament.id,
    format: tournament.format,
    isTeam: isTeamFormat(tournament.format),
    isRated: tournament.isRated,
    status: tournament.status,
    startsAt: tournament.startsAt,
    durationMin: tournament.durationMin,
    courtName: tournament.court.name,
    courtCity: tournament.court.city,
    courtsCount: tournament.courtsCount,
    pointsPerRound: tournament.pointsPerRound,
    roundsCount: tournament.roundsCount,
    maxParticipants: tournament.maxParticipants,
    restCompensation: toNumber(tournament.restCompensation),
    feeAmount: tournament.feeAmount,
    description: tournament.description,
    organizerId: tournament.organizerId,
    organizerName: fullName(tournament.organizer),
    participantsCount: tournament._count.participants,
    teamsCount: tournament._count.teams,
    closedRounds,
  };
}

export interface StandingsRow {
  /** Идентификатор игрока или команды. */
  id: string;
  name: string;
  level: number | null;
  points: number;
  pointsAgainst: number;
  pointsDiff: number;
  restCount: number;
  finalPlace: number | null;
  /** Состав команды — только для командных форматов. */
  members: string[];
}

/**
 * Живой зачёт. Порядок берётся из сохранённых очков; при равенстве —
 * разница очков, затем имя, чтобы список не «плавал» между обновлениями.
 */
export async function getStandings(
  prisma: PrismaClient,
  input: { tournamentId: string },
): Promise<StandingsRow[]> {
  const tournament = await prisma.tournament.findUniqueOrThrow({
    where: { id: input.tournamentId },
  });

  if (isTeamFormat(tournament.format)) {
    const teams = await prisma.tournamentTeam.findMany({
      where: { tournamentId: input.tournamentId },
      include: { participants: { include: { user: true } } },
    });

    return teams
      .map((team) => ({
        id: team.id,
        name: team.name ?? team.participants.map((p) => p.user.firstName).join(' и '),
        level:
          team.participants.length === 0
            ? null
            : team.participants.reduce((sum, p) => sum + toNumber(p.levelAtStart), 0) /
              team.participants.length,
        points: team.points,
        pointsAgainst: team.pointsAgainst,
        pointsDiff: team.points - team.pointsAgainst,
        restCount: team.restCount,
        finalPlace: team.finalPlace,
        members: team.participants.map((p) => fullName(p.user)),
      }))
      .sort(compareRows);
  }

  const participants = await prisma.tournamentParticipant.findMany({
    where: { tournamentId: input.tournamentId },
    include: { user: true },
  });

  return participants
    .map((participant) => ({
      id: participant.userId,
      name: fullName(participant.user),
      level: toNumber(participant.levelAtStart),
      points: participant.points,
      pointsAgainst: participant.pointsAgainst,
      pointsDiff: participant.points - participant.pointsAgainst,
      restCount: participant.restCount,
      finalPlace: participant.finalPlace,
      members: [],
    }))
    .sort(compareRows);
}

function compareRows(a: StandingsRow, b: StandingsRow): number {
  if (a.finalPlace !== null && b.finalPlace !== null) return a.finalPlace - b.finalPlace;
  if (b.points !== a.points) return b.points - a.points;
  if (b.pointsDiff !== a.pointsDiff) return b.pointsDiff - a.pointsDiff;
  return a.name.localeCompare(b.name, 'ru');
}

export interface RoundMatchView {
  id: string;
  courtNumber: number;
  teamA: string[];
  teamB: string[];
  teamAName: string | null;
  teamBName: string | null;
  scoreA: number | null;
  scoreB: number | null;
}

export interface RoundView {
  id: string;
  roundNumber: number;
  status: string;
  matches: RoundMatchView[];
  /** Кто пропускает раунд. Выводится из состава: отдельного поля нет и не нужно. */
  resting: string[];
}

export async function listRounds(
  prisma: PrismaClient,
  input: { tournamentId: string },
): Promise<RoundView[]> {
  const [rounds, participants, teams] = await Promise.all([
    prisma.tournamentRound.findMany({
      where: { tournamentId: input.tournamentId },
      include: {
        matches: {
          include: { players: { include: { user: true } } },
          orderBy: { courtNumber: 'asc' },
        },
      },
      orderBy: { roundNumber: 'asc' },
    }),
    prisma.tournamentParticipant.findMany({
      where: { tournamentId: input.tournamentId },
      include: { user: true },
    }),
    prisma.tournamentTeam.findMany({ where: { tournamentId: input.tournamentId } }),
  ]);

  const teamNames = new Map(teams.map((team) => [team.id, team.name ?? 'Команда']));
  const everyone = participants.map((participant) => ({
    id: participant.userId,
    name: fullName(participant.user),
  }));

  return rounds.map((round) => {
    const playing = new Set<string>();

    const matches = round.matches.map((match) => {
      const teamA = match.players.filter((player) => player.team === 1);
      const teamB = match.players.filter((player) => player.team === 2);
      for (const player of match.players) playing.add(player.userId);

      return {
        id: match.id,
        courtNumber: match.courtNumber,
        teamA: teamA.map((player) => fullName(player.user)),
        teamB: teamB.map((player) => fullName(player.user)),
        teamAName: match.teamAId ? (teamNames.get(match.teamAId) ?? null) : null,
        teamBName: match.teamBId ? (teamNames.get(match.teamBId) ?? null) : null,
        scoreA: match.scoreA,
        scoreB: match.scoreB,
      };
    });

    return {
      id: round.id,
      roundNumber: round.roundNumber,
      status: round.status,
      matches,
      resting: everyone.filter((person) => !playing.has(person.id)).map((person) => person.name),
    };
  });
}

export interface ParticipantView {
  userId: string;
  name: string;
  level: number;
  reliability: number;
  teamId: string | null;
  teamName: string | null;
}

export async function listParticipants(
  prisma: PrismaClient,
  input: { tournamentId: string },
): Promise<ParticipantView[]> {
  const participants = await prisma.tournamentParticipant.findMany({
    where: { tournamentId: input.tournamentId },
    include: { user: true, team: true },
    orderBy: { joinedAt: 'asc' },
  });

  return participants.map((participant) => ({
    userId: participant.userId,
    name: fullName(participant.user),
    level: toNumber(participant.levelAtStart),
    reliability: toNumber(participant.user.reliability),
    teamId: participant.teamId,
    teamName: participant.team?.name ?? null,
  }));
}

/** Изменения уровня по итогам турнира — для показа после завершения. */
export async function listTournamentRatingChanges(
  prisma: PrismaClient,
  input: { tournamentId: string },
): Promise<{ userId: string; name: string; levelBefore: number; levelAfter: number; delta: number }[]> {
  const events = await prisma.ratingEvent.findMany({
    where: { tournamentId: input.tournamentId },
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
