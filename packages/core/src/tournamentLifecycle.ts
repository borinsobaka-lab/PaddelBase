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
  applyRatedMatch,
  computeTournamentDeltas,
  effectiveReliability,
  type RatingConfig,
  type TournamentRoundInput,
} from '@paddelbase/rating';
import {
  computeIndividualStandings,
  computeTeamStandings,
  generateAmericanoSchedule,
  generateMexicanoRound,
  generateTeamAmericanoSchedule,
  generateTeamMexicanoRound,
  type RoundResult,
  type ScheduledRound,
  type ScheduledTeamRound,
  type StandingRow,
  type TeamRoundResult,
} from '@paddelbase/tournament';

type Tx = Prisma.TransactionClient;

export class TournamentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TournamentError';
  }
}

export const ALLOWED_POINTS_PER_ROUND = [16, 21, 24, 32] as const;

const TEAM_FORMATS = new Set(['TEAM_AMERICANO', 'TEAM_MEXICANO']);
/** Мексикано и его командная версия строят сетку раунд за раундом по таблице. */
const STANDINGS_DRIVEN_FORMATS = new Set(['MEXICANO', 'TEAM_MEXICANO']);

export type TournamentFormat = 'AMERICANO' | 'MEXICANO' | 'TEAM_AMERICANO' | 'TEAM_MEXICANO';

export function isTeamFormat(format: string): boolean {
  return TEAM_FORMATS.has(format);
}

// ---------------------------------------------------------------------------
// Создание и регистрация
// ---------------------------------------------------------------------------

export interface CreateTournamentInput {
  organizerId: string;
  courtId: string;
  format: TournamentFormat;
  isRated: boolean;
  visibility?: 'PUBLIC' | 'LINK';
  startsAt: Date;
  durationMin: number;
  courtsCount: number;
  maxParticipants: number;
  pointsPerRound: number;
  roundsCount: number;
  restCompensation?: number;
  feeAmount?: number;
  description?: string;
  /** Делает генерацию сетки воспроизводимой. */
  seed: string;
  now: Date;
}

export async function createTournament(
  prisma: PrismaClient,
  input: CreateTournamentInput,
): Promise<string> {
  if (input.startsAt <= input.now) {
    throw new TournamentError('Начало турнира не может быть в прошлом');
  }
  if (input.courtsCount < 1 || input.courtsCount > 6) {
    throw new TournamentError('Кортов может быть от 1 до 6');
  }
  if (!ALLOWED_POINTS_PER_ROUND.includes(input.pointsPerRound as (typeof ALLOWED_POINTS_PER_ROUND)[number])) {
    throw new TournamentError('Очков в раунде может быть 16, 21, 24 или 32');
  }
  if (input.roundsCount < 1) {
    throw new TournamentError('Раундов должно быть хотя бы один');
  }

  const teamFormat = isTeamFormat(input.format);
  const [min, max] = teamFormat ? [4, 16] : [4, 32];
  if (input.maxParticipants < min || input.maxParticipants > max) {
    throw new TournamentError(
      teamFormat
        ? 'В командном турнире может быть от 4 до 16 команд'
        : 'В турнире может быть от 4 до 32 участников',
    );
  }

  const tournament = await prisma.tournament.create({
    data: {
      organizerId: input.organizerId,
      courtId: input.courtId,
      format: input.format,
      isRated: input.isRated,
      visibility: input.visibility ?? 'PUBLIC',
      startsAt: input.startsAt,
      durationMin: input.durationMin,
      courtsCount: input.courtsCount,
      maxParticipants: input.maxParticipants,
      pointsPerRound: input.pointsPerRound,
      roundsCount: input.roundsCount,
      restCompensation: input.restCompensation ?? 0.5,
      ...(input.feeAmount === undefined ? {} : { feeAmount: input.feeAmount }),
      ...(input.description === undefined ? {} : { description: input.description }),
      status: 'REGISTRATION',
      seed: input.seed,
    },
  });

  return tournament.id;
}

