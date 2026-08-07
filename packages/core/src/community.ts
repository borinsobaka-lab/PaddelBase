import { toJson, type Prisma, type PrismaClient } from '@paddelbase/db';

/**
 * Лента комьюнити (ТЗ §5.5): посты, плоские комментарии, лайки, жалобы.
 *
 * Модерация в MVP ручная: жалоба поднимает флаг, скрывает контент админ.
 */

export class CommunityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommunityError';
  }
}

export const MAX_POST_LENGTH = 2000;
export const MAX_COMMENT_LENGTH = 1000;
export const MAX_IMAGES_PER_POST = 10;
export const MAX_VIDEOS_PER_POST = 2;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 120;

export interface MediaItem {
  type: 'image' | 'video';
  url: string;
  width?: number;
  height?: number;
  /** Только для видео. */
  durationSec?: number;
  sizeBytes?: number;
}

/**
 * Ограничения §5.5 проверяются на сервере, хотя сжатие и обрезка делаются на
 * клиенте: клиент можно обойти, а стоимость хранения и трафика реальная.
 */
export function validateMedia(media: readonly MediaItem[]): void {
  const images = media.filter((item) => item.type === 'image');
  const videos = media.filter((item) => item.type === 'video');

  if (images.length > 0 && videos.length > 0) {
    throw new CommunityError('В посте могут быть либо фото, либо видео, но не вместе');
  }
  if (images.length > MAX_IMAGES_PER_POST) {
    throw new CommunityError(`Не больше ${MAX_IMAGES_PER_POST} фото в посте`);
  }
  if (videos.length > MAX_VIDEOS_PER_POST) {
    throw new CommunityError(`Не больше ${MAX_VIDEOS_PER_POST} видео в посте`);
  }

  for (const video of videos) {
    if (video.sizeBytes !== undefined && video.sizeBytes > MAX_VIDEO_BYTES) {
      throw new CommunityError('Видео не больше 100 МБ');
    }
    if (video.durationSec !== undefined && video.durationSec > MAX_VIDEO_SECONDS) {
      throw new CommunityError('Видео не длиннее двух минут');
    }
  }

  for (const item of media) {
    if (!item.url) throw new CommunityError('У вложения не указан адрес файла');
  }
}

export async function createPost(
  prisma: PrismaClient,
  input: { authorId: string; text: string; media?: readonly MediaItem[] },
): Promise<string> {
  const text = input.text.trim();

  if (text.length === 0 && (input.media ?? []).length === 0) {
    throw new CommunityError('Пост не может быть пустым');
  }
  if (text.length > MAX_POST_LENGTH) {
    throw new CommunityError(`Текст поста не длиннее ${MAX_POST_LENGTH} символов`);
  }
  validateMedia(input.media ?? []);

  const post = await prisma.post.create({
    data: {
      authorId: input.authorId,
      text,
      media: toJson(input.media ?? []),
    },
  });

  return post.id;
}

export async function commentOnPost(
  prisma: PrismaClient,
  input: { postId: string; authorId: string; text: string },
): Promise<string> {
  const text = input.text.trim();

  if (text.length === 0) throw new CommunityError('Комментарий не может быть пустым');
  if (text.length > MAX_COMMENT_LENGTH) {
    throw new CommunityError(`Комментарий не длиннее ${MAX_COMMENT_LENGTH} символов`);
  }

  return prisma.$transaction(async (tx) => {
    const post = await tx.post.findUnique({ where: { id: input.postId } });
    if (!post) throw new CommunityError('Пост не найден');
    if (post.isHidden) throw new CommunityError('Пост скрыт модератором');

    const comment = await tx.postComment.create({
      data: { postId: post.id, authorId: input.authorId, text },
    });

    // Автору собственного комментария уведомление не нужно.
    if (post.authorId !== input.authorId) {
      await tx.notification.create({
        data: {
          userId: post.authorId,
          type: 'POST_COMMENT',
          payload: toJson({ postId: post.id, commentId: comment.id, authorId: input.authorId }),
        },
      });
    }

    return comment.id;
  });
}

/** Лайк-переключатель: возвращает состояние после нажатия. */
export async function toggleLike(
  prisma: PrismaClient,
  input: { postId: string; userId: string },
): Promise<{ liked: boolean; likes: number }> {
  return prisma.$transaction(async (tx) => {
    const post = await tx.post.findUnique({ where: { id: input.postId } });
    if (!post) throw new CommunityError('Пост не найден');

    const existing = await tx.postLike.findUnique({
      where: { postId_userId: { postId: input.postId, userId: input.userId } },
    });

    if (existing) {
      await tx.postLike.delete({ where: { id: existing.id } });
    } else {
      await tx.postLike.create({ data: { postId: input.postId, userId: input.userId } });
    }

    return {
      liked: !existing,
      likes: await tx.postLike.count({ where: { postId: input.postId } }),
    };
  });
}

