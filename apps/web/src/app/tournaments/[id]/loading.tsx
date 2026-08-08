import { SkeletonLine, SkeletonScreen } from '@/components/Skeleton';

/** Скелет турнира: шапка и вкладки. */
export default function TournamentLoading() {
  return (
    <SkeletonScreen>
      <div className="size-11 rounded-full bg-sunken" />
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-chip bg-sunken" />
        <SkeletonLine className="w-56" />
      </div>
      <div className="h-12 rounded-control bg-sunken" />
      <div className="h-[280px] rounded-card bg-sunken" />
    </SkeletonScreen>
  );
}
