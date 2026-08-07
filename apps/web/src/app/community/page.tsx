import { getFeed } from '@paddelbase/core';
import { prisma } from '@paddelbase/db';
import Link from 'next/link';

import { AppShell } from '@/components/AppShell';
import { PostCard } from '@/components/PostCard';
import { Button, EmptyState, PageTitle } from '@/components/ui';
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
    <AppShell fab={<WriteButton />}>
      <main>
        <PageTitle subtitle="Кто что ищет, кто где играл">Комьюнити</PageTitle>

        {feed.posts.length === 0 ? (
          <EmptyState
            title="Постов пока нет"
            hint="Напишите первый — расскажите, где играете и кого ищете."
            action={
              <Link href="/community/new">
                <Button className="!w-auto px-5">Написать пост</Button>
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {feed.posts.map((post) => (
              <PostCard key={post.id} post={post} href={`/community/${post.id}`} />
            ))}
          </div>
        )}

        {feed.nextCursor ? (
          <div className="pt-4">
            <Link href={`/community?cursor=${encodeURIComponent(feed.nextCursor)}`}>
              <Button variant="ghost">Показать ещё</Button>
            </Link>
          </div>
        ) : null}
      </main>
    </AppShell>
  );
}

/** Та же плавающая кнопка, что и на главной, — только пишет пост. */
function WriteButton() {
  return (
    <Link
      href="/community/new"
      className="pressable fixed bottom-[calc(72px+env(safe-area-inset-bottom))] left-1/2 z-20 flex min-h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-accent px-5 text-[15px] font-semibold text-accent-ink shadow-float"
    >
      <span aria-hidden className="text-lg leading-none">
        +
      </span>
      Написать
    </Link>
  );
}
