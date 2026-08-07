import { fullName, listMatchHistory } from '@paddelbase/core';
import { prisma, toNumber } from '@paddelbase/db';
import { effectiveReliability, formatLevel, type StartLevelResult } from '@paddelbase/rating';
import Link from 'next/link';

import { AppShell } from '@/components/AppShell';
import { RatingBlock } from '@/components/RatingBlock';
import { Button, Card, EmptyState, SectionHeader } from '@/components/ui';
import { requireOnboardedUser } from '@/lib/currentUser';
import { formatDay } from '@/lib/format';

import { signOut } from './actions';

export default async function ProfilePage() {
  const user = await requireOnboardedUser();
  const history = await listMatchHistory(prisma, { userId: user.id, limit: 30 });

  const level = toNumber(user.level);
  const reliability = effectiveReliability(
    {
      reliabilityBase: toNumber(user.reliabilityBase),
      lastRatedMatchAt: user.lastRatedMatchAt,
      ratedMatchesCount: user.ratedMatchesCount,
    },
    new Date(),
  );

  const breakdown = user.startLevelBreakdown as unknown as StartLevelResult | null;
  const wins = history.filter((entry) => entry.won).length;
  const name = fullName(user);

  return (
    <AppShell>
      <main className="flex flex-col gap-6 pt-5">
        <header className="flex items-center gap-3.5">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-sunken text-xl font-semibold text-text-secondary">
            {name[0]?.toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-semibold leading-tight">{name}</h1>
            <p className="text-sm text-muted">{user.city ?? 'Грузия'}</p>
          </div>
        </header>

        <RatingBlock level={level} reliability={reliability} ratedMatches={user.ratedMatchesCount} />

        {breakdown ? <StartLevelExplanation breakdown={breakdown} /> : null}

        {/* Цифры ведут, подписи обслуживают. Раньше подпись и значение были
            одного размера, и таблица читалась как список слов. */}
        <section className="flex flex-col gap-3">
          <SectionHeader>Статистика</SectionHeader>
          <Card>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
              <Stat label="Рейтинговых матчей" value={String(user.ratedMatchesCount)} />
              <Stat label="Побед" value={`${wins} из ${history.length}`} />
              <Stat label="Надёжность" value={`${Math.round(reliability * 100)} %`} />
              <Stat label="Стартовый уровень" value={formatLevel(toNumber(user.startLevel))} />
              <Stat label="В приложении с" value={user.createdAt.toLocaleDateString('ru-RU')} />
            </dl>
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeader>История матчей</SectionHeader>

          {history.length === 0 ? (
            <EmptyState
              title="Сыгранных матчей пока нет"
              hint="После первого здесь появится счёт и изменение уровня."
            />
          ) : (
            <Card className="!p-0">
              <ul className="flex flex-col">
                {history.map((entry) => (
                  <li key={entry.matchId} className="border-b border-border last:border-0">
                    <Link
                      href={`/matches/${entry.matchId}`}
                      className="pressable flex items-center justify-between gap-3 p-3.5"
                    >
                      <span className="min-w-0">
                        <span className="flex items-baseline gap-2">
                          <span
                            className={`text-[15px] font-semibold ${
                              entry.won ? 'text-accent' : 'text-text-secondary'
                            }`}
                          >
                            {entry.won ? 'Победа' : 'Поражение'}
                          </span>
                          <span className="tabular text-sm">{entry.score}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {formatDay(entry.playedAt)} · {entry.courtName}
                          {entry.partnerName ? ` · с ${entry.partnerName}` : ''}
                        </span>
                      </span>

                      {entry.delta !== null ? (
                        <span
                          className={`tabular shrink-0 text-sm font-semibold ${
                            entry.delta >= 0 ? 'text-accent' : 'text-danger'
                          }`}
                        >
                          {entry.delta >= 0 ? '+' : ''}
                          {entry.delta.toFixed(3)}
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs text-muted">без рейтинга</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        <form action={signOut} className="pt-1">
          <Button variant="quiet" type="submit">
            Выйти
          </Button>
        </form>
      </main>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="tabular mt-1 text-xl font-semibold leading-none">{value}</dd>
    </div>
  );
}

/**
 * Разбор анкетного уровня.
 *
 * Показывать его стоит: уровень определяет, с кем игрок будет играть, и «просто
 * поверьте числу» — плохой ответ. Заодно это единственный способ заметить, что
 * анкета заполнена неаккуратно.
 */
function StartLevelExplanation({ breakdown }: { breakdown: StartLevelResult }) {
  return (
    <Card className="!p-0">
      {/* Нативный треугольник маркера мелкий и не даёт цели нажатия; здесь
          вся строка высотой 44 px, а стрелка поворачивается при раскрытии. */}
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 p-4 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
          Как посчитан стартовый уровень
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="shrink-0 text-faint transition-transform group-open:rotate-180"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>

        <div className="border-t border-border p-4">
          <dl className="flex flex-col gap-2.5 text-sm">
            <Row label="Техника: стекло, удары над головой, подача, тактика">
              {breakdown.technicalScore.toFixed(2)}
            </Row>
            <Row label="Опыт: стаж, частота, занятия с тренером">
              {breakdown.experienceScore.toFixed(2)}
            </Row>
            <Row label="Комбинированная база">{breakdown.baseScore.toFixed(2)}</Row>
            {breakdown.appliedBias !== 0 ? (
              <Row label="Поправка на завышение самооценки">
                {breakdown.appliedBias.toFixed(2)}
              </Row>
            ) : null}
          </dl>

          {breakdown.branch === 'racketSportCrossover' ? (
            <p className="mt-3 text-xs text-muted">
              У вас сильный ракеточный бэкграунд, но мало падел-стажа. Удары, ноги и чтение мяча
              переносятся, а стекло и позиционирование — нет, поэтому старт держится в коридоре
              2.5–3.5 и быстро уточнится по матчам.
            </p>
          ) : null}

          {breakdown.selfAssessmentInflated ? (
            <p className="mt-3 text-xs text-warn">
              Самооценка заметно выше остальных ответов, поэтому она не учитывалась. Если это
              ошибка, уровень всё равно выправится за первые матчи.
            </p>
          ) : null}

          <p className="mt-3 text-xs text-muted">
            Техника весит больше биографии: поведенческие вопросы предсказывают уровень точнее, чем
            стаж и самооценка.
          </p>
        </div>
      </details>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="tabular shrink-0 font-semibold">{children}</dd>
    </div>
  );
}
