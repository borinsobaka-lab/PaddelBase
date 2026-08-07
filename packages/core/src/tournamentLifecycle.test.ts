import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  closeRound,
  createTournament,
  enterRoundScore,
  finishTournament,
  joinTournament,
  registerTeam,
  startTournament,
} from './tournamentLifecycle.js';
import { makeCourt, makePlayers, resetDatabase, testDatabaseUrl, testPrisma } from './testDb.js';

const NOW = new Date('2026-08-07T10:00:00Z');
const STARTS = new Date('2026-08-08T18:00:00Z');
const POINTS_PER_ROUND = 24;

const eight = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'];

describe.skipIf(!testDatabaseUrl)('турнир: жизненный цикл', () => {
  afterAll(async () => {
    if (testDatabaseUrl) await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  async function make(options: {
    format: 'AMERICANO' | 'MEXICANO' | 'TEAM_AMERICANO' | 'TEAM_MEXICANO';
    roundsCount?: number;
    courtsCount?: number;
    isRated?: boolean;
    maxParticipants?: number;
  }): Promise<string> {
    return createTournament(testPrisma, {
      organizerId: 'org',
      courtId: await makeCourt(`Корт ${options.format}`),
      format: options.format,
      isRated: options.isRated ?? true,
      startsAt: STARTS,
      durationMin: 180,
      courtsCount: options.courtsCount ?? 2,
      maxParticipants: options.maxParticipants ?? 16,
      pointsPerRound: POINTS_PER_ROUND,
      roundsCount: options.roundsCount ?? 3,
      seed: 'seed-1',
      now: NOW,
    });
  }

  /** Закрывает текущий раунд, выставив каждому корту счёт 16:8 в пользу первой пары. */
  async function playRound(tournamentId: string, roundNumber: number): Promise<void> {
    const round = await testPrisma.tournamentRound.findFirstOrThrow({
      where: { tournamentId, roundNumber },
      include: { matches: true },
    });

    for (const match of round.matches) {
      await enterRoundScore(testPrisma, {
        tournamentMatchId: match.id,
        organizerId: 'org',
        scoreA: 16,
        scoreB: 8,
      });
    }

    await closeRound(testPrisma, { tournamentId, roundNumber, organizerId: 'org', now: NOW });
  }

  describe('Американо', () => {
    beforeEach(async () => {
      await makePlayers(['org', ...eight]);
    });

    async function started(roundsCount = 3): Promise<string> {
      const id = await make({ format: 'AMERICANO', roundsCount });
      for (const userId of eight) await joinTournament(testPrisma, { tournamentId: id, userId });
      await startTournament(testPrisma, { tournamentId: id, organizerId: 'org', now: NOW });
      return id;
    }

    it('генерирует всю сетку сразу: партнёры не зависят от результатов', async () => {
      const id = await started(3);

      const rounds = await testPrisma.tournamentRound.findMany({
        where: { tournamentId: id },
        include: { matches: { include: { players: true } } },
        orderBy: { roundNumber: 'asc' },
      });

      expect(rounds).toHaveLength(3);
      for (const round of rounds) {
        expect(round.matches).toHaveLength(2);
        for (const match of round.matches) {
          expect(match.players).toHaveLength(4);
        }
      }
    });

    it('фиксирует снимок уровней на старте', async () => {
      const id = await started();
      const participants = await testPrisma.tournamentParticipant.findMany({
        where: { tournamentId: id },
      });

      expect(participants).toHaveLength(8);
      for (const participant of participants) {
        expect(Number(participant.levelAtStart)).toBe(3.5);
      }
    });

    it('требует минимум четырёх участников', async () => {
      const id = await make({ format: 'AMERICANO' });
      await joinTournament(testPrisma, { tournamentId: id, userId: 'a1' });

      await expect(
        startTournament(testPrisma, { tournamentId: id, organizerId: 'org', now: NOW }),
      ).rejects.toThrow(/минимум 4/);
    });

    it('запускает турнир только организатор', async () => {
      const id = await started();
      await expect(
        startTournament(testPrisma, { tournamentId: id, organizerId: 'a1', now: NOW }),
      ).rejects.toThrow(/уже идёт|только организатор/);
    });

    it('не закрывает раунд без счёта на всех кортах', async () => {
      const id = await started();

      await expect(
        closeRound(testPrisma, { tournamentId: id, roundNumber: 1, organizerId: 'org', now: NOW }),
      ).rejects.toThrow(/Не введён счёт/);
    });

    it('требует, чтобы сумма очков совпадала с номиналом раунда', async () => {
      const id = await started();
      const match = await testPrisma.tournamentMatch.findFirstOrThrow({
        where: { round: { tournamentId: id, roundNumber: 1 } },
      });

      await expect(
        enterRoundScore(testPrisma, {
          tournamentMatchId: match.id,
          organizerId: 'org',
          scoreA: 20,
          scoreB: 8,
        }),
      ).rejects.toThrow(/должна быть равна 24/);
    });

    it('ведёт таблицу и расставляет места по итогам', async () => {
      const id = await started(3);
      for (const roundNumber of [1, 2, 3]) await playRound(id, roundNumber);

      await finishTournament(testPrisma, { tournamentId: id, organizerId: 'org', now: NOW });

      const participants = await testPrisma.tournamentParticipant.findMany({
        where: { tournamentId: id },
        orderBy: { finalPlace: 'asc' },
      });

      expect(participants.map((p) => p.finalPlace)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      // За три раунда каждый набрал ровно три результата: 16 или 8 очков.
      for (const participant of participants) {
        expect(participant.points).toBeGreaterThanOrEqual(3 * 8);
        expect(participant.points).toBeLessThanOrEqual(3 * 16);
        expect(participant.points + participant.pointsAgainst).toBe(3 * POINTS_PER_ROUND);
      }
    });

    it('применяет рейтинг один раз за весь турнир', async () => {
      const id = await started(3);
      for (const roundNumber of [1, 2, 3]) await playRound(id, roundNumber);

      const applied = await finishTournament(testPrisma, {
        tournamentId: id,
        organizerId: 'org',
        now: NOW,
      });

      expect(applied.ratingApplied).toBe(true);

      // По одному событию на игрока, а не по одному на раунд.
      const events = await testPrisma.ratingEvent.findMany({ where: { tournamentId: id } });
      expect(events).toHaveLength(8);

      const user = await testPrisma.user.findUniqueOrThrow({ where: { id: 'a1' } });
      expect(user.ratedMatchesCount).toBe(1);
    });

    it('любительский турнир сохраняет результаты, но не трогает рейтинг', async () => {
      const id = await make({ format: 'AMERICANO', isRated: false, roundsCount: 1 });
      for (const userId of eight) await joinTournament(testPrisma, { tournamentId: id, userId });
      await startTournament(testPrisma, { tournamentId: id, organizerId: 'org', now: NOW });
      await playRound(id, 1);

      const applied = await finishTournament(testPrisma, {
        tournamentId: id,
        organizerId: 'org',
        now: NOW,
      });

      expect(applied.ratingApplied).toBe(false);
      expect(await testPrisma.ratingEvent.count()).toBe(0);

      const user = await testPrisma.user.findUniqueOrThrow({ where: { id: 'a1' } });
      expect(Number(user.level)).toBe(3.5);
    });

    it('не завершает турнир с незакрытыми раундами', async () => {
      const id = await started(3);
      await playRound(id, 1);

      await expect(
        finishTournament(testPrisma, { tournamentId: id, organizerId: 'org', now: NOW }),
      ).rejects.toThrow(/Не закрыт/);
    });
  });

  describe('Мексикано', () => {
    beforeEach(async () => {
      await makePlayers(['org', ...eight]);
    });

    it('генерирует раунды по одному, следующий — после закрытия предыдущего', async () => {
      const id = await make({ format: 'MEXICANO', roundsCount: 3 });
      for (const userId of eight) await joinTournament(testPrisma, { tournamentId: id, userId });
      await startTournament(testPrisma, { tournamentId: id, organizerId: 'org', now: NOW });

      expect(await testPrisma.tournamentRound.count({ where: { tournamentId: id } })).toBe(1);

      const next = await (async () => {
        await playRound(id, 1);
        return testPrisma.tournamentRound.count({ where: { tournamentId: id } });
      })();

      expect(next).toBe(2);
    });

    it('второй раунд собирает четвёрки по таблице', async () => {
      const id = await make({ format: 'MEXICANO', roundsCount: 2 });
      for (const userId of eight) await joinTournament(testPrisma, { tournamentId: id, userId });
      await startTournament(testPrisma, { tournamentId: id, organizerId: 'org', now: NOW });
      await playRound(id, 1);

      const standings = await testPrisma.tournamentParticipant.findMany({
        where: { tournamentId: id },
        orderBy: [{ points: 'desc' }, { userId: 'asc' }],
      });

      const round2 = await testPrisma.tournamentRound.findFirstOrThrow({
        where: { tournamentId: id, roundNumber: 2 },
        include: { matches: { include: { players: true }, orderBy: { courtNumber: 'asc' } } },
      });

      // Первый корт занимают четыре лидера таблицы.
      const topFour = new Set(standings.slice(0, 4).map((p) => p.userId));
      const onFirstCourt = new Set(round2.matches[0]!.players.map((p) => p.userId));

      expect(onFirstCourt).toEqual(topFour);
    });

    it('не даёт закрыть раунд дважды', async () => {
      const id = await make({ format: 'MEXICANO', roundsCount: 2 });
      for (const userId of eight) await joinTournament(testPrisma, { tournamentId: id, userId });
      await startTournament(testPrisma, { tournamentId: id, organizerId: 'org', now: NOW });
      await playRound(id, 1);

      await expect(
        closeRound(testPrisma, { tournamentId: id, roundNumber: 1, organizerId: 'org', now: NOW }),
      ).rejects.toThrow(/уже закрыт/);
    });
  });

  describe('отдыхающие', () => {
    beforeEach(async () => {
      await makePlayers(['org', ...eight, 'a9', 'a10']);
    });

    it('начисляет компенсационные очки пропустившим раунд', async () => {
      const id = await make({ format: 'MEXICANO', roundsCount: 1, courtsCount: 2 });
      for (const userId of [...eight, 'a9', 'a10']) {
        await joinTournament(testPrisma, { tournamentId: id, userId });
      }
      await startTournament(testPrisma, { tournamentId: id, organizerId: 'org', now: NOW });
      await playRound(id, 1);

      const resting = await testPrisma.tournamentParticipant.findMany({
        where: { tournamentId: id, restCount: { gt: 0 } },
      });

      expect(resting).toHaveLength(2);
      // Половина номинала раунда: 24 / 2 = 12.
      for (const participant of resting) {
        expect(participant.points).toBe(POINTS_PER_ROUND / 2);
      }
    });

    it('пропущенный раунд не даёт рейтингового события', async () => {
      const id = await make({ format: 'MEXICANO', roundsCount: 1, courtsCount: 2 });
      for (const userId of [...eight, 'a9', 'a10']) {
        await joinTournament(testPrisma, { tournamentId: id, userId });
      }
      await startTournament(testPrisma, { tournamentId: id, organizerId: 'org', now: NOW });
      await playRound(id, 1);
      await finishTournament(testPrisma, { tournamentId: id, organizerId: 'org', now: NOW });

      // Играли восемь из десяти — события только у них.
      expect(await testPrisma.ratingEvent.count({ where: { tournamentId: id } })).toBe(8);
    });
  });

  describe('командные форматы', () => {
    const players = ['t1a', 't1b', 't2a', 't2b', 't3a', 't3b', 't4a', 't4b'];

    beforeEach(async () => {
      await makePlayers(['org', ...players]);
    });

    async function withTeams(format: 'TEAM_AMERICANO' | 'TEAM_MEXICANO'): Promise<string> {
      const id = await make({ format, roundsCount: 3, courtsCount: 2, maxParticipants: 8 });

      for (const index of [1, 2, 3, 4]) {
        await registerTeam(testPrisma, {
          tournamentId: id,
          captainId: `t${index}a`,
          partnerId: `t${index}b`,
          name: `Команда ${index}`,
        });
      }

      await startTournament(testPrisma, { tournamentId: id, organizerId: 'org', now: NOW });
      return id;
    }

    it('регистрирует пару целиком и заводит обоих участников', async () => {
      const id = await make({ format: 'TEAM_AMERICANO', maxParticipants: 8 });
      await registerTeam(testPrisma, {
        tournamentId: id,
        captainId: 't1a',
        partnerId: 't1b',
      });

      const participants = await testPrisma.tournamentParticipant.findMany({
        where: { tournamentId: id },
      });
      expect(participants).toHaveLength(2);
      expect(new Set(participants.map((p) => p.teamId)).size).toBe(1);
    });

    it('не даёт заявить одного игрока в двух командах', async () => {
      const id = await make({ format: 'TEAM_AMERICANO', maxParticipants: 8 });
      await registerTeam(testPrisma, { tournamentId: id, captainId: 't1a', partnerId: 't1b' });

      await expect(
        registerTeam(testPrisma, { tournamentId: id, captainId: 't1a', partnerId: 't2b' }),
      ).rejects.toThrow(/уже заявлен/);
    });

    it('не пускает одиночную регистрацию в командный турнир', async () => {
      const id = await make({ format: 'TEAM_AMERICANO', maxParticipants: 8 });
      await expect(
        joinTournament(testPrisma, { tournamentId: id, userId: 't1a' }),
      ).rejects.toThrow(/регистрируются командой/);
    });

    it('проводит командный Американо от старта до рейтинга', async () => {
      const id = await withTeams('TEAM_AMERICANO');
      for (const roundNumber of [1, 2, 3]) await playRound(id, roundNumber);

      const applied = await finishTournament(testPrisma, {
        tournamentId: id,
        organizerId: 'org',
        now: NOW,
      });

      expect(applied.ratingApplied).toBe(true);

      const teams = await testPrisma.tournamentTeam.findMany({
        where: { tournamentId: id },
        orderBy: { finalPlace: 'asc' },
      });
      expect(teams.map((team) => team.finalPlace)).toEqual([1, 2, 3, 4]);
      expect(await testPrisma.ratingEvent.count({ where: { tournamentId: id } })).toBe(8);
    });

    it('командный Мексикано строит следующий раунд по таблице', async () => {
      const id = await withTeams('TEAM_MEXICANO');
      expect(await testPrisma.tournamentRound.count({ where: { tournamentId: id } })).toBe(1);

      await playRound(id, 1);
      expect(await testPrisma.tournamentRound.count({ where: { tournamentId: id } })).toBe(2);
    });
  });
});
