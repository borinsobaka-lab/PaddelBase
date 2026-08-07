import { toJson, toLevelDecimal, toNumber, type PrismaClient, type Prisma } from '@paddelbase/db';

/**
 * Жизненный цикл заявки на матч (ТЗ §4.1).
 *
 * ```
 * draft → open → filled → played → completed
 *           ↓
 *     cancelled / expired
 * ```
 *
 * Все операции принимают `now` параметром и не читают системное время: это
 * делает переходы проверяемыми тестом и одинаковыми при повторном прогоне.
 */

export class MatchLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MatchLifecycleError';
  }
}

export const MATCH_SLOTS_TOTAL = 4;
export const ALLOWED_DURATIONS_MIN = [60, 90, 120, 180] as const;

/** За сколько до начала уходит напоминание участникам (ТЗ §8). */
export const REMINDER_LEAD_HOURS = 2;

export interface CreateMatchInput {
  creatorId: string;
  courtId: string;
  startsAt: Date;
  durationMin: number;
  isRated: boolean;
  visibility?: 'PUBLIC' | 'LINK';
  /** Сколько игроков не хватает: 1, 2 или 3. */
  slotsMissing: number;
  /** Те, с кем создатель уже договорился. Создатель в список не входит. */
  invitedUserIds?: readonly string[];
  courtBooked?: boolean;
  levelMin?: number;
  levelMax?: number;
  comment?: string;
  now: Date;
}

export async function createMatch(
  prisma: PrismaClient,
  input: CreateMatchInput,
): Promise<string> {
  if (input.startsAt <= input.now) {
    throw new MatchLifecycleError('Начало матча не может быть в прошлом');
  }
  if (!ALLOWED_DURATIONS_MIN.includes(input.durationMin as (typeof ALLOWED_DURATIONS_MIN)[number])) {
    throw new MatchLifecycleError('Продолжительность может быть 1, 1.5, 2 или 3 часа');
  }
  if (!Number.isInteger(input.slotsMissing) || input.slotsMissing < 1 || input.slotsMissing > 3) {
    throw new MatchLifecycleError('Не хватать может от одного до трёх игроков');
  }

  const invited = [...new Set(input.invitedUserIds ?? [])];
  if (invited.includes(input.creatorId)) {
    throw new MatchLifecycleError('Создатель уже включён в состав, добавлять его не нужно');
  }

  // Число слотов = 4 − (создатель + добавленные). Это связывает поле
  // «сколько не хватает» со списком уже играющих: рассогласование здесь
  // означало бы заявку, которая никогда не заполнится.
  const expectedInvited = MATCH_SLOTS_TOTAL - input.slotsMissing - 1;
  if (invited.length !== expectedInvited) {
    throw new MatchLifecycleError(
      `При нехватке ${input.slotsMissing} игроков нужно указать ${expectedInvited} уже играющих, указано ${invited.length}`,
    );
  }

  if (input.levelMin !== undefined && input.levelMax !== undefined && input.levelMin > input.levelMax) {
    throw new MatchLifecycleError('Нижняя граница уровня выше верхней');
  }
  if (input.comment !== undefined && input.comment.length > 500) {
    throw new MatchLifecycleError('Комментарий не длиннее 500 символов');
  }

  const match = await prisma.match.create({
    data: {
      creatorId: input.creatorId,
      courtId: input.courtId,
      startsAt: input.startsAt,
      durationMin: input.durationMin,
      isRated: input.isRated,
      visibility: input.visibility ?? 'PUBLIC',
      slotsMissing: input.slotsMissing,
      courtBooked: input.courtBooked ?? false,
      ...(input.levelMin === undefined ? {} : { levelMin: toLevelDecimal(input.levelMin) }),
      ...(input.levelMax === undefined ? {} : { levelMax: toLevelDecimal(input.levelMax) }),
      ...(input.comment === undefined ? {} : { comment: input.comment }),
      status: 'OPEN',
      players: {
        create: [input.creatorId, ...invited].map((userId) => ({ userId })),
      },
    },
  });

  return match.id;
}

export interface ApplyResult {
  applicationId: string;
  /** Уровень вне желаемого диапазона: предупреждаем, но не блокируем (ТЗ §4.1). */
  levelOutOfRange: boolean;
}