export async function joinTournament(
  prisma: PrismaClient,
  input: { tournamentId: string; userId: string },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const tournament = await loadTournament(tx, input.tournamentId);

    if (tournament.status !== 'REGISTRATION') {
      throw new TournamentError('Регистрация на этот турнир закрыта');
    }
    if (isTeamFormat(tournament.format)) {
      throw new TournamentError('В командный турнир регистрируются командой');
    }
    if (tournament.participants.length >= tournament.maxParticipants) {
      throw new TournamentError('Мест больше нет');
    }
    if (tournament.participants.some((p) => p.userId === input.userId)) {
      throw new TournamentError('Вы уже зарегистрированы');
    }

    const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });

    // levelAtStart здесь предварительный: он перезаписывается снимком в момент
    // старта турнира. Хранить его сразу нужно, потому что колонка обязательная,
    // а актуальным он становится только на старте (ТЗ §3.6).
    await tx.tournamentParticipant.create({
      data: {
        tournamentId: tournament.id,
        userId: input.userId,
        levelAtStart: user.level,
        reliabilityAtStart: user.reliability,
      },
    });
  });
}

export async function leaveTournament(
  prisma: PrismaClient,
  input: { tournamentId: string; userId: string },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const tournament = await loadTournament(tx, input.tournamentId);

    if (tournament.status !== 'REGISTRATION') {
      throw new TournamentError('Турнир уже начался, сняться нельзя');
    }

    await tx.tournamentParticipant.deleteMany({
      where: { tournamentId: tournament.id, userId: input.userId },
    });
  });
}

/** Регистрация командой: капитан заявляет пару целиком (ТЗ §4.4). */
export async function registerTeam(
  prisma: PrismaClient,
  input: { tournamentId: string; captainId: string; partnerId: string; name?: string },
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const tournament = await loadTournament(tx, input.tournamentId);

    if (!isTeamFormat(tournament.format)) {
      throw new TournamentError('Этот турнир не командный');
    }
    if (tournament.status !== 'REGISTRATION') {
      throw new TournamentError('Регистрация на этот турнир закрыта');
    }
    if (input.captainId === input.partnerId) {
      throw new TournamentError('Капитан и партнёр должны быть разными игроками');
    }

    const teams = await tx.tournamentTeam.count({ where: { tournamentId: tournament.id } });
    if (teams >= tournament.maxParticipants) {
      throw new TournamentError('Мест больше нет');
    }

    const already = tournament.participants.filter((p) =>
      [input.captainId, input.partnerId].includes(p.userId),
    );
    if (already.length > 0) {
      throw new TournamentError('Один из игроков уже заявлен в этом турнире');
    }

    const users = await tx.user.findMany({
      where: { id: { in: [input.captainId, input.partnerId] } },
    });
    if (users.length !== 2) throw new TournamentError('Игрок не найден');

    const team = await tx.tournamentTeam.create({
      data: {
        tournamentId: tournament.id,
        captainId: input.captainId,
        ...(input.name === undefined ? {} : { name: input.name }),
      },
    });

    for (const user of users) {
      await tx.tournamentParticipant.create({
        data: {
          tournamentId: tournament.id,
          userId: user.id,
          teamId: team.id,
          levelAtStart: user.level,
          reliabilityAtStart: user.reliability,
        },
      });
    }

    return team.id;
  });
}

// ---------------------------------------------------------------------------
// Старт и раунды
// ---------------------------------------------------------------------------

/**
 * Старт турнира (ТЗ §4.6).
 *
 * Здесь фиксируется снимок уровней всех участников: весь турнир считается от
 * него, а не от уровней, обновляемых по ходу (ТЗ §3.6). Американо получает
 * расписание целиком — партнёры в нём не зависят от результатов; Мексикано
 * получает только первый раунд.
 */
