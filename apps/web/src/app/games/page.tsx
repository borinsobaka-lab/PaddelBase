import { listOpenMatches, listOpenTournaments } from '@paddelbase/core';
import { prisma } from '@paddelbase/db';

import { AppShell } from '@/components/AppShell';
import { MatchCard } from '@/components/MatchCard';
import { TournamentCard } from '@/components/TournamentCard';
import { CreateButton } from '@/components/CreateButton';
import { PageTitle } from '@/components/ui';
import { requireOnboardedUser } from '@/lib/currentUser';

export default async function GamesPage() {
  const user = await requireOnboardedUser();
  const now = new Date();

  const [matches, tournaments] = await Promise.all([
    listOpenMatches(prisma, { viewerId: user.id, now, limit: 50 }),
    listOpenTournaments(prisma, { now, limit: 50 }),
  ]);

  return (
    <AppShell>
      <main>
        <PageTitle subtitle="Все открытые заявки и турниры">Игры</PageTitle>

        <div className="flex flex-col gap-3">
          {matches.length === 0 && tournaments.length === 0 ? (
            <p className="text-sm text-muted">
              Пока никто не ищет партнёров. Создайте заявку — её увидят все.
            </p>
          ) : null}

          {matches.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}

          {tournaments.map((tournament) => (
            <TournamentCard key={tournament.id} tournament={tournament} />
          ))}
        </div>
      </main>

      <CreateButton />
    </AppShell>
  );
}
