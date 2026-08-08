import {
  getMatch,
  listMatchRatingChanges,
  listPendingApplications,
  type MatchCard,
} from '@paddelbase/core';
import { prisma } from '@paddelbase/db';
import { formatLevel } from '@paddelbase/rating';
import { notFound } from 'next/navigation';

import { LevelChip } from '@/components/Badges';
import { CourtLineup } from '@/components/CourtLineup';
import { BackLink, Card, SectionHeader } from '@/components/ui';
import { requireOnboardedUser } from '@/lib/currentUser';
import {
  MATCH_STATUS_NAMES,
  formatDay,
  formatDuration,
  formatSlots,
  formatTime,
} from '@/lib/format';

import { ApplicationsPanel, ConfirmPanel, JoinPanel, LeavePanel, ScorePanel } from './panels';

/**
 * Карточка матча целиком.
 *
 * Экран отвечает на три вопроса по порядку: когда и где играем, кто играет,
 * что от меня требуется. Раньше все блоки были одинаковыми карточками с
 * подзаголовком, и «Ввести счёт» терялся между составом и кнопкой выхода.
 */
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
    result !== null &&
    result.confirmedAt === null &&
    result.disputedAt === null &&
    isPlayer &&
    !enteredByMe;

  return (
    <main className="flex flex-col gap-5 pb-10">
      <BackLink href="/home" />

      {/* Шапка стоит на холсте, а не в карточке: это заголовок экрана, а не
          один из его блоков. Карточка вокруг заголовка уравнивала его с
          остальными и отнимала у экрана точку входа. */}
      <header>
        {/* Тот же порядок, что и в карточке ленты: время ведёт, день идёт
            следом. Игрок узнаёт матч по времени, и переучивать его на
            детальном экране незачем. */}
        <h1 className="text-h1 font-extrabold">
          <span className="figure">{formatTime(match.startsAt)}</span>
          <span className="ml-2 text-h2 font-normal text-text-secondary">
            {formatDay(match.startsAt)}
          </span>
        </h1>
        <p className="mt-1 text-body text-text-secondary">
          {match.courtName} · {match.courtCity}
        </p>
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted">
          <span>{formatDuration(match.durationMin)}</span>
          <Dot />
          <span>{MATCH_STATUS_NAMES[match.status] ?? match.status}</span>
          {match.status === 'OPEN' ? (
            <>
              <Dot />
              <span>{formatSlots(match.slotsMissing)}</span>
            </>
          ) : null}
          {match.isRated ? null : (
            <>
              <Dot />
              <span>без рейтинга</span>
            </>
          )}
          {match.courtBooked ? (
            <>
              <Dot />
              <span>корт забронирован</span>
            </>
          ) : null}
        </p>
      </header>

      {match.comment ? (
        <Card>
          <p className="whitespace-pre-wrap text-body">{match.comment}</p>
        </Card>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionHeader>Состав</SectionHeader>

        <Card className="flex flex-col gap-4">
          <CourtLineup
            players={match.players}
            slotsMissing={match.slotsMissing}
            size="md"
            highlightId={user.id}
          />

          <ul className="flex flex-col">
            {match.players.map((player) => (
              <li
                key={player.id}
                className="flex items-center justify-between gap-3 border-b border-border py-2 text-body last:border-0 last:pb-0 first:pt-0"
              >
                <span className="min-w-0 truncate">
                  {player.name}
                  {player.id === match.creatorId ? (
                    <span className="ml-2 text-small text-muted">организатор</span>
                  ) : null}
                </span>
                <LevelChip level={player.level} />
              </li>
            ))}
          </ul>

          {match.levelMin !== null && match.levelMax !== null ? (
            <p className="text-small text-muted">
              Ищут игроков уровня{' '}
              <span className="figure">
                {formatLevel(match.levelMin)}–{formatLevel(match.levelMax)}
              </span>
            </p>
          ) : null}
        </Card>
      </section>

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
        <section className="flex flex-col gap-3">
          <SectionHeader>Результат</SectionHeader>

          <Card>
            {/* Счёт — главное число экрана после времени, поэтому он крупный
                и табличный: две карточки матчей рядом должны выравниваться. */}
            <p className="figure text-display font-semibold leading-none">
              {(result.sets as unknown as { a: number; b: number }[])
                .map((set) => `${set.a}:${set.b}`)
                .join('  ')}
            </p>
            <p className="mt-2 text-small text-text-secondary">
              Победила {result.winnerTeam === 1 ? 'первая' : 'вторая'} пара
            </p>

            {result.disputedAt ? (
              <p className="mt-4 rounded-control bg-warn-soft px-3 py-2 text-small text-warn">
                Результат оспорен. Рейтинг не изменится до ручного разбора.
              </p>
            ) : result.confirmedAt === null ? (
              <p className="mt-4 text-small text-muted">
                Ждём подтверждения от соперников. Если за 48 часов никто не ответит, результат
                засчитается автоматически.
              </p>
            ) : null}

            {ratingChanges.length > 0 ? (
              <div className="mt-5">
                <p className="label">Изменение уровня</p>
                <ul className="mt-2 flex flex-col">
                  {ratingChanges.map((change) => (
                    <li
                      key={change.userId}
                      className="flex items-center justify-between gap-3 border-b border-border py-2 text-body last:border-0 last:pb-0"
                    >
                      <span className="min-w-0 truncate">{change.name}</span>
                      <span className="figure flex shrink-0 items-center gap-2">
                        <span className="text-muted">{formatLevel(change.levelBefore)}</span>
                        <span aria-hidden className="text-faint">
                          →
                        </span>
                        <span className="font-semibold">{formatLevel(change.levelAfter)}</span>
                        <span
                          className={`w-14 text-right font-medium ${
                            change.delta >= 0 ? 'text-accent' : 'text-danger'
                          }`}
                        >
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
        </section>
      ) : null}

      {awaitingMyConfirmation ? <ConfirmPanel matchId={match.id} /> : null}

      {isPlayer ? (
        <LeavePanel matchId={match.id} isCreator={isCreator} status={match.status} />
      ) : null}
    </main>
  );
}

function Dot() {
  return (
    <span aria-hidden className="text-faint">
      ·
    </span>
  );
}

export type { MatchCard };
