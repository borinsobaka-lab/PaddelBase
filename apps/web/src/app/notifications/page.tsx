import { listNotifications } from '@paddelbase/core';
import { prisma } from '@paddelbase/db';
import Link from 'next/link';

import { AppShell } from '@/components/AppShell';
import { BackLink, EmptyState, Panel } from '@/components/ui';
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
    <AppShell>
      <main className="flex flex-col gap-3">
        <BackLink href="/home" label="На главную" />

        {/* Заголовок и «прочитать всё» на одной строке: раньше кнопка во всю
            ширину стояла отдельным блоком и весила больше самого списка. */}
        <header className="flex items-end justify-between gap-3 rounded-card bg-surface px-4 pb-4 pt-5">
          <div>
            <h1 className="text-h1 font-extrabold">Уведомления</h1>
            {unread > 0 ? (
              <p className="mt-1 text-small text-text-secondary">Непрочитанных: {unread}</p>
            ) : null}
          </div>

          {unread > 0 ? (
            <form action={markAllRead}>
              <button
                type="submit"
                className="pressable -mb-2 -mr-2 min-h-11 px-2 text-body font-medium text-accent"
              >
                Прочитать всё
              </button>
            </form>
          ) : null}
        </header>

        {notifications.length === 0 ? (
          <EmptyState
            title="Пока тихо"
            hint="Здесь появятся отклики на заявки, напоминания о матчах и изменения уровня."
          />
        ) : (
          <Panel className="!p-0">
            <ul className="flex flex-col">
            {notifications.map((notification) => {
              const href = linkFor(notification.payload);
              const detail = detailFor(notification.type, notification.payload);

              const content = (
                <>
                  <div className="flex items-start gap-2">
                    {/* Непрочитанное помечено точкой, а не жирным текстом:
                        жирный уже занят самим заголовком уведомления. */}
                    <span
                      aria-hidden
                      className={`mt-1 size-2 shrink-0 rounded-full ${
                        notification.isRead ? 'bg-transparent' : 'bg-accent'
                      }`}
                    />
                    <div className="min-w-0">
                      <p
                        className={`text-body leading-snug ${
                          notification.isRead ? 'text-text-secondary' : 'font-medium'
                        }`}
                      >
                        {TEXTS[notification.type] ?? notification.type}
                      </p>
                      {detail ? (
                        <p className="figure mt-1 text-body font-semibold">{detail}</p>
                      ) : null}
                      <p className="mt-1 text-small text-muted">
                        {formatDateTime(notification.createdAt)}
                      </p>
                    </div>
                  </div>
                </>
              );

              return (
                <li key={notification.id} className="border-b border-border last:border-0">
                    {href ? (
                      <Link href={href} className="pressable block p-4">
                        {content}
                      </Link>
                    ) : (
                      <div className="p-4">{content}</div>
                    )}
                  </li>
              );
            })}
            </ul>
          </Panel>
        )}
      </main>
    </AppShell>
  );
}