export async function startTournament(
  prisma: PrismaClient,
  input: { tournamentId: string; organizerId: string; now: Date },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const tournament = await loadTournament(tx, input.tournamentId);

    if (tournament.organizerId !== input.organizerId) {
      throw new TournamentError('Запустить турнир может только организатор');
    }
    if (tournament.status === 'IN_PROGRESS') {
      throw new TournamentError('Турнир уже идёт');
    }
    if (tournament.status !== 'REGISTRATION' && tournament.status !== 'READY') {
      throw new TournamentError('Турнир нельзя запустить из текущего состояния');
    }

    const teamFormat = isTeamFormat(tournament.format);
    const entrantCount = teamFormat
      ? await tx.tournamentTeam.count({ where: { tournamentId: tournament.id } })
      : tournament.participants.length;

    if (entrantCount < 4) {
      throw new TournamentError(
        teamFormat ? 'Нужно минимум 4 команды' : 'Нужно минимум 4 участника',
      );
    }

    // Снимок уровней на старте: уровень мог измениться между регистрацией
    // и началом турнира.
    for (const participant of tournament.participants) {
      const user = await tx.user.findUniqueOrThrow({ where: { id: participant.userId } });
      const reliability = effectiveReliability(
        {
          reliabilityBase: toNumber(user.reliabilityBase),
          lastRatedMatchAt: user.lastRatedMatchAt,
          ratedMatchesCount: user.ratedMatchesCount,
        },
        input.now,
      );

      await tx.tournamentParticipant.update({
        where: { id: participant.id },
        data: {
          levelAtStart: user.level,
          reliabilityAtStart: toLevelDecimal(reliability),
          points: 0,
          pointsAgainst: 0,
          restCount: 0,
          finalPlace: null,
        },
      });
    }

    await tx.tournament.update({
      where: { id: tournament.id },
      data: { status: 'IN_PROGRESS' },
    });

    if (STANDINGS_DRIVEN_FORMATS.has(tournament.format)) {
      await generateNextRound(tx, tournament.id, 1);
    } else {
      await generateAllRounds(tx, tournament.id);
    }
  });
}

/** Ввод счёта раунда организатором (ТЗ §4.6). */
export async function enterRoundScore(
  prisma: PrismaClient,
  input: { tournamentMatchId: string; organizerId: string; scoreA: number; scoreB: number },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const match = await tx.tournamentMatch.findUnique({
      where: { id: input.tournamentMatchId },
      include: { round: { include: { tournament: true } } },
    });

    if (!match) throw new TournamentError('Матч раунда не найден');
    if (match.round.tournament.organizerId !== input.organizerId) {
      throw new TournamentError('Вводить счёт может только организатор');
    }
    if (match.round.status === 'COMPLETED') {
      throw new TournamentError('Раунд уже закрыт');
    }

    const limit = match.round.tournament.pointsPerRound;
    if (input.scoreA < 0 || input.scoreB < 0) {
      throw new TournamentError('Очки не могут быть отрицательными');
    }
    // Раунд играется до фиксированного числа очков: сумма ровно столько и даёт.
    if (input.scoreA + input.scoreB !== limit) {
      throw new TournamentError(
        `Сумма очков в раунде должна быть равна ${limit}, введено ${input.scoreA + input.scoreB}`,
      );
    }

    await tx.tournamentMatch.update({
      where: { id: match.id },
      data: { scoreA: input.scoreA, scoreB: input.scoreB, status: 'COMPLETED' },
    });
  });
}

/**
 * Закрытие раунда: пересчёт таблицы и, для Мексикано, генерация следующего.
 *
 * Таблица пересчитывается из всех сыгранных раундов, а не изменяется по частям:
 * инкрементальное накопление рано или поздно разъезжается с источником, а
 * пересчёт всегда даёт то же, что покажет история.
 */
