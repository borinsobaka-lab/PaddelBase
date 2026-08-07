import { matchesUntilCalibrated } from '@paddelbase/rating';
import Link from 'next/link';

import { LevelDial } from './LevelDial';
import { plural, ratedMatchesLabel } from '@/lib/format';

/**
 * Компактная сводка уровня на главной.
 *
 * Раньше цифра уровня жила в углу шапки, а состояние калибровки — отдельной
 * жёлтой карточкой ста пикселями ниже. Это один и тот же факт, разнесённый по
 * экрану: сколько цифре верить, написано не там, где сама цифра. Здесь они
 * снова вместе, и экран теряет целый блок.
 */
export function LevelStrip({
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
    <Link
      href="/profile"
      className="pressable flex items-center gap-3.5 rounded-card bg-surface p-3.5 shadow-raise hover:shadow-lift"
    >
      <LevelDial level={level} reliability={reliability} />

      <div className="min-w-0 flex-1">
        <p className="label">Ваш уровень</p>
        <p className="mt-1 text-sm font-medium leading-snug">
          {unrated
            ? 'Пока не подтверждён'
            : calibrated
              ? 'Подтверждён'
              : `Калибровка · ещё ${remaining} ${plural(remaining, 'матч', 'матча', 'матчей')}`}
        </p>
        <p className="mt-0.5 text-[13px] text-muted">
          {unrated ? 'Уточнится после первых матчей' : ratedMatchesLabel(ratedMatches)}
        </p>
      </div>

      <ChevronIcon />
    </Link>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-faint"
      aria-hidden
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
