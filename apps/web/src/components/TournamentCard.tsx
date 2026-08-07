import type { TournamentCard as TournamentCardData } from '@paddelbase/core';
import Link from 'next/link';

import { TOURNAMENT_FORMAT_NAMES, formatDay, formatTime, plural } from '@/lib/format';

/**
 * Карточка турнира. Устроена по той же иерархии, что и карточка матча: время
 * ведёт, место и формат идут вторым уровнем. Раньше формат, дата и корт шли
 * одной строкой и на ширине ленты переносились на три.
 */
export function TournamentCard({ tournament }: { tournament: TournamentCardData }) {
  const free = tournament.maxParticipants - tournament.participants;
  const filled = tournament.participants / tournament.maxParticipants;

  return (
    <Link
      href={`/tournaments/${tournament.id}`}
      className="pressable block rounded-card bg-surface p-3.5 shadow-raise hover:shadow-lift"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold leading-tight">
            <span className="tabular">{formatTime(tournament.startsAt)}</span>
            <span className="ml-2 font-normal text-text-secondary">
              {formatDay(tournament.startsAt)}
            </span>
          </p>
          <p className="mt-1 truncate text-sm text-muted">
            {TOURNAMENT_FORMAT_NAMES[tournament.format]} · {tournament.courtName}
          </p>
        </div>

        {tournament.isRated ? null : (
          <span className="shrink-0 rounded-chip bg-sunken px-1.5 py-0.5 text-[11px] font-medium text-text-secondary">
            без рейтинга
          </span>
        )}
      </div>

      {/* Заполненность полосой, а не только цифрами: по ней сразу видно,
          успеваешь ли ты записаться. */}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken">
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${Math.round(filled * 100)}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 text-[13px]">
        <span className={free > 0 ? 'font-medium text-text-secondary' : 'text-muted'}>
          {free > 0
            ? `свободно ${free} ${plural(free, 'место', 'места', 'мест')}`
            : 'мест нет'}
        </span>
        <span className="tabular shrink-0 text-muted">
          {tournament.participants} / {tournament.maxParticipants}
          {tournament.feeAmount ? ` · ${tournament.feeAmount} ₾` : ''}
        </span>
      </div>
    </Link>
  );
}
