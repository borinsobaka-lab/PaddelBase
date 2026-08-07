import { formatLevel, levelCategory } from '@paddelbase/rating';

/**
 * Уровень с дугой надёжности — сигнатурный элемент ТЗ §9.
 *
 * Дуга здесь не украшение: она отвечает на вопрос «насколько этой цифре можно
 * верить». Без неё уровень новичка и уровень ветерана выглядят одинаково
 * весомо, а это ровно та ошибка, которую рейтинговая система обязана не
 * допускать.
 *
 * В компактном размере буквенная категория не показывается: на 60 px она
 * нечитаема, а число рядом с ней перестаёт помещаться. Категория живёт в
 * строке рядом с диском, где её видно.
 */
const SIZES = {
  sm: { box: 60, stroke: 4, value: 'text-title', category: null },
  lg: { box: 168, stroke: 8, value: 'text-hero', category: 'text-body' },
} as const;

export function LevelDial({
  level,
  reliability,
  size = 'sm',
}: {
  level: number;
  reliability: number;
  size?: keyof typeof SIZES;
}) {
  const { box, stroke, value, category } = SIZES[size];
  const radius = (box - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, reliability));
  const calibrated = progress >= 0.6;

  return (
    <div className="relative shrink-0" style={{ width: box, height: box }}>
      <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} aria-hidden>
        <circle
          cx={box / 2}
          cy={box / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={stroke}
        />
        {/* Дуга дорисовывается от нуля к своему значению: уровень буквально
            набирается. Конечное состояние задано атрибутом, поэтому если
            анимация не запустится — фоновая вкладка, headless-рендер,
            prefers-reduced-motion — дуга уже нарисована правильно. */}
        <circle
          className="draw-arc"
          style={{ '--arc-length': `${circumference}px` } as React.CSSProperties}
          cx={box / 2}
          cy={box / 2}
          r={radius}
          fill="none"
          stroke={calibrated ? 'var(--color-accent)' : 'var(--color-warn)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          transform={`rotate(-90 ${box / 2} ${box / 2})`}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`figure ${value} font-semibold leading-none`}>{formatLevel(level)}</span>
        {category ? (
          <span className={`${category} mt-1 font-medium leading-none text-muted`}>
            {levelCategory(level)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
