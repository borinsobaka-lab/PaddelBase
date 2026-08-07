import { AppShell } from '@/components/AppShell';

/**
 * Скелет главной.
 *
 * Экран собирает четыре запроса к базе, и на мобильной сети между нажатием и
 * первым пикселем проходит заметное время. Пустой белый экран в этот момент
 * читается как поломка, а не как загрузка.
 */
export default function HomeLoading() {
  return (
    <AppShell>
      <main className="flex animate-pulse flex-col gap-7 pt-5" aria-busy="true">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-sunken" />
            <div className="space-y-1">
              <div className="h-4 w-24 rounded-chip bg-sunken" />
              <div className="h-3 w-32 rounded-chip bg-sunken" />
            </div>
          </div>
          <div className="size-11 rounded-full bg-sunken" />
        </div>

        <div className="h-[84px] rounded-card bg-sunken" />

        <div className="space-y-3">
          <div className="h-5 w-32 rounded-chip bg-sunken" />
          <div className="h-[168px] rounded-card bg-sunken" />
        </div>

        <div className="space-y-3">
          <div className="h-5 w-40 rounded-chip bg-sunken" />
          <div className="h-[168px] rounded-card bg-sunken" />
        </div>
      </main>
    </AppShell>
  );
}