export async function applyToMatch(
  prisma: PrismaClient,
  input: { matchId: string; userId: string; message?: string; now: Date },
): Promise<ApplyResult> {
  return prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({
      where: { id: input.matchId },
      include: { players: true, applications: true },
    });

    if (!match) throw new MatchLifecycleError('Матч не найден');
    if (match.status !== 'OPEN') throw new MatchLifecycleError('Заявка больше не открыта');
    if (match.startsAt <= input.now) throw new MatchLifecycleError('Матч уже начался');
    if (match.players.some((player) => player.userId === input.userId)) {
      throw new MatchLifecycleError('Вы уже в составе этого матча');
    }

    const existing = match.applications.find((app) => app.userId === input.userId);
    if (existing && existing.status === 'PENDING') {
      throw new MatchLifecycleError('Вы уже откликнулись на эту заявку');
    }

    const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
    const level = toNumber(user.level);
    const levelOutOfRange =
      (match.levelMin !== null && level < toNumber(match.levelMin)) ||
      (match.levelMax !== null && level > toNumber(match.levelMax));

    // Повторный отклик после отказа разрешён: состав мог поменяться.
    const application = existing
      ? await tx.matchApplication.update({
          where: { id: existing.id },
          data: {
            status: 'PENDING',
            ...(input.message === undefined ? {} : { message: input.message }),
          },
        })
      : await tx.matchApplication.create({
          data: {
            matchId: match.id,
            userId: input.userId,
            ...(input.message === undefined ? {} : { message: input.message }),
          },
        });

    await tx.notification.create({
      data: {
        userId: match.creatorId,
        type: 'MATCH_APPLICATION',
        payload: toJson({ matchId: match.id, applicationId: application.id, userId: input.userId }),
      },
    });

    return { applicationId: application.id, levelOutOfRange };
  });
}

export async function acceptApplication(
  prisma: PrismaClient,
  input: { applicationId: string; creatorId: string; now: Date },
): Promise<{ filled: boolean }> {
  return prisma.$transaction(async (tx) => {
    const application = await tx.matchApplication.findUnique({
      where: { id: input.applicationId },
      include: { match: true },
    });

    if (!application) throw new MatchLifecycleError('Отклик не найден');
    if (application.match.creatorId !== input.creatorId) {
      throw new MatchLifecycleError('Управлять откликами может только создатель матча');
    }
    if (application.status !== 'PENDING') {
      throw new MatchLifecycleError('Этот отклик уже обработан');
    }
    if (application.match.status !== 'OPEN') {
      throw new MatchLifecycleError('Заявка больше не открыта');
    }

    // Условное уменьшение вместо «прочитать и записать»: два отклика, принятых
    // одновременно, иначе переполнили бы состав.
    const claimed = await tx.match.updateMany({
      where: { id: application.matchId, slotsMissing: { gt: 0 } },
      data: { slotsMissing: { decrement: 1 } },
    });

    if (claimed.count === 0) {
      throw new MatchLifecycleError('Свободных мест уже нет');
    }

    await tx.matchPlayer.create({
      data: { matchId: application.matchId, userId: application.userId },
    });
    await tx.matchApplication.update({
      where: { id: application.id },
      data: { status: 'ACCEPTED' },
    });
    await tx.notification.create({
      data: {
        userId: application.userId,
        type: 'APPLICATION_ACCEPTED',
        payload: toJson({ matchId: application.matchId }),
      },
    });

    const match = await tx.match.findUniqueOrThrow({
      where: { id: application.matchId },
      include: { players: true },
    });

    if (match.slotsMissing > 0) return { filled: false };

    await tx.match.update({ where: { id: match.id }, data: { status: 'FILLED' } });

    // Оставшиеся отклики отклоняются автоматически: держать людей в подвешенном
    // состоянии на заполненной заявке незачем.
    const pending = await tx.matchApplication.findMany({
      where: { matchId: match.id, status: 'PENDING' },
    });

    if (pending.length > 0) {
      await tx.matchApplication.updateMany({
        where: { matchId: match.id, status: 'PENDING' },
        data: { status: 'REJECTED' },
      });
      await tx.notification.createMany({
        data: pending.map((app) => ({
          userId: app.userId,
          type: 'APPLICATION_REJECTED' as const,
          payload: toJson({ matchId: match.id, reason: 'FILLED' }),
        })),
      });
    }

    await tx.notification.createMany({
      data: match.players.map((player) => ({
        userId: player.userId,
        type: 'MATCH_FILLED' as const,
        payload: toJson({ matchId: match.id }),
      })),
    });

    return { filled: true };
  });
}

export async function rejectApplication(
  prisma: PrismaClient,
  input: { applicationId: string; creatorId: string },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const application = await tx.matchApplication.findUnique({
      where: { id: input.applicationId },
      include: { match: true },
    });

    if (!application) throw new MatchLifecycleError('Отклик не найден');
    if (application.match.creatorId !== input.creatorId) {
      throw new MatchLifecycleError('Управлять откликами может только создатель матча');
    }
    if (application.status !== 'PENDING') {
      throw new MatchLifecycleError('Этот отклик уже обработан');
    }

    await tx.matchApplication.update({
      where: { id: application.id },
      data: { status: 'REJECTED' },
    });
    await tx.notification.create({
      data: {
        userId: application.userId,
        type: 'APPLICATION_REJECTED',
        payload: toJson({ matchId: application.matchId }),
      },
    });
  });
}

/**
 * Выход из состава. Создатель выйти не может — заявка без создателя осталась бы
 * без ответственного за приём откликов и ввод счёта; ему доступна отмена.
 */
