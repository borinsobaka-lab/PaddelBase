import {
  getTournamentDetails,
  getStandings,
  listParticipants,
  listRounds,
  listTournamentRatingChanges,
} from '@paddelbase/core';
import { prisma, toNumber } from '@paddelbase/db';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/Badges';
import { requireOnboardedUser } from '@/lib/currentUser';
import { TOURNAMENT_FORMAT_NAMES, formatDateTime } from '@/lib/format';

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
      <div className="flex items-center gap-3 pt-6">
        <Link href="/games" className="text-sm text-muted">
          ← Назад
        </Link>
      </div>

      <header>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-semibold">{TOURNAMENT_FORMAT_NAMES[tournament.format]}</h1>
          {tournament.isRated ? <Badge tone="accent">рейтинговый</Badge> : <Badge>любительский</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted">
          {formatDateTime(tournament.startsAt)} · {tournament.courtName}
        </p>
        <p className="mt-1 text-sm">{STATUS_NAMES[tournament.status] ?? tournament.status}</p>
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
