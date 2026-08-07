import { formatLevel, levelCategory, matchesUntilCalibrated } from '@paddelbase/rating';

import { plural, ratedMatchesLabel } from '@/lib/format';

/**
 * Сигнатурный элемент приложения (ТЗ §9): крупная цифра уровня с дугой
 * надёжности вокруг неё, которая замыкается по мере калибровки.
 *
 * Это единственное место, где потрачена визуальная смелость. Дуга здесь не
 * украшение: она отвечает на вопрос «насколько этой цифре можно верить», а без
 * неё уровень новичка и уровень ветерана выглядели бы одинаково весомо.
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
  const size = 168;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, reliability));
  const remaining = matchesUntilCalibrated(reliability);
  const calibrated = remaining === 0;
  const unrated = ratedMatches === 0;

  return (
    <section className="flex flex-col items-center gap-4 rounded-card border border-border bg-surface p-6">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`Уровень ${formatLevel(level)}, надёжность ${Math.round(progress * 100)} процентов`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={calibrated ? 'var(--color-accent)' : 'var(--color-warn)'}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular text-5xl font-semibold leading-none">{formatLevel(level)}</span>
          <span className="mt-1 text-sm font-medium text-muted">{levelCategory(level)}</span>
        </div>
      </div>

      <p className="text-center text-sm text-muted">
        {unrated ? (
          <>
            Уровень пока не подтверждён.
            <br />
            Он уточнится после первых рейтинговых матчей.
          </>
        ) : calibrated ? (
          <>Уровень подтверждён · {ratedMatchesLabel(ratedMatches)}</>
        ) : (
          <>
            Калибровка: ещё {remaining} {plural(remaining, 'матч', 'матча', 'матчей')}
            <br />
            До этого уровень будет заметно меняться
          </>
        )}
      </p>
    </section>
  );
}
