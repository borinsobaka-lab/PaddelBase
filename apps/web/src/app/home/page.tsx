import { countUnread, listMyMatches, listOpenMatches, listOpenTournaments } from '@paddelbase/core';
import { prisma, toNumber } from '@paddelbase/db';
import { effectiveReliability, formatLevel } from '@paddelbase/rating';
import Link from 'next/link';

import { AppShell } from '@/components/AppShell';
import { LevelStrip } from '@/components/LevelStrip';
import { MatchCard } from '@/components/MatchCard';
import { TournamentCard } from '@/components/TournamentCard';
import { Button, EmptyState, MoreLink, Panel, ScreenTail } from '@/components/ui';
import { requireOnboardedUser } from '@/lib/currentUser';

/**
 * Главная.
 *
 * Задача экрана по ТЗ §9 — «за один взгляд понять, куда я записан и куда ещё
 * могу записаться». Отсюда иерархия: сначала то, что ждёт действия прямо
 * сейчас, потом свои матчи, и только потом ленты для просмотра.
 *
 * Раньше здесь было три равновеликие секции с одинаковыми заголовками и ни
 * одного фокуса: матч, у которого не введён счёт третьи сутки, выглядел ровно
 * так же, как турнир, до которого две недели.
 */
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

  const needsMe = myMatches.filter((match) => match.needsAction !== null);
  const upcoming = myMatches.filter((match) => match.needsAction === null);

  return (
    <AppShell>
      {/* Разрыв между плашками — это и есть граница смысла. Белое начинается
          от самого верха экрана и продолжается до низа: серый здесь только
          разделяет блоки, но не лежит под ними. */}
      <main className="screen">
        <Greeting firstName={user.firstName} unread={unread} />

        {welcome ? (
          <Panel tone="accent">
            <p className="text-body">
              Готово, ваш уровень — <span className="figure font-semibold">{formatLevel(level)}</span>.
              Это стартовая оценка по анкете: первые матчи будут двигать её заметно.
            </p>
          </Panel>
        ) : null}

        <Panel>
          <LevelStrip
            level={level}
            reliability={reliability}
            ratedMatches={user.ratedMatchesCount}
          />
        </Panel>

        {/* Фокус экрана. Секции нет, пока нечему в ней быть — пустой блок
            «ничего не требуется» только разбавлял бы важное. */}
        {needsMe.length > 0 ? (
          /* Единственная секция с появлением. Она приходит не всегда, и её
             приход стоит заметить; одинаковый въезд на все секции — это уже
             не движение, а тик. */
          <Panel title="Требует вас" className="rise-in">
            <div className="flex flex-col gap-3">
              {needsMe.map((match) => (
                <MatchCard key={match.id} match={match} viewerId={user.id} variant="focus" />
              ))}
            </div>
          </Panel>
        ) : null}

        {/* Секция пропускается, если все матчи уже показаны выше: иначе экран
            сам себе противоречит — «вы никуда не записаны» под карточкой
            собственного матча. */}
        {upcoming.length > 0 || needsMe.length === 0 ? (
          <Panel title="Мои матчи">
            {upcoming.length === 0 ? (
              <EmptyState
                title="Вы никуда не записаны"
                hint="Создайте заявку или откликнитесь на чужую — свободные места видны ниже."
                action={
                  <Link href="/matches/new">
                    <Button className="!w-auto px-5">Создать матч</Button>
                  </Link>
                }
              />
            ) : (
              <div className="flex flex-col gap-3">
                {upcoming.map((match) => (
                  <MatchCard key={match.id} match={match} viewerId={user.id} />
                ))}
              </div>
            )}
          </Panel>
        ) : null}

        <Rail
          title="Свободные места"
          href="/games"
          empty="Сейчас никто не ищет партнёров"
          emptyHint="Создайте заявку — её увидят все игроки."
          count={openMatches.length}
        >
          {openMatches.map((match) => (
            <div key={match.id} className="w-[290px]">
              <MatchCard match={match} viewerId={user.id} />
            </div>
          ))}
        </Rail>

        <Rail
          title="Турниры"
          href="/games"
          empty="Открытых турниров нет"
          emptyHint="Американо на восьмерых занимает вечер — попробуйте собрать."
          count={tournaments.length}
        >
          {tournaments.map((tournament) => (
            <div key={tournament.id} className="w-[290px]">
              <TournamentCard tournament={tournament} />
            </div>
          ))}
        </Rail>

        <ScreenTail />
      </main>
    </AppShell>
  );
}

/**
 * Шапка. Имя и уведомления — два разных действия, поэтому это две отдельные
 * цели нажатия: раньше вся строка целиком вела в профиль, и колокольчику
 * приходилось выламываться из неё.
 */
function Greeting({ firstName, unread }: { firstName: string; unread: number }) {
  return (
    <header className="bleed flex items-center justify-between gap-3 rounded-card bg-surface p-3 pt-[calc(12px+env(safe-area-inset-top))]">
      <Link href="/profile" className="pressable flex min-h-11 items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-full bg-sunken text-title font-bold text-text-secondary">
          {firstName[0]?.toUpperCase()}
        </span>
        <span>
          <span className="block text-h2 font-extrabold leading-tight">{firstName}</span>
          <span className="block text-small text-muted">Профиль и история</span>
        </span>
      </Link>

      <Link
        href="/notifications"
        aria-label={unread > 0 ? `Уведомления, непрочитанных: ${unread}` : 'Уведомления'}
        className="pressable relative flex size-11 items-center justify-center rounded-full bg-sunken"
      >
        <BellIcon />
        {unread > 0 ? (
          <span className="figure absolute -right-0.5 -top-0.5 flex min-w-[20px] items-center justify-center rounded-full bg-ball px-1 py-0.5 text-caption font-semibold text-ball-ink ring-2 ring-canvas">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </Link>
    </header>
  );
}

/**
 * Горизонтальная лента (ТЗ §5.1). Ленты для просмотра идут вбок, свои матчи —
 * вниз: чужие заявки листают, свои читают целиком.
 */
function Rail({
  title,
  href,
  empty,
  emptyHint,
  count,
  children,
}: {
  title: string;
  href: string;
  empty: string;
  emptyHint: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Panel
      title={title}
      action={
        count > 0 ? (
          <Link href={href} className="pressable shrink-0">
            <MoreLink>Все</MoreLink>
          </Link>
        ) : null
      }
    >
      {count === 0 ? (
        <EmptyState title={empty} hint={emptyHint} variant="quiet" />
      ) : (
        <div className="rail">{children}</div>
      )}
    </Panel>
  );
}

function BellIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
      <path d="M10.5 20a2 2 0 0 0 3 0" />
    </svg>
  );
}
