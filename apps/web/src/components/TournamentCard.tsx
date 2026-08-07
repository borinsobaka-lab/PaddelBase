import type { TournamentCard as TournamentCardData } from '@paddelbase/core';
import Link from 'next/link';

import { Badge } from './Badges';
import { TOURNAMENT_FORMAT_NAMES, formatDateTime } from '@/lib/format';

export function TournamentCard({ tournament }: { tournament: TournamentCardData }) {
  const free = tournament.maxParticipants - tournament.participants;

  return (
    <Link
      href={`/tournaments/${tournament.id}`}
      className="block rounded-card border border-border bg-surface p-4 transition-colors hover:border-border-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{TOURNAMENT_FORMAT_NAMES[tournament.format]}</p>
          <p className="mt-0.5 text-sm text-muted">
            {formatDateTime(tournament.startsAt)} · {tournament.courtName}
          </p>
        </div>
        {tournament.isRated ? <Badge tone="accent">рейтинговый</Badge> : <Badge>любительский</Badge>}
      </div>

      <p className="mt-3 text-sm text-muted">
        Занято {tournament.participants} из {tournament.maxParticipants}
        {free > 0 ? ` · свободно ${free}` : ' · мест нет'}
        {tournament.feeAmount ? ` · взнос ${tournament.feeAmount} ₾` : ''}
      </p>
    </Link>
  );
}
