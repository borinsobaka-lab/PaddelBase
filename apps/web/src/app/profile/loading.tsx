import { AppShell } from '@/components/AppShell';
import { SkeletonLine, SkeletonScreen } from '@/components/Skeleton';

/** Скелет профиля: шапка, диск уровня, статистика, история. */
export default function ProfileLoading() {
  return (
    <AppShell>
      <SkeletonScreen>
        <div className="flex items-center gap-4 pt-5">
          <div className="size-14 shrink-0 rounded-full bg-sunken" />
          <div className="space-y-2">
            <SkeletonLine className="w-40" />
            <SkeletonLine className="w-24" />
          </div>
        </div>

        <div className="h-[320px] rounded-card bg-sunken" />
        <div className="h-14 rounded-card bg-sunken" />

        <div className="space-y-3">
          <SkeletonLine className="w-32" />
          <div className="h-[200px] rounded-card bg-sunken" />
        </div>
      </SkeletonScreen>
    </AppShell>
  );
}
