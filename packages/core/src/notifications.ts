import { toJson, type PrismaClient } from '@paddelbase/db';

/**
 * Уведомления (ТЗ §8).
 *
 * Пишутся доменными операциями с самого начала; здесь — чтение и отметка
 * прочитанного. Доставка в Telegram появится вместе с самим Telegram: сейчас
 * уведомление живёт только внутри приложения.
 */

export interface NotificationView {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  isRead: boolean;
  createdAt: Date;
}

export async function listNotifications(
  prisma: PrismaClient,
  input: { userId: string; limit?: number },
): Promise<NotificationView[]> {
  const notifications = await prisma.notification.findMany({
    where: { userId: input.userId },
    orderBy: { createdAt: 'desc' },
    take: input.limit ?? 50,
  });

  return notifications.map((notification) => ({
    id: notification.id,
    type: notification.type,
    payload: (notification.payload as Record<string, unknown>) ?? {},
    isRead: notification.isRead,
    createdAt: notification.createdAt,
  }));
}

export async function countUnread(
  prisma: PrismaClient,
  input: { userId: string },
): Promise<number> {
  return prisma.notification.count({ where: { userId: input.userId, isRead: false } });
}

/**
 * Отметить прочитанными. Без списка id — все: экран уведомлений открывают
 * целиком, и оставлять счётчик непрочитанных после просмотра незачем.
 */
export async function markNotificationsRead(
  prisma: PrismaClient,
  input: { userId: string; ids?: readonly string[] },
): Promise<number> {
  const { count } = await prisma.notification.updateMany({
    where: {
      userId: input.userId,
      isRead: false,
      ...(input.ids ? { id: { in: [...input.ids] } } : {}),
    },
    data: { isRead: true },
  });

  return count;
}

/** Служебное: пригодится, когда появится доставка в Telegram. */
export async function createNotification(
  prisma: PrismaClient,
  input: { userId: string; type: string; payload: unknown },
): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type as never,
      payload: toJson(input.payload),
    },
  });
}
