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
        className="pressable fixed bottom-[calc(72px+env(safe-area-inset-bottom))] left-1/2 z-fab flex min-h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-accent px-5 text-body font-semibold text-accent-ink shadow-float"
      >
        <span aria-hidden className="text-title leading-none">
          +
        </span>
        Создать
      </button>

      {open ? (
        <div className="fixed inset-0 z-overlay flex items-end justify-center bg-text/35 backdrop-blur-[2px]">
          {/* Клик по затемнению закрывает шторку — это ожидаемое поведение,
              и без него единственный выход остаётся кнопкой «Отмена». */}
          <button
            type="button"
            aria-label="Закрыть"
            className="absolute inset-0"
            onClick={() => setOpen(false)}
          />

          <div className="relative mx-auto w-full max-w-[430px] rounded-t-sheet bg-surface p-4 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-float">
            <p className="pb-3 text-center text-small text-muted">Что создаём?</p>
            <div className="flex flex-col gap-2">
              <Link
                href="/matches/new"
                className="pressable flex min-h-12 items-center justify-center rounded-control bg-accent text-body font-semibold text-accent-ink"
              >
                Матч 2 × 2
              </Link>
              <Link
                href="/tournaments/new"
                className="pressable flex min-h-12 items-center justify-center rounded-control bg-surface text-body font-medium shadow-raise"
              >
                Турнир
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-12 text-small text-muted"
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
