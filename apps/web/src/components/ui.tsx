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

/** Сообщение об ошибке говорит, что произошло и что делать (ТЗ §9). */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
      {children}
    </p>
  );
}

export function PageTitle({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return (
    <header className="pb-5 pt-7">
      <h1 className="text-[26px] font-semibold leading-tight">{children}</h1>
      {subtitle ? <p className="mt-1.5 text-sm text-text-secondary">{subtitle}</p> : null}
    </header>
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
