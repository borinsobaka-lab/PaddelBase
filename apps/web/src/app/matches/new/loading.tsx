import { SkeletonScreen, SkeletonTitle } from '@/components/Skeleton';

/** Скелет формы создания матча. */
export default function NewMatchLoading() {
  return (
    <SkeletonScreen>
      <div className="size-11 rounded-full bg-sunken" />
      <SkeletonTitle />
      <div className="h-[220px] rounded-card bg-sunken" />
      <div className="h-[260px] rounded-card bg-sunken" />
      <div className="h-14 rounded-control bg-sunken" />
    </SkeletonScreen>
  );
}