export async function closeRound(
  prisma: PrismaClient,
  input: { tournamentId: string; roundNumber: number; organizerId: string; now: Date },
): Promise<{ nextRoundNumber: number | null }> {
  return prisma.$transaction(async (tx) => {
    const tournament = await loadTournament(tx, input.tournamentId);

    if (tournament.organizerId !== input.organizerId) {
      throw new TournamentError('Закрыть раунд может только организатор');
    }
    if (tournament.status !== 'IN_PROGRESS') {
      throw new TournamentError('Турнир не идёт');
    }

    const round = await tx.tournamentRound.findUnique({
      where: {
        tournamentId_roundNumber: {
          tournamentId: tournament.id,
          roundNumber: input.roundNumber,
        },
      },
      include: { matches: true },
    });

    if (!round) throw new TournamentError('Раунд не найден');
    if (round.status === 'COMPLETED') throw new TournamentError('Раунд уже закрыт');

    const missing = round.matches.filter((m) => m.scoreA === null || m.scoreB === null);
    if (missing.length > 0) {
      throw new TournamentError(`Не введён счёт на ${missing.length} корте(ах)`);
    }

    await tx.tournamentRound.update({
      where: { id: round.id },
      data: { status: 'COMPLETED', closedAt: input.now },
    });

    await recomputeStandings(tx, tournament.id);

    const played = await tx.tournamentRound.count({
      where: { tournamentId: tournament.id, status: 'COMPLETED' },
    });

    if (played >= tournament.roundsCount) return { nextRoundNumber: null };

    if (STANDINGS_DRIVEN_FORMATS.has(tournament.format)) {
      await generateNextRound(tx, tournament.id, input.roundNumber + 1);
      return { nextRoundNumber: input.roundNumber + 1 };
    }

    return { nextRoundNumber: input.roundNumber + 1 };
  });
}

/**
 * Завершение турнира: итоговые места и, если турнир рейтинговый, применение
 * рейтинга. Весь турнир — одно рейтинговое событие (ТЗ §3.6).
 */
export async function finishTournament(
  prisma: PrismaClient,
  input: { tournamentId: string; organizerId: string; now: Date; config?: RatingConfig },
): Promise<{ ratingApplied: boolean }> {
  const config = input.config ?? RATING_CONFIG;

  return prisma.$transaction(async (tx) => {
    const tournament = await loadTournament(tx, input.tournamentId);

    if (tournament.organizerId !== input.organizerId) {
      throw new TournamentError('Завершить турнир может только организатор');
    }
    if (tournament.status === 'COMPLETED') {
      throw new TournamentError('Турнир уже завершён');
    }
    if (tournament.status !== 'IN_PROGRESS') {
      throw new TournamentError('Турнир ещё не начинался');
    }

    const openRounds = await tx.tournamentRound.count({
      where: { tournamentId: tournament.id, status: { not: 'COMPLETED' } },
    });
    if (openRounds > 0) {
      throw new TournamentError(`Не закрыт${openRounds === 1 ? '' : 'о'} ${openRounds} раунд(ов)`);
    }

    const standings = await recomputeStandings(tx, tournament.id);
    await assignFinalPlaces(tx, tournament.id, standings, isTeamFormat(tournament.format));
    await tx.tournament.update({ where: { id: tournament.id }, data: { status: 'COMPLETED' } });

    if (!tournament.isRated) return { ratingApplied: false };

    // Момент рейтингового события выводится из расписания турнира, а не из
    // времени нажатия кнопки: иначе порядок событий зависел бы от того, когда
    // организатор вспомнил завершить турнир, и пересчёт истории дал бы другой
    // результат.
    await applyTournamentRating(tx, tournament.id, tournamentOccurredAt(tournament), config);
    return { ratingApplied: true };
  });
}

// ---------------------------------------------------------------------------
// Внутреннее
// ---------------------------------------------------------------------------

async function loadTournament(tx: Tx, tournamentId: string) {
  const tournament = await tx.tournament.findUnique({
    where: { id: tournamentId },
    include: { participants: true },
  });
  if (!tournament) throw new TournamentError('Турнир не найден');
  return tournament;
}

async function generateAllRounds(tx: Tx, tournamentId: string): Promise<void> {
  const tournament = await loadTournament(tx, tournamentId);

  if (isTeamFormat(tournament.format)) {
    const teams = await tx.tournamentTeam.findMany({
      where: { tournamentId },
      orderBy: { id: 'asc' },
    });

    const rounds = generateTeamAmericanoSchedule({
      teamIds: teams.map((team) => team.id),
      courtsCount: tournament.courtsCount,
      roundsCount: tournament.roundsCount,
      seed: tournament.seed,
    });

    for (const round of rounds) await persistTeamRound(tx, tournamentId, round);
    return;
  }

  const rounds = generateAmericanoSchedule({
    playerIds: tournament.participants.map((p) => p.userId),
    courtsCount: tournament.courtsCount,
    roundsCount: tournament.roundsCount,
    seed: tournament.seed,
  });

  for (const round of rounds) await persistRound(tx, tournamentId, round);
}

