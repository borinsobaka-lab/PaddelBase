import { countUnread, listMyMatches, listOpenMatches, listOpenTournaments } from '@paddelbase/core';
import { prisma } from '@paddelbase/db';
import { toNumber } from '@paddelbase/db';
import { effectiveReliability, formatLevel, levelCategory } from '@paddelbase/rating';
import Link from 'next/link';

import { AppShell } from '@/components/AppShell';
import { CreateButton } from '@/components/CreateButton';
import { MatchCard } from '@/components/MatchCard';
import { TournamentCard } from '@/components/TournamentCard';
import { Card } from '@/components/ui';
import { requireOnboardedUser } from '@/lib/currentUser';
import { ratedMatchesLabel } from '@/lib/format';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { welcome } = await searchParams;
  const user = await requireOnboardedUser();
  const now = new Date();

  const [myMatches, openMatches, tournaments, unread] = await Promise.all([
    listMyMatches(prisma, { userId: user.id, now }),
    listOpenMatches(prisma, { viewerId: user.id, now, limit: 10 }),
    listOpenTournaments(prisma, { now, limit: 10 }),
    countUnread(prisma, { userId: user.id }),
  ]);

  const level = toNumber(user.level);
  const reliability = effectiveReliability(
    {
      reliabilityBase: toNumber(user.reliabilityBase),
      lastRatedMatchAt: user.lastRatedMatchAt,
      ratedMatchesCount: user.ratedMatchesCount,
    },
    now,
  );

  return (
    <AppShell>
      <main className="flex flex-col gap-6 pt-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/profile" className="flex flex-1 items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-full bg-surface-raised font-medium">
              {user.firstName[0]?.toUpperCase()}
            </span>
            <div>
              <p className="font-medium">{user.firstName}</p>
              <p className="text-sm text-muted">
                {user.ratedMatchesCount === 0
                  ? 'Уровень не подтверждён'
                  : ratedMatchesLabel(user.ratedMatchesCount)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="tabular text-2xl font-semibold leading-none">{formatLevel(level)}</p>
              <p className="text-xs text-muted">{levelCategory(level)}</p>
            </div>
            </div>
          </Link>

          {/* Колокольчик со счётчиком непрочитанных (ТЗ §5.1). */}
          <Link
            href="/notifications"
            aria-label={unread > 0 ? `Уведомления, непрочитанных: ${unread}` : 'Уведомления'}
            className="relative flex size-11 items-center justify-center rounded-full border border-border bg-surface"
          >
            <BellIcon />
            {unread > 0 ? (
              <span className="tabular absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-medium text-accent-ink">
                {unread > 99 ? '99+' : unread}
              </span>
            ) : null}
          </Link>
        </div>

        {welcome ? (
          <Card className="border-accent/40 bg-accent-soft">
            <p className="text-sm">
              Готово, ваш уровень — {formatLevel(level)}. Это стартовая оценка по анкете, она
              намеренно приблизительная: первые матчи будут двигать её заметно.
            </p>
          </Card>
        ) : null}

        {reliability < 0.6 ? (
          <Card className="border-warn/30 bg-warn-soft">
            <p className="text-sm">
              Идёт калибровка: надёжность {Math.round(reliability * 100)} %. Пока она ниже 60 %,
              уровень будет заметно двигаться после каждого матча.
            </p>
          </Card>
        ) : null}

        <Section title="Мои матчи" empty="Вы пока никуда не записаны" items={myMatches.length}>
          {myMatches.map((match) => (
            <MatchCard key={match.id} match={match} showStatus />
          ))}
        </Section>

        <Section
          title="Заявки на матчи"
          empty="Открытых заявок нет — создайте свою"
          items={openMatches.length}
        >
          {openMatches.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </Section>

        <Section title="Турниры" empty="Открытых турниров нет" items={tournaments.length}>
          {tournaments.map((tournament) => (
            <TournamentCard key={tournament.id} tournament={tournament} />
          ))}
        </Section>
      </main>

      <CreateButton />
    </AppShell>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
      <path d="M10.5 20a2 2 0 0 0 3 0" />
    </svg>
  );
}

function Section({
  title,
  empty,
  items,
  children,
}: {
  title: string;
  empty: string;
  items: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {/* Пустое состояние зовёт к действию, а не извиняется (ТЗ §9). */}
      {items === 0 ? <p className="text-sm text-muted">{empty}</p> : children}
    </section>
  );
}
