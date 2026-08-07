import {
  getMatch,
  listMatchRatingChanges,
  listPendingApplications,
  type MatchCard,
} from '@paddelbase/core';
import { prisma } from '@paddelbase/db';
import { formatLevel } from '@paddelbase/rating';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge, LevelChip } from '@/components/Badges';
import { Card } from '@/components/ui';
import { requireOnboardedUser } from '@/lib/currentUser';
import {
  MATCH_STATUS_NAMES,
  formatDateTime,
  formatDuration,
  formatSlots,
} from '@/lib/format';

import { ApplicationsPanel, ConfirmPanel, JoinPanel, LeavePanel, ScorePanel } from './panels';

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireOnboardedUser();

  const match = await getMatch(prisma, { matchId: id, viewerId: user.id });
  if (!match) notFound();

  const isCreator = match.creatorId === user.id;
  const isPlayer = match.players.some((player) => player.id === user.id);

  const [applications, result, ratingChanges] = await Promise.all([
    isCreator ? listPendingApplications(prisma, { matchId: id }) : Promise.resolve([]),
    prisma.matchResult.findUnique({ where: { matchId: id } }),
    listMatchRatingChanges(prisma, { matchId: id }),
  ]);

  const enteredByMe = result?.enteredById === user.id;
  const awaitingMyConfirmation =
    result !== null && result.confirmedAt === null && result.disputedAt === null && isPlayer && !enteredByMe;

  return (
    <main className="flex flex-col gap-4 pb-10">
      <div className="flex items-center gap-3 pt-6">
        <Link href="/home" className="text-sm text-muted">
          ← Назад
        </Link>
      </div>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold leading-snug">{formatDateTime(match.startsAt)}</h1>
            <p className="mt-1 text-sm text-muted">
              {match.courtName} · {match.courtCity} · {formatDuration(match.durationMin)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {match.isRated ? <Badge tone="accent">рейтинговый</Badge> : <Badge>любительский</Badge>}
            {match.courtBooked ? <Badge>корт забронирован</Badge> : null}
          </div>
        </div>

        <p className="mt-3 text-sm">
          {MATCH_STATUS_NAMES[match.status] ?? match.status}
          {match.status === 'OPEN' ? ` · ${formatSlots(match.slotsMissing)}` : ''}
        </p>

        {match.comment ? (
          <p className="mt-3 rounded-control bg-surface-raised p-3 text-sm">{match.comment}</p>
        ) : null}
      </Card>

      <Card>
        <h2 className="font-medium">Состав</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {match.players.map((player) => (
            <li key={player.id} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {player.name}
                {player.id === match.creatorId ? (
                  <span className="ml-2 text-xs text-muted">организатор</span>
                ) : null}
              </span>
              <LevelChip level={player.level} />
            </li>
          ))}

          {Array.from({ length: match.slotsMissing }, (_, index) => (
            <li
              key={`empty-${index}`}
              className="rounded-control border border-dashed border-border-strong px-3 py-2 text-sm text-muted"
            >
              Свободное место
            </li>
          ))}
        </ul>

        {match.levelMin !== null && match.levelMax !== null ? (
          <p className="mt-3 text-xs text-muted">
            Ищут игроков уровня {formatLevel(match.levelMin)}–{formatLevel(match.levelMax)}
          </p>
        ) : null}
      </Card>

      {isCreator && applications.length > 0 ? (
        <ApplicationsPanel matchId={match.id} applications={applications} match={match} />
      ) : null}

      {!isPlayer && match.status === 'OPEN' ? (
        <JoinPanel matchId={match.id} alreadyApplied={match.hasPendingApplication} match={match} />
      ) : null}

      {isPlayer && result === null && (match.status === 'PLAYED' || match.status === 'FILLED') ? (
        <ScorePanel matchId={match.id} players={match.players} />
      ) : null}

      {result !== null ? (
        <Card>
          <h2 className="font-medium">Результат</h2>
          <p className="tabular mt-2 text-lg">
            {(result.sets as unknown as { a: number; b: number }[])
              .map((set) => `${set.a}:${set.b}`)
              .join(', ')}
          </p>
          <p className="mt-1 text-sm text-muted">
            Победила {result.winnerTeam === 1 ? 'первая' : 'вторая'} пара
          </p>

          {result.disputedAt ? (
            <p className="mt-3 rounded-control bg-warn-soft p-3 text-sm text-warn">
              Результат оспорен. Рейтинг не изменится до ручного разбора.
            </p>
          ) : result.confirmedAt === null ? (
            <p className="mt-3 text-sm text-muted">
              Ждём подтверждения от соперников. Если за 48 часов никто не ответит, результат
              засчитается автоматически.
            </p>
          ) : null}

          {ratingChanges.length > 0 ? (
            <div className="mt-4">
              <h3 className="text-sm font-medium">Изменение уровня</h3>
              <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                {ratingChanges.map((change) => (
                  <li key={change.userId} className="flex items-center justify-between gap-3">
                    <span>{change.name}</span>
                    <span className="tabular flex items-center gap-2">
                      <span className="text-muted">{formatLevel(change.levelBefore)}</span>
                      <span aria-hidden className="text-muted">
                        →
                      </span>
                      <span className="font-medium">{formatLevel(change.levelAfter)}</span>
                      <span className={change.delta >= 0 ? 'text-accent' : 'text-danger'}>
                        {change.delta >= 0 ? '+' : ''}
                        {change.delta.toFixed(3)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      {awaitingMyConfirmation ? <ConfirmPanel matchId={match.id} /> : null}

      {isPlayer ? (
        <LeavePanel matchId={match.id} isCreator={isCreator} status={match.status} />
      ) : null}
    </main>
  );
}

export type { MatchCard };
