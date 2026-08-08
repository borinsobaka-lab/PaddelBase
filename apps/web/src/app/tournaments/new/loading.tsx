import { SkeletonScreen, SkeletonTitle } from '@/components/Skeleton';

/** Скелет формы создания турнира. */
export default function NewTournamentLoading() {
  return (
    <SkeletonScreen>
      <div className="size-11 rounded-full bg-sunken" />
      <SkeletonTitle />
      <div className="h-[300px] rounded-card bg-sunken" />
      <div className="h-[220px] rounded-card bg-sunken" />
      <div className="h-14 rounded-control bg-sunken" />
    </SkeletonScreen>
  );
}
