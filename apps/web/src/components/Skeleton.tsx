/**
 * Кусочки скелетов загрузки.
 *
 * Скелет повторяет раскладку экрана, а не изображает абстрактную «загрузку».
 * Крутящийся кружок сообщает только «ждите»; скелет заодно говорит, чего
 * ждать, и экран не прыгает, когда данные приходят.
 *
 * Пульсация одна на весь экран — задаётся на контейнере, а не на каждом
 * блоке: иначе куски мигают вразнобой и это читается как помеха.
 */
export function SkeletonLine({ className = 'w-32' }: { className?: string }) {
  return <div className={`h-4 rounded-chip bg-sunken ${className}`} />;
}

export function SkeletonTitle() {
  return (
    <div className="space-y-2 pb-5 pt-7">
      <div className="h-7 w-48 rounded-chip bg-sunken" />
      <div className="h-4 w-64 rounded-chip bg-sunken" />
    </div>
  );
}

/** Карточка матча или турнира: время, место, корт, подвал. */
export function SkeletonCard() {
  return <div className="h-[168px] rounded-card bg-sunken" />;
}

export function SkeletonSection({ cards = 2 }: { cards?: number }) {
  return (
    <section className="space-y-3">
      <SkeletonLine className="w-40" />
      {Array.from({ length: cards }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </section>
  );
}

/** Список строк: уведомления, участники, история. */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-[76px] rounded-card bg-sunken" />
      ))}
    </div>
  );
}

/** Обёртка: пульсация и метка для читалок с экрана. */
export function SkeletonScreen({ children }: { children: React.ReactNode }) {
  return (
    <main className="screen animate-pulse" aria-busy="true" aria-label="Загрузка">
      {children}
    </main>
  );
}
