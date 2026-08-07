import type { ReactNode } from 'react';

import { BottomNav } from './BottomNav';

/** Каркас экранов с нижней навигацией: отступ снизу под панель. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="pb-20">{children}</div>
      <BottomNav />
    </>
  );
}
