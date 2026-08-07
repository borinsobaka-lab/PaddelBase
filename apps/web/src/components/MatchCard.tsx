import type { MatchCard as MatchCardData } from '@paddelbase/core';
import { formatLevel } from '@paddelbase/rating';
import Link from 'next/link';

import { Badge, PlayerAvatars } from './Badges';
import {
  MATCH_STATUS_NAMES,
  formatDateTime,
  formatDuration,
  formatSlots,
} from '@/lib/format';

export function MatchCard({ match, showStatus = false }: { match: MatchCardData; showStatus?: boolean }) {
  return (
    <Link
      href={`/matches/${match.id}`}
      className="block rounded-card border border-border bg-surface p-4 transition-colors hover:border-border-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{formatDateTime(match.startsAt)}</p>
          <p className="mt-0.5 text-sm text-muted">
            {match.courtName} · {formatDuration(match.durationMin)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {match.isRated ? <Badge tone="accent">рейтинговый</Badge> : <Badge>любительский</Badge>}
          {match.courtBooked ? <Badge>корт забронирован</Badge> : null}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <PlayerAvatars players={match.players} />
        <p className="text-sm text-muted">
          {showStatus ? MATCH_STATUS_NAMES[match.status] : formatSlots(match.slotsMissing)}
        </p>
      </div>

      {match.averageLevel !== null || match.levelMin !== null ? (
        <p className="mt-2 text-xs text-muted">
          {match.averageLevel !== null ? <>Средний уровень {formatLevel(match.averageLevel)}</> : null}
          {match.levelMin !== null && match.levelMax !== null ? (
            <>
              {' · '}ищут {formatLevel(match.levelMin)}–{formatLevel(match.levelMax)}
            </>
          ) : null}
        </p>
      ) : null}
    </Link>
  );
}
