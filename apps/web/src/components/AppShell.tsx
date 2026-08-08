import type { ReactNode } from 'react';

import { BottomNav } from './BottomNav';

/**
 * Каркас экранов с нижней навигацией.
 *
 * Отступ снизу один на всё приложение и равен высоте панели: кнопка создания
 * переехала в саму панель, и компенсировать плавающий элемент больше не нужно.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="pb-[calc(72px+env(safe-area-inset-bottom))]">{children}</div>
      <BottomNav />
    </>
  );
}
