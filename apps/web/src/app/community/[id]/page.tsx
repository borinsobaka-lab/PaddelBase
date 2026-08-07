import { getComments, getFeed } from '@paddelbase/core';
import { prisma } from '@paddelbase/db';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PostCard } from '@/components/PostCard';
import { requireOnboardedUser } from '@/lib/currentUser';

import { CommentsPanel, ModerationPanel, ReportPanel } from './panels';

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireOnboardedUser();

  // Отдельного запроса «один пост» нет намеренно: лента уже считает лайки,
  // комментарии и отметку «мне нравится», и второй способ собрать те же поля
  // рано или поздно разошёлся бы с первым.
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post || (post.isHidden && user.role !== 'ADMIN')) notFound();

  const [feed, comments] = await Promise.all([
    getFeed(prisma, { viewerId: user.id, limit: 50 }),
    getComments(prisma, { postId: id }),
  ]);

  const card = feed.posts.find((entry) => entry.id === id);

  return (
    <main className="flex flex-col gap-4 pb-10">
      <div className="pt-6">
        <Link href="/community" className="text-sm text-muted">
          ← Лента
        </Link>
      </div>

      {card ? <PostCard post={card} /> : null}

      <CommentsPanel postId={id} comments={comments} />

      {user.role === 'ADMIN' ? (
        <ModerationPanel postId={id} isPinned={post.isPinned} isHidden={post.isHidden} />
      ) : (
        <ReportPanel postId={id} />
      )}
    </main>
  );
}
