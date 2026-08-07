import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/**
 * Примитивы интерфейса.
 *
 * Глубина одна на всё приложение: карточка стоит на кольце и мягкой тени, а не
 * на жёсткой границе. Граница остаётся там, где она разделяет — поля ввода,
 * разделители, пунктир свободного места. Смешивать две стратегии нельзя: как
 * только рядом окажутся карточка с рамкой и карточка с тенью, обе начнут
 * выглядеть случайными.
 */

export type Tone = 'default' | 'action' | 'warn' | 'accent';

const TONES: Record<Tone, string> = {
  default: 'bg-surface',
  // «Твой ход» — цвет мяча. Единственная насыщенная точка на корте и
  // единственное место в интерфейсе, где она уместна.
  action: 'bg-ball-soft',
  warn: 'bg-warn-soft',
  accent: 'bg-accent-soft',
};

export function Card({
  children,
  tone = 'default',
  className = '',
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={`rounded-card p-4 shadow-raise ${TONES[tone]} ${className}`}>{children}</div>
  );
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: 'primary' | 'ghost' | 'quiet' }) {
  // Все тапабельные элементы не меньше 44 px по высоте (ТЗ §9).
  const base =
    'pressable inline-flex min-h-11 w-full items-center justify-center rounded-control px-4 text-[15px] font-medium disabled:pointer-events-none disabled:opacity-45';

  const styles = {
    primary: 'bg-accent text-accent-ink shadow-raise hover:bg-accent/92',
    ghost: 'bg-surface text-text shadow-raise hover:bg-sunken',
    quiet: 'text-text-secondary hover:bg-sunken',
  }[variant];

  return <button className={`${base} ${styles} ${className}`} {...props} />;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

/**
 * Поле ввода утоплено относительно поверхности: более тёмная заливка сама
 * говорит «сюда вводят», и тяжёлая рамка для этого не нужна.
 */
export function TextInput(props: ComponentProps<'input'>) {
  return (
    <input
      className="min-h-11 w-full rounded-control border border-border bg-sunken px-3 text-base outline-none transition-colors placeholder:text-faint focus:border-accent focus:bg-surface"
      {...props}
    />
  );
}

/** Многострочный ввод. Утоплен так же, как TextInput: правило одно на все поля. */
export function Textarea(props: ComponentProps<'textarea'>) {
  return (
    <textarea
      className="w-full rounded-control border border-border bg-sunken p-3 text-base outline-none transition-colors placeholder:text-faint focus:border-accent focus:bg-surface"
      {...props}
    />
  );
}

/**
 * Выпадающий список.
 *
 * Нативный `select` стилизуется плохо, но заменять его самодельным меню ради
 * стрелки — плохая сделка: колесо выбора на телефоне удобнее любого нашего
 * списка. Поэтому убирается только системная стрелка, а поведение остаётся
 * платформенным.
 */
export function Select({ className = '', ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        className={`min-h-11 w-full appearance-none rounded-control border border-border bg-sunken py-2 pl-3 pr-10 text-base outline-none transition-colors focus:border-accent focus:bg-surface ${className}`}
        {...props}
      />
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
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

/**
 * Переключатель из нескольких вариантов в одну строку.
 *
 * Дорожка утоплена, выбранный вариант приподнят — то же правило глубины, что и
 * во всём остальном приложении. Выбор читается по высоте, а не по цвету:
 * зелёный нужен там, где он что-то значит, а не на каждом втором переключателе
 * формы.
 */
export function Segmented({
  children,
  columns = 2,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4;
}) {
  const cols = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' }[columns];
  return <div className={`grid ${cols} gap-1 rounded-control bg-sunken p-1`}>{children}</div>;
}

export function SegmentedOption({
  label,
  compact = false,
  ...props
}: ComponentProps<'input'> & { label: ReactNode; compact?: boolean }) {
  return (
    <label
      className={`pressable flex min-h-11 cursor-pointer items-center justify-center rounded-chip px-1 text-center font-medium text-text-secondary transition-colors has-checked:bg-surface has-checked:text-text has-checked:shadow-raise ${
        compact ? 'text-[13px]' : 'text-sm'
      }`}
    >
      <input type="radio" className="sr-only" {...props} />
      {label}
    </label>
  );
}

/**
 * Вариант ответа во всю ширину — для длинных формулировок, которые не влезают
 * в переключатель. Радиокнопка остаётся видимой: в списке из шести пунктов
 * подсветка выбранного без самой точки читается хуже.
 */
export function ChoiceRow({
  label,
  type = 'radio',
  ...props
}: ComponentProps<'input'> & { label: ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-control border border-border bg-surface p-3 text-sm transition-colors has-checked:border-accent has-checked:bg-accent-soft">
      <input
        type={type}
        className="mt-px size-4 shrink-0 accent-[var(--color-accent)]"
        {...props}
      />
      <span className="min-w-0">{label}</span>
    </label>
  );
}

/** Строка-флажок: сам флажок и подпись — одна цель нажатия высотой 44 px. */
export function CheckRow({
  label,
  hint,
  ...props
}: ComponentProps<'input'> & { label: ReactNode; hint?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1.5 text-sm">
      <input
        type="checkbox"
        className="size-[18px] shrink-0 accent-[var(--color-accent)]"
        {...props}
      />
      <span className="min-w-0">
        <span className="block leading-snug">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

/** Сообщение об ошибке говорит, что произошло и что делать (ТЗ §9). */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
      {children}
    </p>
  );
}

/** Спокойное подтверждение: действие прошло, ничего делать не нужно. */
export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-control bg-accent-soft px-3 py-2 text-sm text-accent">{children}</p>
  );
}

export function PageTitle({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return (
    <header className="pb-5 pt-7">
      <h1 className="text-[26px] font-semibold leading-tight">{children}</h1>
      {subtitle ? <p className="mt-1.5 max-w-[42ch] text-sm text-text-secondary">{subtitle}</p> : null}
    </header>
  );
}

/**
 * Возврат назад.
 *
 * Стрелка в тексте («← Назад») выглядит как строка, а не как кнопка, и по ней
 * промахиваются: у неё нет ни площади, ни очертания. Здесь это круглая цель
 * в 44 px на той же поверхности, что и остальные элементы управления.
 */
export function BackLink({ href, label = 'Назад' }: { href: string; label?: string }) {
  return (
    <div className="pt-4">
      <Link
        href={href}
        aria-label={label}
        className="pressable inline-flex size-11 items-center justify-center rounded-full bg-surface text-text-secondary shadow-raise"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
      </Link>
    </div>
  );
}

/**
 * Прилипшая снизу панель отправки.
 *
 * Формы здесь длинные — анкета на десять вопросов, создание турнира. Гонять
 * игрока к низу страницы ради единственной кнопки незачем, поэтому кнопка
 * едет вместе с ним. Растушёвка сверху нужна, чтобы контент уходил под панель
 * не обрубленным краем.
 */
export function StickyBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-1 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 top-0 -z-10 bg-linear-to-t from-canvas from-70% to-transparent"
      />
      {children}
    </div>
  );
}

