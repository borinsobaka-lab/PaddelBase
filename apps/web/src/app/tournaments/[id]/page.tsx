import {
  getTournamentDetails,
  getStandings,
  listParticipants,
  listRounds,
  listTournamentRatingChanges,
} from '@paddelbase/core';
import { prisma, toNumber } from '@paddelbase/db';
import { notFound } from 'next/navigation';

import { BackLink } from '@/components/ui';
import { requireOnboardedUser } from '@/lib/currentUser';
import { TOURNAMENT_FORMAT_NAMES, formatDay, formatTime } from '@/lib/format';

import { TournamentTabs } from './TournamentTabs';

const STATUS_NAMES: Record<string, string> = {
  DRAFT: 'Черновик',
  REGISTRATION: 'Идёт регистрация',
  READY: 'Готов к старту',
  IN_PROGRESS: 'Идёт',
  COMPLETED: 'Завершён',
  CANCELLED: 'Отменён',
};

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireOnboardedUser();

  const tournament = await getTournamentDetails(prisma, { tournamentId: id });
  if (!tournament) notFound();

  const [participants, rounds, standings, ratingChanges, candidates] = await Promise.all([
    listParticipants(prisma, { tournamentId: id }),
    listRounds(prisma, { tournamentId: id }),
    getStandings(prisma, { tournamentId: id }),
    listTournamentRatingChanges(prisma, { tournamentId: id }),
    prisma.user.findMany({
      where: { id: { not: user.id }, onboardingCompletedAt: { not: null } },
      orderBy: { firstName: 'asc' },
      take: 100,
    }),
  ]);

  return (
    <main className="flex flex-col gap-4 pb-10">
      <BackLink href="/games" />

      {/* Формат — имя турнира, время — то, по чему его узнают. Статус идёт
          третьей строкой и обычным весом: он меняется сам, и выделять его
          наравне с названием незачем. */}
      <header className="pt-3">
        <h1 className="text-[26px] font-semibold leading-tight">
          {TOURNAMENT_FORMAT_NAMES[tournament.format]}
        </h1>
        <p className="mt-1.5 text-[15px] text-text-secondary">
          <span className="tabular">{formatTime(tournament.startsAt)}</span>
          {' · '}
          {formatDay(tournament.startsAt)} · {tournament.courtName}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
          <span>{STATUS_NAMES[tournament.status] ?? tournament.status}</span>
          {tournament.isRated ? null : (
            <>
              <span aria-hidden className="text-faint">
                ·
              </span>
              <span>без рейтинга</span>
            </>
          )}
        </p>
      </header>

      <TournamentTabs
        tournament={tournament}
        participants={participants}
        rounds={rounds}
        standings={standings}
        ratingChanges={ratingChanges}
        viewerId={user.id}
        candidates={candidates.map((candidate) => ({
          id: candidate.id,
          name: [candidate.firstName, candidate.lastName].filter(Boolean).join(' '),
          level: toNumber(candidate.level),
        }))}
      />
    </main>
  );
}
