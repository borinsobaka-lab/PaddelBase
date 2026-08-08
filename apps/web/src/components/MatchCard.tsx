import type { MatchCard as MatchCardData } from '@paddelbase/core';
import { formatLevel } from '@paddelbase/rating';
import Link from 'next/link';

import { CourtLineup } from './CourtLineup';
import { formatDay, formatDuration, formatSlots, formatTime } from '@/lib/format';

const ACTION_LABELS: Record<NonNullable<MatchCardData['needsAction']>, string> = {
  ENTER_SCORE: 'Введите счёт',
  CONFIRM_SCORE: 'Подтвердите счёт',
  REVIEW_APPLICATIONS: 'Есть отклики',
};

/**
 * Карточка матча.
 *
 * Иерархия внутри карточки: время — то, по чему игрок ищет матч в списке,
 * поэтому оно ведёт размером и насыщенностью. Корт и продолжительность идут
 * вторым уровнем, бейджи — третьим. Состав показан кортом, а не строкой имён:
 * из строки не видно, сколько мест свободно.
 */
export function MatchCard({
  match,
  viewerId,
  variant = 'feed',
  showDay = true,
}: {
  match: MatchCardData;
  viewerId?: string;
  /** feed — компактная карточка в ленте; focus — карточка, требующая действия. */
  variant?: 'feed' | 'focus';
  /** Выключается там, где день уже написан в заголовке группы. */
  showDay?: boolean;
}) {
  const action = match.needsAction;
  const focus = variant === 'focus';

  return (
    <Link
      href={`/matches/${match.id}`}
      className={`pressable block rounded-card ${
        action ? 'bg-ball-soft' : 'bg-surface'
      } ${focus ? 'p-4' : 'p-4'}`}
    >
      {action ? (
        <p className="mb-2 inline-flex items-center gap-1.5 rounded-chip bg-ball px-2 py-1 text-caption font-semibold uppercase tracking-wide text-ball-ink">
          {ACTION_LABELS[action]}
        </p>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-bold ${focus ? 'text-h2' : 'text-title'} leading-tight`}>
            <span className="figure">{formatTime(match.startsAt)}</span>
            {showDay ? (
              <span className="ml-2 font-normal text-text-secondary">
                {formatDay(match.startsAt)}
              </span>
            ) : null}
          </p>
          <p className="mt-1 truncate text-small text-muted">
            {match.courtName} · {formatDuration(match.durationMin)}
          </p>
        </div>

        {/* Помечается исключение, а не правило. Почти все матчи рейтинговые:
            плашка «рейтинг» на каждой карточке ничего не различала и просто
            добавляла зелёного в ленту, где акцент должен быть редкостью. */}
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          {match.isRated ? null : (
            <span className="rounded-chip bg-sunken px-1.5 py-0.5 text-caption font-medium text-text-secondary">
              без рейтинга
            </span>
          )}
          {match.courtBooked ? (
            <span className="text-caption text-muted">корт забронирован</span>
          ) : null}
        </div>
      </div>

      <div className="mt-3">
        <CourtLineup
          players={match.players}
          slotsMissing={match.slotsMissing}
          size={focus ? 'md' : 'sm'}
          {...(viewerId ? { highlightId: viewerId } : {})}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 text-small">
        {/* Свободные места уже показаны пунктиром на корте, поэтому строка их
            только называет и не берёт акцентный цвет: иначе зелёное «не хватает
            N» стоит на каждой карточке ленты и перестаёт что-либо значить. */}
        <span
          className={match.slotsMissing > 0 ? 'font-medium text-text-secondary' : 'text-muted'}
        >
          {formatSlots(match.slotsMissing)}
        </span>

        {match.levelMin !== null && match.levelMax !== null ? (
          <span className="figure shrink-0 text-muted">
            {formatLevel(match.levelMin)}–{formatLevel(match.levelMax)}
          </span>
        ) : match.averageLevel !== null ? (
          <span className="figure shrink-0 text-muted">
            ~{formatLevel(match.averageLevel)}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