export async function reportPost(
  prisma: PrismaClient,
  input: { postId: string; reporterId: string; commentId?: string; reason?: string },
): Promise<string> {
  const post = await prisma.post.findUnique({ where: { id: input.postId } });
  if (!post) throw new CommunityError('Пост не найден');

  const report = await prisma.postReport.create({
    data: {
      postId: input.postId,
      reporterId: input.reporterId,
      ...(input.commentId === undefined ? {} : { commentId: input.commentId }),
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    },
  });

  return report.id;
}

// --- Модерация ---

async function requireAdmin(prisma: PrismaClient, userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== 'ADMIN') {
    throw new CommunityError('Действие доступно только администратору');
  }
}

export async function setPostHidden(
  prisma: PrismaClient,
  input: { postId: string; adminId: string; hidden: boolean },
): Promise<void> {
  await requireAdmin(prisma, input.adminId);
  await prisma.post.update({
    where: { id: input.postId },
    data: { isHidden: input.hidden },
  });
}

export async function setCommentHidden(
  prisma: PrismaClient,
  input: { commentId: string; adminId: string; hidden: boolean },
): Promise<void> {
  await requireAdmin(prisma, input.adminId);
  await prisma.postComment.update({
    where: { id: input.commentId },
    data: { isHidden: input.hidden },
  });
}

/** Закрепление поста вверху ленты. Ставит только админ (ТЗ §5.5). */
export async function setPostPinned(
  prisma: PrismaClient,
  input: { postId: string; adminId: string; pinned: boolean },
): Promise<void> {
  await requireAdmin(prisma, input.adminId);
  await prisma.post.update({
    where: { id: input.postId },
    data: { isPinned: input.pinned },
  });
}

export async function resolveReport(
  prisma: PrismaClient,
  input: { reportId: string; adminId: string },
): Promise<void> {
  await requireAdmin(prisma, input.adminId);
  await prisma.postReport.update({
    where: { id: input.reportId },
    data: { isResolved: true },
  });
}

// --- Лента ---

export interface FeedPost {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  text: string;
  media: MediaItem[];
  isPinned: boolean;
  createdAt: Date;
  likes: number;
  comments: number;
  likedByMe: boolean;
}

export interface FeedPage {
  posts: FeedPost[];
  /** Курсор для следующей страницы; null — лента кончилась. */
  nextCursor: string | null;
}

/**
 * Страница ленты (ТЗ §5.5): закреплённое сверху, дальше по дате вниз.
 *
 * Закреплённые посты возвращаются только на первой странице: иначе они
 * повторялись бы в каждой при бесконечной прокрутке.
 */
export async function getFeed(
  prisma: PrismaClient,
  input: { viewerId?: string; cursor?: string; limit?: number } = {},
): Promise<FeedPage> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const firstPage = input.cursor === undefined;

  const cursorDate = input.cursor === undefined ? undefined : new Date(input.cursor);
  if (cursorDate !== undefined && Number.isNaN(cursorDate.getTime())) {
    throw new CommunityError('Некорректный курсор ленты');
  }

  const include = {
    author: { select: { firstName: true, lastName: true, role: true } },
    _count: { select: { likes: true, comments: true } },
  } satisfies Prisma.PostInclude;

  const pinned = firstPage
    ? await prisma.post.findMany({
        where: { isPinned: true, isHidden: false },
        include,
        orderBy: { createdAt: 'desc' },
      })
    : [];

  const rest = await prisma.post.findMany({
    where: {
      isPinned: false,
      isHidden: false,
      ...(cursorDate === undefined ? {} : { createdAt: { lt: cursorDate } }),
    },
    include,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });

  const page = rest.slice(0, limit);
  const hasMore = rest.length > limit;

  const ids = [...pinned, ...page].map((post) => post.id);
  const myLikes =
    input.viewerId === undefined || ids.length === 0
      ? []
      : await prisma.postLike.findMany({
          where: { userId: input.viewerId, postId: { in: ids } },
          select: { postId: true },
        });

  const likedSet = new Set(myLikes.map((like) => like.postId));

  const toFeedPost = (post: (typeof rest)[number]): FeedPost => ({
    id: post.id,
    authorId: post.authorId,
    authorName: `${post.author.firstName} ${post.author.lastName}`.trim(),
    authorRole: post.author.role,
    text: post.text,
    media: (post.media as unknown as MediaItem[]) ?? [],
    isPinned: post.isPinned,
    createdAt: post.createdAt,
    likes: post._count.likes,
    comments: post._count.comments,
    likedByMe: likedSet.has(post.id),
  });

  return {
    posts: [...pinned, ...page].map(toFeedPost),
    nextCursor: hasMore ? page[page.length - 1]!.createdAt.toISOString() : null,
  };
}

export async function getComments(
  prisma: PrismaClient,
  input: { postId: string },
): Promise<
  { id: string; authorId: string; authorName: string; text: string; createdAt: Date }[]
> {
  const comments = await prisma.postComment.findMany({
    where: { postId: input.postId, isHidden: false },
    include: { author: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return comments.map((comment) => ({
    id: comment.id,
    authorId: comment.authorId,
    authorName: `${comment.author.firstName} ${comment.author.lastName}`.trim(),
    text: comment.text,
    createdAt: comment.createdAt,
  }));
}