export async function leaveMatch(
  prisma: PrismaClient,
  input: { matchId: string; userId: string; now: Date },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({
      where: { id: input.matchId },
      include: { players: true },
    });

    if (!match) throw new MatchLifecycleError('Матч не найден');
    if (match.creatorId === input.userId) {
      throw new MatchLifecycleError('Создатель не может выйти из матча — заявку можно отменить');
    }
    if (!match.players.some((player) => player.userId === input.userId)) {
      throw new MatchLifecycleError('Вы не в составе этого матча');
    }
    if (match.status !== 'OPEN' && match.status !== 'FILLED') {
      throw new MatchLifecycleError('Из этого матча выйти уже нельзя');
    }

    await tx.matchPlayer.delete({
      where: { matchId_userId: { matchId: match.id, userId: input.userId } },
    });
    await tx.match.update({
      where: { id: match.id },
      data: { slotsMissing: { increment: 1 }, status: 'OPEN' },
    });

    // Освободившееся место снова видно в ленте — сообщаем создателю.
    await tx.notification.create({
      data: {
        userId: match.creatorId,
        type: 'MATCH_APPLICATION',
        payload: toJson({ matchId: match.id, left: input.userId }),
      },
    });
  });
}

export async function cancelMatch(
  prisma: PrismaClient,
  input: { matchId: string; creatorId: string },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({
      where: { id: input.matchId },
      include: { players: true },
    });

    if (!match) throw new MatchLifecycleError('Матч не найден');
    if (match.creatorId !== input.creatorId) {
      throw new MatchLifecycleError('Отменить матч может только создатель');
    }
    if (match.status === 'COMPLETED' || match.status === 'CANCELLED') {
      throw new MatchLifecycleError('Этот матч уже завершён');
    }

    await tx.match.update({ where: { id: match.id }, data: { status: 'CANCELLED' } });
    await tx.matchApplication.updateMany({
      where: { matchId: match.id, status: 'PENDING' },
      data: { status: 'REJECTED' },
    });

    const others = match.players.filter((player) => player.userId !== match.creatorId);
    if (others.length > 0) {
      await tx.notification.createMany({
        data: others.map((player) => ({
          userId: player.userId,
          type: 'MATCH_REMINDER' as const,
          payload: toJson({ matchId: match.id, cancelled: true }),
        })),
      });
    }
  });
}

// --- Фоновые переходы ---

/** Незаполненные заявки, у которых прошло время начала, закрываются. */
export async function expireOpenMatches(prisma: PrismaClient, now: Date): Promise<number> {
  const { count } = await prisma.match.updateMany({
    where: { status: 'OPEN', startsAt: { lt: now } },
    data: { status: 'EXPIRED' },
  });
  return count;
}

/**
 * Заполненные матчи, у которых прошло время окончания, переводятся в PLAYED:
 * участникам показывается форма ввода счёта (ТЗ §4.1).
 */
export async function markPlayedMatches(prisma: PrismaClient, now: Date): Promise<string[]> {
  const candidates = await prisma.match.findMany({
    where: { status: 'FILLED' },
    include: { players: true },
  });

  const due = candidates.filter(
    (match) => endsAt(match.startsAt, match.durationMin).getTime() <= now.getTime(),
  );

  for (const match of due) {
    await prisma.$transaction(async (tx) => {
      await tx.match.update({ where: { id: match.id }, data: { status: 'PLAYED' } });
      await tx.notification.createMany({
        data: match.players.map((player) => ({
          userId: player.userId,
          type: 'RESULT_ENTER' as const,
          payload: toJson({ matchId: match.id }),
        })),
      });
    });
  }

  return due.map((match) => match.id);
}

/**
 * Напоминание за два часа до начала.
 *
 * Окно — `[now + 2ч, now + 2ч + шаг)`, то есть вперёд от целевого момента, а не
 * назад: матч, начинающийся ровно через два часа, обязан попасть в рассылку, а
 * при окне назад он не попал бы ни в один запуск. Соседние окна стыкуются без
 * зазоров и перекрытий, поэтому шаг задачи должен совпадать с `windowMinutes`.
 * От повторного запуска в том же окне защищает проверка уже отправленных.
 */
export async function sendMatchReminders(
  prisma: PrismaClient,
  now: Date,
  windowMinutes = 15,
): Promise<string[]> {
  const target = now.getTime() + REMINDER_LEAD_HOURS * 60 * 60 * 1000;

  const matches = await prisma.match.findMany({
    where: {
      status: 'FILLED',
      startsAt: {
        gte: new Date(target),
        lt: new Date(target + windowMinutes * 60 * 1000),
      },
    },
    include: { players: true },
  });

  for (const match of matches) {
    const already = await prisma.notification.count({
      where: {
        type: 'MATCH_REMINDER',
        payload: { path: ['matchId'], equals: match.id },
      },
    });
    if (already > 0) continue;

    await prisma.notification.createMany({
      data: match.players.map((player) => ({
        userId: player.userId,
        type: 'MATCH_REMINDER' as const,
        payload: toJson({ matchId: match.id, startsAt: match.startsAt }),
      })),
    });
  }

  return matches.map((match) => match.id);
}

export function endsAt(startsAt: Date, durationMin: number): Date {
  return new Date(startsAt.getTime() + durationMin * 60_000);
}

export type MatchWithPlayers = Prisma.MatchGetPayload<{ include: { players: true } }>;