async function generateNextRound(tx: Tx, tournamentId: string, roundNumber: number): Promise<void> {
  const tournament = await loadTournament(tx, tournamentId);

  if (isTeamFormat(tournament.format)) {
    const teams = await tx.tournamentTeam.findMany({
      where: { tournamentId },
      orderBy: { id: 'asc' },
    });

    const levels = await teamLevels(tx, tournamentId);
    const previousMeetings = await playedTeamPairs(tx, tournamentId);

    const round = generateTeamMexicanoRound({
      roundNumber,
      teams: teams.map((team) => ({
        teamId: team.id,
        points: team.points,
        pointsDiff: team.points - team.pointsAgainst,
        restCount: team.restCount,
        level: levels.get(team.id) ?? 0,
      })),
      courtsCount: tournament.courtsCount,
      seed: tournament.seed,
      previousMeetings,
    });

    await persistTeamRound(tx, tournamentId, round);
    return;
  }

  const round = generateMexicanoRound({
    roundNumber,
    participants: tournament.participants.map((participant) => ({
      playerId: participant.userId,
      points: participant.points,
      pointsDiff: participant.points - participant.pointsAgainst,
      restCount: participant.restCount,
      level: toNumber(participant.levelAtStart),
    })),
    courtsCount: tournament.courtsCount,
    seed: tournament.seed,
  });

  await persistRound(tx, tournamentId, round);
}

async function persistRound(tx: Tx, tournamentId: string, round: ScheduledRound): Promise<void> {
  const created = await tx.tournamentRound.create({
    data: { tournamentId, roundNumber: round.roundNumber, status: 'IN_PROGRESS' },
  });

  for (const match of round.matches) {
    await tx.tournamentMatch.create({
      data: {
        roundId: created.id,
        courtNumber: match.courtNumber,
        status: 'IN_PROGRESS',
        players: {
          create: [
            ...match.teamA.map((userId) => ({ userId, team: 1 })),
            ...match.teamB.map((userId) => ({ userId, team: 2 })),
          ],
        },
      },
    });
  }
}

async function persistTeamRound(
  tx: Tx,
  tournamentId: string,
  round: ScheduledTeamRound,
): Promise<void> {
  const created = await tx.tournamentRound.create({
    data: { tournamentId, roundNumber: round.roundNumber, status: 'IN_PROGRESS' },
  });

  const members = await tx.tournamentParticipant.findMany({
    where: { tournamentId, teamId: { not: null } },
  });

  for (const match of round.matches) {
    await tx.tournamentMatch.create({
      data: {
        roundId: created.id,
        courtNumber: match.courtNumber,
        status: 'IN_PROGRESS',
        teamAId: match.teamA,
        teamBId: match.teamB,
        players: {
          create: [
            ...members
              .filter((m) => m.teamId === match.teamA)
              .map((m) => ({ userId: m.userId, team: 1 })),
            ...members
              .filter((m) => m.teamId === match.teamB)
              .map((m) => ({ userId: m.userId, team: 2 })),
          ],
        },
      },
    });
  }
}

async function loadPlayedRounds(tx: Tx, tournamentId: string) {
  return tx.tournamentRound.findMany({
    where: { tournamentId, status: 'COMPLETED' },
    include: { matches: { include: { players: true } } },
    orderBy: { roundNumber: 'asc' },
  });
}

