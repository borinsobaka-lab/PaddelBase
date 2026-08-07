import { listOpenMatches, listOpenTournaments, type MatchCard as MatchCardData } from '@paddelbase/core';
import { prisma } from '@paddelbase/db';

import { AppShell } from '@/components/AppShell';
import { CreateButton } from '@/components/CreateButton';
import { MatchCard } from '@/components/MatchCard';
import { TournamentCard } from '@/components/TournamentCard';
import { EmptyState, PageTitle, SectionHeader } from '@/components/ui';
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
    <AppShell fab={<CreateButton />}>
      <main>
        <PageTitle subtitle="Свободные места в матчах и открытые турниры">Игры</PageTitle>

        {matches.length === 0 && tournaments.length === 0 ? (
          <EmptyState
            title="Пока никто не ищет партнёров"
            hint="Создайте заявку — её увидят все игроки, и отклики придут уведомлением."
          />
        ) : null}

        <div className="flex flex-col gap-7">
          {days.map(([day, dayMatches]) => (
            <section key={day} className="flex flex-col gap-3">
              {/* Заголовок дня прилипает: при прокрутке длинного списка иначе
                  теряется, на какой день смотришь. */}
              <div className="sticky top-0 z-sticky -mx-4 bg-canvas/92 px-4 py-2 backdrop-blur">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-body font-semibold">{day}</h2>
                  <span className="figure text-small text-muted">{dayMatches.length}</span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {dayMatches.map((match) => (
                  <MatchCard key={match.id} match={match} viewerId={user.id} showDay={false} />
                ))}
              </div>
            </section>
          ))}

          {tournaments.length > 0 ? (
            <section className="flex flex-col gap-3">
              <SectionHeader>Турниры</SectionHeader>
              {tournaments.map((tournament) => (
                <TournamentCard key={tournament.id} tournament={tournament} />
              ))}
            </section>
          ) : null}
        </div>
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
