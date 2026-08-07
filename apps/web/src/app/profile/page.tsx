import { fullName } from '@paddelbase/core';
import { toNumber } from '@paddelbase/db';
import { effectiveReliability, formatLevel, type StartLevelResult } from '@paddelbase/rating';

import { RatingBlock } from '@/components/RatingBlock';
import { Button, Card } from '@/components/ui';
import { requireOnboardedUser } from '@/lib/currentUser';

import { signOut } from './actions';

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const user = await requireOnboardedUser();
  const { welcome } = await searchParams;

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

  return (
    <main className="flex flex-col gap-4 pb-8">
      <header className="flex items-center justify-between pt-8">
        <div>
          <h1 className="text-2xl font-semibold">{fullName(user)}</h1>
          {user.city ? <p className="text-sm text-muted">{user.city}</p> : null}
        </div>
      </header>

      {welcome ? (
        <Card className="border-accent/40 bg-accent/5">
          <p className="text-sm">
            Готово. Это стартовая оценка по анкете — она намеренно приблизительная. Первые матчи
            будут двигать уровень заметно, потом он стабилизируется.
          </p>
        </Card>
      ) : null}

      <RatingBlock level={level} reliability={reliability} ratedMatches={user.ratedMatchesCount} />

      {breakdown ? <StartLevelExplanation breakdown={breakdown} /> : null}

      <Card>
        <h2 className="font-medium">Статистика</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <Stat label="Рейтинговых матчей" value={String(user.ratedMatchesCount)} />
          <Stat label="Надёжность" value={`${Math.round(reliability * 100)} %`} />
          <Stat label="Стартовый уровень" value={formatLevel(toNumber(user.startLevel))} />
          <Stat label="В приложении с" value={user.createdAt.toLocaleDateString('ru-RU')} />
        </dl>
      </Card>

      <form action={signOut}>
        <Button variant="ghost" type="submit">
          Выйти
        </Button>
      </form>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="tabular mt-0.5 text-base font-medium">{value}</dd>
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
    <Card>
      <details>
        <summary className="cursor-pointer font-medium">Как посчитан стартовый уровень</summary>

        <dl className="mt-3 flex flex-col gap-2 text-sm">
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
            Самооценка заметно выше остальных ответов, поэтому она не учитывалась. Если это ошибка,
            уровень всё равно выправится за первые матчи.
          </p>
        ) : null}

        <p className="mt-3 text-xs text-muted">
          Техника весит больше биографии: поведенческие вопросы предсказывают уровень точнее, чем
          стаж и самооценка.
        </p>
      </details>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular shrink-0 font-medium">{children}</dd>
    </div>
  );
}
