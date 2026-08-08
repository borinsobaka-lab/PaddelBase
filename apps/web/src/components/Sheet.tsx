'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * Шторка снизу.
 *
 * Появление и уход анимированы намеренно. Шторка приходит снизу, из-за края
 * экрана, и это движение объясняет, откуда она взялась и куда денется; без
 * него она просто мигает на месте, и на пол-секунды непонятно, что изменилось.
 *
 * Уход требует отдельного состояния: размонтировать узел сразу — значит убрать
 * его до того, как анимация успеет проиграть. Поэтому закрытие сначала
 * помечается, а размонтирование ждёт `animationend`.
 *
 * При выключенном движении обе анимации схлопываются в 0.01 мс глобальным
 * правилом в globals.css, и `animationend` всё равно приходит.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
    }
  }, [open, mounted]);

  // Пока шторка открыта, страница под ней не должна прокручиваться: иначе
  // жест по затемнению уезжает контентом, а не закрывает шторку.
  useEffect(() => {
    if (!mounted) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mounted, onClose]);

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-overlay flex items-end justify-center ${
        closing ? 'sheet-backdrop-out' : 'sheet-backdrop-in'
      }`}
      onAnimationEnd={(event) => {
        // Событие всплывает и от самой шторки — реагируем только на затемнение.
        if (event.target !== event.currentTarget) return;
        if (closing) {
          setMounted(false);
          setClosing(false);
        }
      }}
    >
      {/* Нажатие по затемнению закрывает: без него единственным выходом
          осталась бы кнопка «Отмена». */}
      <button type="button" aria-label="Закрыть" className="absolute inset-0" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative mx-auto w-full max-w-[430px] rounded-t-sheet bg-surface px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3 ${
          closing ? 'sheet-out' : 'sheet-in'
        }`}
      >
        {/* Ручка: подсказывает, что шторку можно смахнуть, и служит визуальным
            верхом блока. */}
        <div aria-hidden className="mx-auto mb-3 h-1 w-9 rounded-full bg-border" />

        {title ? <p className="pb-3 text-center text-body text-muted">{title}</p> : null}
        {children}

        <button
          type="button"
          onClick={onClose}
          className="pressable mt-2 min-h-12 w-full text-body text-muted"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
