'use client';

import Link from 'next/link';
import { useState } from 'react';

/**
 * Плавающая кнопка создания (ТЗ §5.1): шторка с выбором матч / турнир.
 */
export function CreateButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 left-1/2 z-10 flex min-h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-accent px-5 font-medium text-accent-ink shadow-lg"
      >
        <span aria-hidden className="text-lg leading-none">
          +
        </span>
        Создать
      </button>

      {open ? (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-text/30">
          {/* Клик по затемнению закрывает шторку — это ожидаемое поведение,
              и без него единственный выход остаётся кнопкой «Отмена». */}
          <button
            type="button"
            aria-label="Закрыть"
            className="absolute inset-0"
            onClick={() => setOpen(false)}
          />

          <div className="relative mx-auto w-full max-w-[430px] rounded-t-card border border-border bg-surface p-4 pb-8">
            <p className="pb-3 text-center text-sm text-muted">Что создаём?</p>
            <div className="flex flex-col gap-2">
              <Link
                href="/matches/new"
                className="flex min-h-12 items-center justify-center rounded-control bg-accent font-medium text-accent-ink"
              >
                Матч 2 × 2
              </Link>
              <Link
                href="/tournaments/new"
                className="flex min-h-12 items-center justify-center rounded-control border border-border-strong bg-surface font-medium"
              >
                Турнир
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-12 text-sm text-muted"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
