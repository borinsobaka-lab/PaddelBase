import { listNotifications } from '@paddelbase/core';
import { prisma } from '@paddelbase/db';
import Link from 'next/link';

import { Button, Card, PageTitle } from '@/components/ui';
import { requireOnboardedUser } from '@/lib/currentUser';
import { formatDateTime } from '@/lib/format';

import { markAllRead } from './actions';

/** Тексты уведомлений (ТЗ §8). Ссылка ведёт туда, где от игрока ждут действия. */
const TEXTS: Record<string, string> = {
  MATCH_APPLICATION: 'Новый отклик на вашу заявку',
  APPLICATION_ACCEPTED: 'Ваш отклик приняли',
  APPLICATION_REJECTED: 'Ваш отклик отклонили',
  MATCH_FILLED: 'Состав матча собран',
  MATCH_REMINDER: 'Матч скоро начнётся',
  RESULT_ENTER: 'Матч сыгран — введите счёт',
  RESULT_CONFIRM: 'Подтвердите счёт матча',
  RATING_CHANGED: 'Ваш уровень изменился',
  TOURNAMENT_ROUND: 'Готов новый раунд турнира',
  POST_COMMENT: 'Комментарий к вашему посту',
};

function linkFor(payload: Record<string, unknown>): string | null {
  if (typeof payload.matchId === 'string') return `/matches/${payload.matchId}`;
  if (typeof payload.tournamentId === 'string') return `/tournaments/${payload.tournamentId}`;
  if (typeof payload.postId === 'string') return `/community/${payload.postId}`;
  return null;
}

function detailFor(type: string, payload: Record<string, unknown>): string | null {
  if (type !== 'RATING_CHANGED') return null;
  const before = payload.levelBefore;
  const after = payload.levelAfter;
  if (typeof before !== 'number' || typeof after !== 'number') return null;
  return `${before.toFixed(2)} → ${after.toFixed(2)}`;
}

export default async function NotificationsPage() {
  const user = await requireOnboardedUser();
  const notifications = await listNotifications(prisma, { userId: user.id, limit: 50 });
  const unread = notifications.filter((item) => !item.isRead).length;

  return (
    <main className="flex flex-col gap-4 pb-10">
      <div className="pt-6">
        <Link href="/home" className="text-sm text-muted">
          ← Главная
        </Link>
      </div>

      <PageTitle>Уведомления</PageTitle>

      {unread > 0 ? (
        <form action={markAllRead}>
          <Button type="submit" variant="ghost">
            Отметить всё прочитанным
          </Button>
        </form>
      ) : null}

      {notifications.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            Уведомлений пока нет. Здесь появятся отклики на заявки, напоминания о матчах и
            изменения уровня.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {notifications.map((notification) => {
            const href = linkFor(notification.payload);
            const detail = detailFor(notification.type, notification.payload);

            const content = (
              <>
                <p className="text-sm font-medium">
                  {TEXTS[notification.type] ?? notification.type}
                </p>
                {detail ? <p className="tabular mt-0.5 text-sm">{detail}</p> : null}
                <p className="mt-1 text-xs text-muted">{formatDateTime(notification.createdAt)}</p>
              </>
            );

            return (
              <li key={notification.id}>
                {/* Непрочитанные помечены полосой слева, а не жирным текстом:
                    жирный уже занят самим заголовком уведомления. */}
                <div
                  className={`rounded-card border bg-surface p-3 ${
                    notification.isRead ? 'border-border' : 'border-l-4 border-l-accent border-border'
                  }`}
                >
                  {href ? (
                    <Link href={href} className="block">
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
