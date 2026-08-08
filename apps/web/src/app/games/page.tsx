import { listOpenMatches, listOpenTournaments, type MatchCard as MatchCardData } from '@paddelbase/core';
import { prisma } from '@paddelbase/db';

import { AppShell } from '@/components/AppShell';
import { MatchCard } from '@/components/MatchCard';
import { TournamentCard } from '@/components/TournamentCard';
import { EmptyState, Panel, ScreenTail, TopBar } from '@/components/ui';
import { requireOnboardedUser } from '@/lib/currentUser';
import { formatDay } from '@/lib/format';

/**
 * Все открытые игры.
 *
 * Раньше заявки и турниры лежали одним списком без единого разделителя: пятая
 * карточка подряд ничем не отличалась от первой, и найти «что есть в субботу»
 * можно было только вчитываясь в каждую. Здесь матчи сгруппированы по дням, а
 * турниры вынесены отдельно — это разные решения и разный горизонт.
 */
export default async function GamesPage() {
  const user = await requireOnboardedUser();
  const now = new Date();

  const [matches, tournaments] = await Promise.all([
    listOpenMatches(prisma, { viewerId: user.id, now, limit: 50 }),
    listOpenTournaments(prisma, { now, limit: 50 }),
  ]);

  const days = groupByDay(matches);

  return (
    <AppShell>
      <main className="screen">
        <TopBar subtitle="Свободные места в матчах и открытые турниры">Игры</TopBar>

        {matches.length === 0 && tournaments.length === 0 ? (
          <EmptyState
            title="Пока никто не ищет партнёров"
            hint="Создайте заявку — её увидят все игроки, и отклики придут уведомлением."
          />
        ) : null}

        {days.map(([day, dayMatches]) => (
            <Panel
              key={day}
              title={day}
              action={<span className="figure text-small text-muted">{dayMatches.length}</span>}
            >
              <div className="flex flex-col gap-3">
                {dayMatches.map((match) => (
                  <MatchCard key={match.id} match={match} viewerId={user.id} showDay={false} />
                ))}
              </div>
          </Panel>
        ))}

        {tournaments.length > 0 ? (
          <Panel title="Турниры">
            <div className="flex flex-col gap-3">
              {tournaments.map((tournament) => (
                <TournamentCard key={tournament.id} tournament={tournament} />
              ))}
            </div>
          </Panel>
        ) : null}

        <ScreenTail />
      </main>
    </AppShell>
  );
}

function groupByDay(matches: MatchCardData[]): [string, MatchCardData[]][] {
  const groups = new Map<string, MatchCardData[]>();

  for (const match of matches) {
    const day = formatDay(match.startsAt);
    const bucket = groups.get(day);
    if (bucket) bucket.push(match);
    else groups.set(day, [match]);
  }

  return [...groups];
}
