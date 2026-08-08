import { SkeletonLine, SkeletonScreen } from '@/components/Skeleton';

/** Скелет карточки матча. */
export default function MatchLoading() {
  return (
    <SkeletonScreen>
      <div className="size-11 rounded-full bg-sunken" />
      <div className="space-y-2">
        <div className="h-7 w-56 rounded-chip bg-sunken" />
        <SkeletonLine className="w-44" />
      </div>
      <div className="space-y-3">
        <SkeletonLine className="w-24" />
        <div className="h-[220px] rounded-card bg-sunken" />
      </div>
      <div className="h-14 rounded-control bg-sunken" />
    </SkeletonScreen>
  );
}
