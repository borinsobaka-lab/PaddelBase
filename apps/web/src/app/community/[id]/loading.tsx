import { SkeletonLine, SkeletonScreen } from '@/components/Skeleton';

/** Скелет поста с обсуждением. */
export default function PostLoading() {
  return (
    <SkeletonScreen>
      <div className="size-11 rounded-full bg-sunken" />
      <div className="h-[200px] rounded-card bg-sunken" />
      <SkeletonLine className="w-32" />
      <div className="h-[140px] rounded-card bg-sunken" />
    </SkeletonScreen>
  );
}
