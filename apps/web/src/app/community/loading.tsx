import { AppShell } from '@/components/AppShell';
import { SkeletonRows, SkeletonScreen, SkeletonTitle } from '@/components/Skeleton';

/** Скелет ленты комьюнити. */
export default function CommunityLoading() {
  return (
    <AppShell>
      <SkeletonScreen>
        <SkeletonTitle />
        <SkeletonRows rows={4} />
      </SkeletonScreen>
    </AppShell>
  );
}
