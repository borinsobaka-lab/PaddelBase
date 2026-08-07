import { matchesUntilCalibrated } from '@paddelbase/rating';

import { LevelDial } from './LevelDial';
import { plural, ratedMatchesLabel } from '@/lib/format';

/**
 * Крупный блок уровня для профиля. Дуга — та же, что в компактной сводке на
 * главной: две реализации одного элемента рано или поздно разъезжаются.
 */
export function RatingBlock({
  level,
  reliability,
  ratedMatches,
}: {
  level: number;
  reliability: number;
  ratedMatches: number;
}) {
  const remaining = matchesUntilCalibrated(reliability);
  const calibrated = remaining === 0;
  const unrated = ratedMatches === 0;

  return (
    <section className="flex flex-col items-center gap-5 rounded-card bg-surface p-6 shadow-raise">
      <LevelDial level={level} reliability={reliability} size="lg" />

      <div className="text-center">
        <p className="text-[15px] font-medium">
          {unrated ? 'Уровень не подтверждён' : calibrated ? 'Уровень подтверждён' : 'Идёт калибровка'}
        </p>
        <p className="mx-auto mt-1 max-w-[34ch] text-sm text-muted">
          {unrated ? (
            'Это оценка по анкете. Она уточнится после первых рейтинговых матчей.'
          ) : calibrated ? (
            ratedMatchesLabel(ratedMatches)
          ) : (
            <>
              Ещё {remaining} {plural(remaining, 'матч', 'матча', 'матчей')} — до этого уровень будет
              заметно двигаться
            </>
          )}
        </p>
      </div>
    </section>
  );
}