/** Пересчёт таблицы из всех закрытых раундов и запись её в участников. */
async function recomputeStandings(tx: Tx, tournamentId: string): Promise<StandingRow[]> {
  const tournament = await loadTournament(tx, tournamentId);
  const rounds = await loadPlayedRounds(tx, tournamentId);

  const options = {
    pointsPerRound: tournament.pointsPerRound,
    restCompensation: toNumber(tournament.restCompensation),
  };

  if (isTeamFormat(tournament.format)) {
    const teams = await tx.tournamentTeam.findMany({ where: { tournamentId } });
    const teamIds = teams.map((team) => team.id);

    const teamRounds: TeamRoundResult[] = rounds.map((round) => {
      const playing = new Set<string>();
      const matches = round.matches
        .filter((match) => match.teamAId && match.teamBId)
        .map((match) => {
          playing.add(match.teamAId!);
          playing.add(match.teamBId!);
          return {
            teamA: match.teamAId!,
            teamB: match.teamBId!,
            scoreA: match.scoreA ?? 0,
            scoreB: match.scoreB ?? 0,
          };
        });

      return {
        roundNumber: round.roundNumber,
        matches,
        resting: teamIds.filter((id) => !playing.has(id)),
      };
    });

    const table = computeTeamStandings(teamIds, teamRounds, options);

    for (const row of table) {
      await tx.tournamentTeam.update({
        where: { id: row.id },
        data: {
          points: Math.round(row.points),
          pointsAgainst: Math.round(row.pointsAgainst),
          restCount: row.restCount,
        },
      });
    }

    return table;
  }

  const playerIds = tournament.participants.map((p) => p.userId);

  const playerRounds: RoundResult[] = rounds.map((round) => {
    const playing = new Set<string>();
    const matches = round.matches.map((match) => {
      const teamA = match.players.filter((p) => p.team === 1).map((p) => p.userId);
      const teamB = match.players.filter((p) => p.team === 2).map((p) => p.userId);
      for (const id of [...teamA, ...teamB]) playing.add(id);

      return {
        teamA: [teamA[0]!, teamA[1]!] as [string, string],
        teamB: [teamB[0]!, teamB[1]!] as [string, string],
        scoreA: match.scoreA ?? 0,
        scoreB: match.scoreB ?? 0,
      };
    });

    return {
      roundNumber: round.roundNumber,
      matches,
      resting: playerIds.filter((id) => !playing.has(id)),
    };
  });

  const table = computeIndividualStandings(playerIds, playerRounds, options);

  for (const row of table) {
    await tx.tournamentParticipant.updateMany({
      where: { tournamentId, userId: row.id },
      data: {
        points: Math.round(row.points),
        pointsAgainst: Math.round(row.pointsAgainst),
        restCount: row.restCount,
      },
    });
  }

  return table;
}

async function assignFinalPlaces(
  tx: Tx,
  tournamentId: string,
  standings: readonly StandingRow[],
  teamFormat: boolean,
): Promise<void> {
  for (const row of standings) {
    if (teamFormat) {
      await tx.tournamentTeam.update({ where: { id: row.id }, data: { finalPlace: row.place } });
    } else {
      await tx.tournamentParticipant.updateMany({
        where: { tournamentId, userId: row.id },
        data: { finalPlace: row.place },
      });
    }
  }
}

/**
 * Применение рейтинга по итогам турнира.
 *
 * Каждый раунд считается от снимка уровней на старте, дельты суммируются,
 * ограничиваются одним потолком и применяются один раз. ratedMatchesCount
 * растёт на единицу за весь турнир, а не за каждый раунд (ТЗ §3.6).
 */
