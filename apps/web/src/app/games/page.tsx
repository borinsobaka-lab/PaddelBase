import { listOpenMatches, listOpenTournaments } from '@paddelbase/core';
import { prisma } from '@paddelbase/db';

import { AppShell } from '@/components/AppShell';
import { Badge } from '@/components/Badges';
import { MatchCard } from '@/components/MatchCard';
import { PageTitle } from '@/components/ui';
import { requireOnboardedUser } from '@/lib/currentUser';
import { TOURNAMENT_FORMAT_NAMES, formatDateTime } from '@/lib/format';

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
            <div key={tournament.id} className="rounded-card border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{TOURNAMENT_FORMAT_NAMES[tournament.format]}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {formatDateTime(tournament.startsAt)} · {tournament.courtName}
                  </p>
                </div>
                {tournament.isRated ? <Badge tone="accent">рейтинговый</Badge> : null}
              </div>
              <p className="mt-3 text-sm text-muted">
                Занято {tournament.participants} из {tournament.maxParticipants}
              </p>
            </div>
          ))}
        </div>
      </main>
    </AppShell>
  );
}
