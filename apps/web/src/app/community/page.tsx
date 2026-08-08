import { getFeed } from '@paddelbase/core';
import { prisma } from '@paddelbase/db';
import Link from 'next/link';

import { AppShell } from '@/components/AppShell';
import { PostCard } from '@/components/PostCard';
import { Button, EmptyState, Panel, ScreenTail, TopBar } from '@/components/ui';
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
      <main className="screen">
        {/* Написать пост — действие этого раздела, а не всего приложения,
            поэтому оно стоит рядом с его заголовком, а не в общей панели. */}
        <TopBar
          subtitle="Кто что ищет, кто где играл"
          action={
            <Link href="/community/new" className="shrink-0">
              <Button className="!min-h-11 !w-auto px-4 text-body">Пост</Button>
            </Link>
          }
        >
          Комьюнити
        </TopBar>

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
          <Panel>
            <div className="flex flex-col gap-3">
              {feed.posts.map((post) => (
                <PostCard key={post.id} post={post} href={`/community/${post.id}`} />
              ))}
            </div>
          </Panel>
        )}

        {feed.nextCursor ? (
          <div className="pt-4">
            <Link href={`/community?cursor=${encodeURIComponent(feed.nextCursor)}`}>
              <Button variant="ghost">Показать ещё</Button>
            </Link>
          </div>
        ) : null}
        <ScreenTail />
      </main>
    </AppShell>
  );
}

/** Та же плавающая кнопка, что и на главной, — только пишет пост. */
