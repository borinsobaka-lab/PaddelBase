import { AppShell } from '@/components/AppShell';
import { SkeletonScreen, SkeletonSection, SkeletonTitle } from '@/components/Skeleton';

/** Скелет списка игр: заголовок, день, карточки. */
export default function GamesLoading() {
  return (
    <AppShell>
      <SkeletonScreen>
        <SkeletonTitle />
        <SkeletonSection cards={3} />
        <SkeletonSection cards={1} />
      </SkeletonScreen>
    </AppShell>
  );
}
