import type { ComponentProps, ReactNode } from 'react';

/**
 * Минимальный набор примитивов.
 *
 * Полноценная библиотека компонентов здесь пока не нужна: экранов мало, а
 * лишний слой абстракции над тремя кнопками только мешает читать код.
 */

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border border-border bg-surface p-4 ${className}`}>
      {children}
    </div>
  );
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: 'primary' | 'ghost' }) {
  // Все тапабельные элементы не меньше 44 px по высоте (ТЗ §9).
  const base =
    'inline-flex min-h-11 w-full items-center justify-center rounded-control px-4 text-base font-medium transition-colors disabled:opacity-50';
  const styles =
    variant === 'primary'
      ? 'bg-accent text-accent-ink hover:bg-accent/90'
      : 'border border-border text-text hover:bg-surface-raised';

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

export function TextInput(props: ComponentProps<'input'>) {
  return (
    <input
      className="min-h-11 w-full rounded-control border border-border bg-surface-raised px-3 text-base outline-none placeholder:text-muted focus:border-accent"
      {...props}
    />
  );
}

/** Сообщение об ошибке говорит, что произошло и что делать (ТЗ §9). */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">
      {children}
    </p>
  );
}

export function PageTitle({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return (
    <header className="pb-6 pt-8">
      <h1 className="text-2xl font-semibold">{children}</h1>
      {subtitle ? <p className="mt-2 text-sm text-muted">{subtitle}</p> : null}
    </header>
  );
}