async function applyTournamentRating(
  tx: Tx,
  tournamentId: string,
  now: Date,
  config: RatingConfig,
): Promise<void> {
  const tournament = await loadTournament(tx, tournamentId);
  const rounds = await loadPlayedRounds(tx, tournamentId);

  const roundInputs: TournamentRoundInput[] = [];
  for (const round of rounds) {
    for (const match of round.matches) {
      const teamA = match.players.filter((p) => p.team === 1).map((p) => p.userId);
      const teamB = match.players.filter((p) => p.team === 2).map((p) => p.userId);

      // Командные форматы тоже играются 2×2, так что вход движка одинаков.
      if (teamA.length !== 2 || teamB.length !== 2) continue;

      roundInputs.push({
        roundNumber: round.roundNumber,
        courtNumber: match.courtNumber,
        teamA: [teamA[0]!, teamA[1]!],
        teamB: [teamB[0]!, teamB[1]!],
        scoreA: match.scoreA ?? 0,
        scoreB: match.scoreB ?? 0,
      });
    }
  }

  if (roundInputs.length === 0) return;

  const result = computeTournamentDeltas(
    {
      format: isTeamFormat(tournament.format) ? 'teamTournament' : formatKey(tournament.format),
      duration: 'oneSet',
      levelsAtStart: tournament.participants.map((participant) => ({
        id: participant.userId,
        level: toNumber(participant.levelAtStart),
        reliability: toNumber(participant.reliabilityAtStart),
      })),
      rounds: roundInputs,
    },
    config,
  );

  for (const delta of result.deltas) {
    const user = await tx.user.findUniqueOrThrow({ where: { id: delta.playerId } });

    const before = {
      reliabilityBase: toNumber(user.reliabilityBase),
      lastRatedMatchAt: user.lastRatedMatchAt,
      ratedMatchesCount: user.ratedMatchesCount,
    };
    const reliabilityBefore = effectiveReliability(before, now, config);
    const after = applyRatedMatch(before, now, config);

    await tx.user.update({
      where: { id: delta.playerId },
      data: {
        level: toLevelDecimal(delta.levelAfter),
        reliabilityBase: toLevelDecimal(after.reliabilityBase),
        reliability: toLevelDecimal(after.reliabilityBase),
        ratedMatchesCount: after.ratedMatchesCount,
        lastRatedMatchAt: now,
      },
    });

    await tx.ratingEvent.create({
      data: {
        userId: delta.playerId,
        tournamentId,
        occurredAt: now,
        levelBefore: toLevelDecimal(delta.levelBefore),
        levelAfter: toLevelDecimal(delta.levelAfter),
        delta: toDeltaDecimal(delta.delta),
        reliabilityBefore: toLevelDecimal(reliabilityBefore),
        reliabilityAfter: toLevelDecimal(after.reliabilityBase),
        snapshot: toJson({
          playedRounds: delta.playedRounds,
          rawDelta: delta.rawDelta,
          wasClamped: delta.wasClamped,
          perRound: result.perRound.map((round) => ({
            roundNumber: round.roundNumber,
            breakdown: round.breakdown,
          })),
        }),
        configVersion: result.configVersion,
      },
    });
  }

  await tx.notification.createMany({
    data: result.deltas.map((delta) => ({
      userId: delta.playerId,
      type: 'RATING_CHANGED' as const,
      payload: toJson({
        tournamentId,
        levelBefore: delta.levelBefore,
        levelAfter: delta.levelAfter,
        delta: delta.delta,
      }),
    })),
  });
}

/** Канонический момент турнирного рейтингового события. */
export function tournamentOccurredAt(tournament: {
  startsAt: Date;
  durationMin: number;
}): Date {
  return new Date(tournament.startsAt.getTime() + tournament.durationMin * 60_000);
}

function formatKey(format: string): 'americano' | 'mexicano' {
  return format === 'MEXICANO' ? 'mexicano' : 'americano';
}

async function teamLevels(tx: Tx, tournamentId: string): Promise<Map<string, number>> {
  const participants = await tx.tournamentParticipant.findMany({
    where: { tournamentId, teamId: { not: null } },
  });

  const sums = new Map<string, { total: number; count: number }>();
  for (const participant of participants) {
    const entry = sums.get(participant.teamId!) ?? { total: 0, count: 0 };
    entry.total += toNumber(participant.levelAtStart);
    entry.count += 1;
    sums.set(participant.teamId!, entry);
  }

  return new Map(
    [...sums.entries()].map(([teamId, { total, count }]) => [teamId, count > 0 ? total / count : 0]),
  );
}

async function playedTeamPairs(tx: Tx, tournamentId: string): Promise<[string, string][]> {
  const rounds = await tx.tournamentRound.findMany({
    where: { tournamentId },
    include: { matches: true },
  });

  return rounds.flatMap((round) =>
    round.matches
      .filter((match) => match.teamAId && match.teamBId)
      .map((match) => [match.teamAId!, match.teamBId!] as [string, string]),
  );
}
