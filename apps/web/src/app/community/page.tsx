import { getFeed } from '@paddelbase/core';
import { prisma } from '@paddelbase/db';
import Link from 'next/link';

import { AppShell } from '@/components/AppShell';
import { PostCard } from '@/components/PostCard';
import { PageTitle } from '@/components/ui';
import { requireOnboardedUser } from '@/lib/currentUser';

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const user = await requireOnboardedUser();
  const { cursor } = await searchParams;

  const feed = await getFeed(prisma, {
    viewerId: user.id,
    ...(cursor ? { cursor } : {}),
    limit: 20,
  });

  return (
    <AppShell>
      <main className="pb-24">
        <PageTitle subtitle="Кто что ищет, кто где играл">Комьюнити</PageTitle>

        <div className="flex flex-col gap-3">
          {feed.posts.length === 0 ? (
            <p className="text-sm text-muted">
              Постов пока нет. Напишите первый — расскажите, где играете.
            </p>
          ) : null}

          {feed.posts.map((post) => (
            <PostCard key={post.id} post={post} href={`/community/${post.id}`} />
          ))}
        </div>

        {feed.nextCursor ? (
          <div className="pt-4">
            <Link
              href={`/community?cursor=${encodeURIComponent(feed.nextCursor)}`}
              className="flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface text-sm font-medium"
            >
              Показать ещё
            </Link>
          </div>
        ) : null}
      </main>

      <Link
        href="/community/new"
        className="fixed bottom-20 left-1/2 z-10 flex min-h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-accent px-5 font-medium text-accent-ink shadow-lg"
      >
        <span aria-hidden className="text-lg leading-none">
          +
        </span>
        Написать
      </Link>
    </AppShell>
  );
}
