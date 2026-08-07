import type { ReactNode } from 'react';

import { BottomNav } from './BottomNav';

/**
 * Каркас экранов с нижней навигацией.
 *
 * Отступ снизу считается здесь, а не на каждом экране: плавающая кнопка стоит
 * над панелью, и если про неё забыть, она накроет последнюю карточку списка.
 * Раньше так и было.
 */
export function AppShell({ children, fab }: { children: ReactNode; fab?: ReactNode }) {
  return (
    <>
      <div className={fab ? 'pb-36' : 'pb-24'}>{children}</div>
      {fab}
      <BottomNav />
    </>
  );
}
