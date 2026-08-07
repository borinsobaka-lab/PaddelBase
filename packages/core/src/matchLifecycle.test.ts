import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  acceptApplication,
  applyToMatch,
  cancelMatch,
  createMatch,
  expireOpenMatches,
  leaveMatch,
  markPlayedMatches,
  rejectApplication,
  sendMatchReminders,
} from './matchLifecycle.js';
import { makeCourt, makePlayers, resetDatabase, testDatabaseUrl, testPrisma } from './testDb.js';

const NOW = new Date('2026-08-07T10:00:00Z');
const STARTS = new Date('2026-08-08T18:00:00Z');

describe.skipIf(!testDatabaseUrl)('жизненный цикл заявки на матч (ТЗ §4.1)', () => {
  afterAll(async () => {
    if (testDatabaseUrl) await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase();
    await makePlayers(['creator', 'friend', 'guest', 'other', 'fourth']);
  });

  async function open(slotsMissing: number, invited: string[] = []): Promise<string> {
    return createMatch(testPrisma, {
      creatorId: 'creator',
      courtId: await makeCourt(`Корт ${slotsMissing}-${invited.join('-')}`),
      startsAt: STARTS,
      durationMin: 90,
      isRated: true,
      slotsMissing,
      invitedUserIds: invited,
      now: NOW,
    });
  }

  describe('создание', () => {
    it('включает создателя и приглашённых в состав', async () => {
      const matchId = await open(1, ['friend', 'guest']);
      const players = await testPrisma.matchPlayer.findMany({ where: { matchId } });

      expect(players.map((p) => p.userId).sort()).toEqual(['creator', 'friend', 'guest']);
    });

    it('связывает «сколько не хватает» со списком уже играющих', async () => {
      await expect(open(1, ['friend'])).rejects.toThrow(/нужно указать 2/);
      await expect(open(3, ['friend'])).rejects.toThrow(/нужно указать 0/);
    });

    it('не принимает матч в прошлом', async () => {
      await expect(
        createMatch(testPrisma, {
          creatorId: 'creator',
          courtId: await makeCourt('Прошлое'),
          startsAt: new Date('2026-08-06T10:00:00Z'),
          durationMin: 90,
          isRated: true,
          slotsMissing: 3,
          now: NOW,
        }),
      ).rejects.toThrow(/в прошлом/);
    });

    it('не принимает произвольную продолжительность', async () => {
      await expect(
        createMatch(testPrisma, {
          creatorId: 'creator',
          courtId: await makeCourt('Длительность'),
          startsAt: STARTS,
          durationMin: 45,
          isRated: true,
          slotsMissing: 3,
          now: NOW,
        }),
      ).rejects.toThrow(/1, 1.5, 2 или 3 часа/);
    });

    it('не даёт добавить создателя дважды', async () => {
      await expect(open(2, ['creator'])).rejects.toThrow(/уже включён/);
    });
  });

  describe('отклики', () => {
    it('создаёт отклик и уведомляет создателя', async () => {
      const matchId = await open(1, ['friend', 'guest']);
      const { applicationId } = await applyToMatch(testPrisma, {
        matchId,
        userId: 'other',
        now: NOW,
      });

      const application = await testPrisma.matchApplication.findUniqueOrThrow({
        where: { id: applicationId },
      });
      expect(application.status).toBe('PENDING');

      const notification = await testPrisma.notification.findFirstOrThrow({
        where: { userId: 'creator', type: 'MATCH_APPLICATION' },
      });
      expect(notification).toBeTruthy();
    });

    it('предупреждает о выходе за желаемый диапазон уровня, но пропускает', async () => {
      const matchId = await createMatch(testPrisma, {
        creatorId: 'creator',
        courtId: await makeCourt('Диапазон'),
        startsAt: STARTS,
        durationMin: 90,
        isRated: true,
        slotsMissing: 3,
        levelMin: 4.0,
        levelMax: 5.0,
        now: NOW,
      });

      const result = await applyToMatch(testPrisma, { matchId, userId: 'other', now: NOW });
      expect(result.levelOutOfRange).toBe(true);
      expect(result.applicationId).toBeTruthy();
    });

    it('не даёт откликнуться дважды и участнику матча', async () => {
      const matchId = await open(1, ['friend', 'guest']);
      await applyToMatch(testPrisma, { matchId, userId: 'other', now: NOW });

      await expect(
        applyToMatch(testPrisma, { matchId, userId: 'other', now: NOW }),
      ).rejects.toThrow(/уже откликнулись/);
      await expect(
        applyToMatch(testPrisma, { matchId, userId: 'friend', now: NOW }),
      ).rejects.toThrow(/уже в составе/);
    });

    it('разрешает откликнуться заново после отказа', async () => {
      const matchId = await open(1, ['friend', 'guest']);
      const first = await applyToMatch(testPrisma, { matchId, userId: 'other', now: NOW });
      await rejectApplication(testPrisma, {
        applicationId: first.applicationId,
        creatorId: 'creator',
      });

      const second = await applyToMatch(testPrisma, { matchId, userId: 'other', now: NOW });
      expect(second.applicationId).toBe(first.applicationId);
    });

    it('принимает отклик только от создателя', async () => {
      const matchId = await open(1, ['friend', 'guest']);
      const { applicationId } = await applyToMatch(testPrisma, {
        matchId,
        userId: 'other',
        now: NOW,
      });

      await expect(
        acceptApplication(testPrisma, { applicationId, creatorId: 'friend', now: NOW }),
      ).rejects.toThrow(/только создатель/);
    });
  });

  describe('заполнение состава', () => {
    it('переводит заявку в FILLED и уведомляет всех', async () => {
      const matchId = await open(1, ['friend', 'guest']);
      const { applicationId } = await applyToMatch(testPrisma, {
        matchId,
        userId: 'other',
        now: NOW,
      });

      const { filled } = await acceptApplication(testPrisma, {
        applicationId,
        creatorId: 'creator',
        now: NOW,
      });

      expect(filled).toBe(true);
      const match = await testPrisma.match.findUniqueOrThrow({ where: { id: matchId } });
      expect(match.status).toBe('FILLED');
      expect(match.slotsMissing).toBe(0);
      expect(await testPrisma.notification.count({ where: { type: 'MATCH_FILLED' } })).toBe(4);
    });

    it('автоматически отклоняет оставшиеся отклики при заполнении', async () => {
      const matchId = await open(1, ['friend', 'guest']);
      const accepted = await applyToMatch(testPrisma, { matchId, userId: 'other', now: NOW });
      await applyToMatch(testPrisma, { matchId, userId: 'fourth', now: NOW });

      await acceptApplication(testPrisma, {
        applicationId: accepted.applicationId,
        creatorId: 'creator',
        now: NOW,
      });

      const leftover = await testPrisma.matchApplication.findFirstOrThrow({
        where: { matchId, userId: 'fourth' },
      });
      expect(leftover.status).toBe('REJECTED');
    });

    it('не принимает отклик, когда мест уже нет', async () => {
      const matchId = await open(1, ['friend', 'guest']);
      const first = await applyToMatch(testPrisma, { matchId, userId: 'other', now: NOW });
      const second = await applyToMatch(testPrisma, { matchId, userId: 'fourth', now: NOW });

      await acceptApplication(testPrisma, {
        applicationId: first.applicationId,
        creatorId: 'creator',
        now: NOW,
      });

      await expect(
        acceptApplication(testPrisma, {
          applicationId: second.applicationId,
          creatorId: 'creator',
          now: NOW,
        }),
      ).rejects.toThrow(/уже обработан|больше не открыта|мест уже нет/);
    });
  });

  describe('выход и отмена', () => {
    it('возвращает заявку в ленту, когда участник выходит', async () => {
      const matchId = await open(1, ['friend', 'guest']);
      const { applicationId } = await applyToMatch(testPrisma, {
        matchId,
        userId: 'other',
        now: NOW,
      });
      await acceptApplication(testPrisma, { applicationId, creatorId: 'creator', now: NOW });

      await leaveMatch(testPrisma, { matchId, userId: 'other', now: NOW });

      const match = await testPrisma.match.findUniqueOrThrow({ where: { id: matchId } });
      expect(match.status).toBe('OPEN');
      expect(match.slotsMissing).toBe(1);
      expect(await testPrisma.matchPlayer.count({ where: { matchId } })).toBe(3);
    });

    it('не даёт создателю выйти — только отменить', async () => {
      const matchId = await open(1, ['friend', 'guest']);

      await expect(
        leaveMatch(testPrisma, { matchId, userId: 'creator', now: NOW }),
      ).rejects.toThrow(/можно отменить/);

      await cancelMatch(testPrisma, { matchId, creatorId: 'creator' });
      const match = await testPrisma.match.findUniqueOrThrow({ where: { id: matchId } });
      expect(match.status).toBe('CANCELLED');
    });

    it('при отмене снимает висящие отклики', async () => {
      const matchId = await open(1, ['friend', 'guest']);
      await applyToMatch(testPrisma, { matchId, userId: 'other', now: NOW });

      await cancelMatch(testPrisma, { matchId, creatorId: 'creator' });

      const application = await testPrisma.matchApplication.findFirstOrThrow({
        where: { matchId },
      });
      expect(application.status).toBe('REJECTED');
    });
  });

  describe('фоновые переходы', () => {
    it('закрывает незаполненные заявки после времени начала', async () => {
      const matchId = await open(2, ['friend']);

      expect(await expireOpenMatches(testPrisma, new Date(STARTS.getTime() - 1))).toBe(0);
      expect(await expireOpenMatches(testPrisma, new Date(STARTS.getTime() + 1))).toBe(1);

      const match = await testPrisma.match.findUniqueOrThrow({ where: { id: matchId } });
      expect(match.status).toBe('EXPIRED');
    });

    it('переводит заполненный матч в PLAYED после окончания и зовёт ввести счёт', async () => {
      const matchId = await open(1, ['friend', 'guest']);
      const { applicationId } = await applyToMatch(testPrisma, {
        matchId,
        userId: 'other',
        now: NOW,
      });
      await acceptApplication(testPrisma, { applicationId, creatorId: 'creator', now: NOW });

      const beforeEnd = new Date(STARTS.getTime() + 89 * 60_000);
      expect(await markPlayedMatches(testPrisma, beforeEnd)).toEqual([]);

      const afterEnd = new Date(STARTS.getTime() + 91 * 60_000);
      expect(await markPlayedMatches(testPrisma, afterEnd)).toEqual([matchId]);

      const match = await testPrisma.match.findUniqueOrThrow({ where: { id: matchId } });
      expect(match.status).toBe('PLAYED');
      expect(await testPrisma.notification.count({ where: { type: 'RESULT_ENTER' } })).toBe(4);
    });

    it('шлёт напоминание за два часа и не дублирует его при повторном запуске', async () => {
      const matchId = await open(1, ['friend', 'guest']);
      const { applicationId } = await applyToMatch(testPrisma, {
        matchId,
        userId: 'other',
        now: NOW,
      });
      await acceptApplication(testPrisma, { applicationId, creatorId: 'creator', now: NOW });

      const twoHoursBefore = new Date(STARTS.getTime() - 2 * 60 * 60 * 1000);

      await sendMatchReminders(testPrisma, twoHoursBefore);
      await sendMatchReminders(testPrisma, twoHoursBefore);

      expect(await testPrisma.notification.count({ where: { type: 'MATCH_REMINDER' } })).toBe(4);
    });
  });
});