/**
 * Заголовок секции с необязательной ссылкой «дальше».
 *
 * Подпись слева и действие справа на одной базовой линии: на 390 px это
 * единственный способ дать секции продолжение, не отнимая у неё строку.
 */
export function SectionHeader({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3">
      <h2 className="text-[17px] font-semibold leading-tight">{children}</h2>
      {action}
    </div>
  );
}

/**
 * Ссылка «дальше» в заголовке секции.
 *
 * Отрицательные поля возвращают строке визуальную высоту текста, оставляя
 * области нажатия полные 44 px: текстовая ссылка в 20 px — самая частая
 * причина промахов на телефоне.
 */
export function MoreLink({ children }: { children: ReactNode }) {
  return (
    <span className="-my-3 -mr-2 flex min-h-11 items-center px-2 text-sm font-medium text-accent">
      {children}
    </span>
  );
}

/**
 * Пустое состояние: зовёт к действию, а не извиняется (ТЗ §9).
 *
 * Пустой экран — самое частое первое впечатление, и строчка серого текста
 * оставляет игрока без единой подсказки, что делать дальше.
 */
export function EmptyState({
  title,
  hint,
  action,
  variant = 'card',
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  /**
   * card — для главного пустого состояния экрана: рамка, подсказка, кнопка.
   * quiet — для второстепенных лент: одна строка.
   *
   * Разница нужна не ради красоты. Три одинаковые пунктирные рамки подряд
   * весят одинаково, и игрок не понимает, с чего начать; тихая строка рядом
   * с полноценным призывом сразу показывает, что важнее.
   */
  variant?: 'card' | 'quiet';
}) {
  if (variant === 'quiet') {
    return (
      <p className="text-sm text-muted">
        {title}
        {hint ? <span className="block text-[13px] text-faint">{hint}</span> : null}
      </p>
    );
  }

  return (
    <div className="rounded-card border border-dashed border-border-strong px-4 py-7 text-center">
      <p className="text-[15px] font-medium">{title}</p>
      {hint ? <p className="mx-auto mt-1.5 max-w-[34ch] text-sm text-muted">{hint}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
