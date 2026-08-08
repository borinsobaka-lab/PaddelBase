import { AppShell } from '@/components/AppShell';
import { SkeletonRows, SkeletonScreen, SkeletonTitle } from '@/components/Skeleton';

/** Скелет уведомлений. */
export default function NotificationsLoading() {
  return (
    <AppShell>
      <SkeletonScreen>
        <SkeletonTitle />
        <SkeletonRows rows={5} />
      </SkeletonScreen>
    </AppShell>
  );
}
