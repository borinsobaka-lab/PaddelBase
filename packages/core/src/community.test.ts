import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  MAX_POST_LENGTH,
  commentOnPost,
  createPost,
  getComments,
  getFeed,
  reportPost,
  resolveReport,
  setCommentHidden,
  setPostHidden,
  setPostPinned,
  toggleLike,
  validateMedia,
  type MediaItem,
} from './community.js';
import { makePlayers, resetDatabase, testDatabaseUrl, testPrisma } from './testDb.js';

describe('ограничения вложений (ТЗ §5.5)', () => {
  const image: MediaItem = { type: 'image', url: 'https://example/1.jpg' };
  const video: MediaItem = { type: 'video', url: 'https://example/1.mp4' };

  it('пропускает до десяти фото', () => {
    expect(() => validateMedia(Array.from({ length: 10 }, () => image))).not.toThrow();
    expect(() => validateMedia(Array.from({ length: 11 }, () => image))).toThrow(/10 фото/);
  });

  it('пропускает до двух видео', () => {
    expect(() => validateMedia([video, video])).not.toThrow();
    expect(() => validateMedia([video, video, video])).toThrow(/2 видео/);
  });

  it('не даёт смешивать фото и видео в одном посте', () => {
    expect(() => validateMedia([image, video])).toThrow(/либо фото, либо видео/);
  });

  it('отвергает слишком тяжёлое и слишком длинное видео', () => {
    expect(() => validateMedia([{ ...video, sizeBytes: 101 * 1024 * 1024 }])).toThrow(/100 МБ/);
    expect(() => validateMedia([{ ...video, durationSec: 121 }])).toThrow(/двух минут/);
  });

  it('требует адрес файла', () => {
    expect(() => validateMedia([{ type: 'image', url: '' }])).toThrow(/адрес файла/);
  });
});

describe.skipIf(!testDatabaseUrl)('лента комьюнити', () => {
  afterAll(async () => {
    if (testDatabaseUrl) await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase();
    await makePlayers(['author', 'reader', 'other']);
    await testPrisma.user.create({
      data: {
        id: 'admin',
        firstName: 'Админ',
        lastName: 'Клуба',
        role: 'ADMIN',
        level: 3.0,
        startLevel: 3.0,
        selfAssessedLevel: 3.0,
      },
    });
  });

  describe('посты', () => {
    it('создаёт пост с текстом и вложениями', async () => {
      const id = await createPost(testPrisma, {
        authorId: 'author',
        text: '  Играем в субботу  ',
        media: [{ type: 'image', url: 'https://example/1.jpg', width: 1600, height: 900 }],
      });

      const post = await testPrisma.post.findUniqueOrThrow({ where: { id } });
      expect(post.text).toBe('Играем в субботу');
      expect(post.media).toHaveLength(1);
    });

    it('не принимает пустой и слишком длинный пост', async () => {
      await expect(createPost(testPrisma, { authorId: 'author', text: '   ' })).rejects.toThrow(
        /не может быть пустым/,
      );
      await expect(
        createPost(testPrisma, { authorId: 'author', text: 'x'.repeat(MAX_POST_LENGTH + 1) }),
      ).rejects.toThrow(/не длиннее/);
    });

    it('разрешает пост из одних вложений', async () => {
      const id = await createPost(testPrisma, {
        authorId: 'author',
        text: '',
        media: [{ type: 'image', url: 'https://example/1.jpg' }],
      });
      expect(id).toBeTruthy();
    });
  });

  describe('комментарии и лайки', () => {
    it('уведомляет автора поста о комментарии', async () => {
      const postId = await createPost(testPrisma, { authorId: 'author', text: 'Пост' });
      await commentOnPost(testPrisma, { postId, authorId: 'reader', text: 'Плюс один' });

      const notification = await testPrisma.notification.findFirstOrThrow({
        where: { userId: 'author', type: 'POST_COMMENT' },
      });
      expect(notification).toBeTruthy();
    });

    it('не уведомляет о собственном комментарии', async () => {
      const postId = await createPost(testPrisma, { authorId: 'author', text: 'Пост' });
      await commentOnPost(testPrisma, { postId, authorId: 'author', text: 'Дополню' });

      expect(await testPrisma.notification.count({ where: { type: 'POST_COMMENT' } })).toBe(0);
    });

    it('не даёт комментировать скрытый пост', async () => {
      const postId = await createPost(testPrisma, { authorId: 'author', text: 'Пост' });
      await setPostHidden(testPrisma, { postId, adminId: 'admin', hidden: true });

      await expect(
        commentOnPost(testPrisma, { postId, authorId: 'reader', text: 'Что тут было?' }),
      ).rejects.toThrow(/скрыт/);
    });

    it('переключает лайк', async () => {
      const postId = await createPost(testPrisma, { authorId: 'author', text: 'Пост' });

      expect(await toggleLike(testPrisma, { postId, userId: 'reader' })).toEqual({
        liked: true,
        likes: 1,
      });
      expect(await toggleLike(testPrisma, { postId, userId: 'other' })).toEqual({
        liked: true,
        likes: 2,
      });
      expect(await toggleLike(testPrisma, { postId, userId: 'reader' })).toEqual({
        liked: false,
        likes: 1,
      });
    });

    it('отдаёт комментарии по возрастанию даты и без скрытых', async () => {
      const postId = await createPost(testPrisma, { authorId: 'author', text: 'Пост' });
      await commentOnPost(testPrisma, { postId, authorId: 'reader', text: 'Первый' });
      const secondId = await commentOnPost(testPrisma, {
        postId,
        authorId: 'other',
        text: 'Второй',
      });

      await setCommentHidden(testPrisma, { commentId: secondId, adminId: 'admin', hidden: true });

      const comments = await getComments(testPrisma, { postId });
      expect(comments.map((comment) => comment.text)).toEqual(['Первый']);
      expect(comments[0]!.authorName).toBe('Тест reader');
    });
  });

  describe('модерация', () => {
    it('принимает жалобу и даёт админу её закрыть', async () => {
      const postId = await createPost(testPrisma, { authorId: 'author', text: 'Спорный пост' });
      const reportId = await reportPost(testPrisma, {
        postId,
        reporterId: 'reader',
        reason: 'Реклама',
      });

      await resolveReport(testPrisma, { reportId, adminId: 'admin' });

      const report = await testPrisma.postReport.findUniqueOrThrow({ where: { id: reportId } });
      expect(report.isResolved).toBe(true);
    });

    it('не пускает обычного игрока к модерации', async () => {
      const postId = await createPost(testPrisma, { authorId: 'author', text: 'Пост' });

      await expect(
        setPostHidden(testPrisma, { postId, adminId: 'reader', hidden: true }),
      ).rejects.toThrow(/только администратору/);
      await expect(
        setPostPinned(testPrisma, { postId, adminId: 'reader', pinned: true }),
      ).rejects.toThrow(/только администратору/);
    });
  });

  describe('лента', () => {
    async function seedPosts(count: number): Promise<string[]> {
      const ids: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const id = await createPost(testPrisma, {
          authorId: 'author',
          text: `Пост ${index}`,
        });
        // Разводим даты, чтобы порядок был однозначным.
        await testPrisma.post.update({
          where: { id },
          data: { createdAt: new Date(Date.UTC(2026, 7, 1, 0, index)) },
        });
        ids.push(id);
      }
      return ids;
    }

    it('сортирует по дате вниз и листается курсором без повторов', async () => {
      await seedPosts(7);

      const first = await getFeed(testPrisma, { limit: 3 });
      expect(first.posts.map((post) => post.text)).toEqual(['Пост 6', 'Пост 5', 'Пост 4']);
      expect(first.nextCursor).not.toBeNull();

      const second = await getFeed(testPrisma, { limit: 3, cursor: first.nextCursor! });
      expect(second.posts.map((post) => post.text)).toEqual(['Пост 3', 'Пост 2', 'Пост 1']);

      const third = await getFeed(testPrisma, { limit: 3, cursor: second.nextCursor! });
      expect(third.posts.map((post) => post.text)).toEqual(['Пост 0']);
      expect(third.nextCursor).toBeNull();
    });

    it('поднимает закреплённое наверх только на первой странице', async () => {
      const ids = await seedPosts(5);
      await setPostPinned(testPrisma, { postId: ids[0]!, adminId: 'admin', pinned: true });

      const first = await getFeed(testPrisma, { limit: 2 });
      expect(first.posts[0]!.text).toBe('Пост 0');
      expect(first.posts[0]!.isPinned).toBe(true);

      // На следующих страницах закреплённое не повторяется.
      const second = await getFeed(testPrisma, { limit: 2, cursor: first.nextCursor! });
      expect(second.posts.some((post) => post.isPinned)).toBe(false);
    });

    it('не показывает скрытые посты', async () => {
      const ids = await seedPosts(3);
      await setPostHidden(testPrisma, { postId: ids[1]!, adminId: 'admin', hidden: true });

      const feed = await getFeed(testPrisma, {});
      expect(feed.posts.map((post) => post.text)).toEqual(['Пост 2', 'Пост 0']);
    });

    it('считает лайки, комментарии и отмечает мои лайки', async () => {
      const [postId] = await seedPosts(1);
      await toggleLike(testPrisma, { postId: postId!, userId: 'reader' });
      await toggleLike(testPrisma, { postId: postId!, userId: 'other' });
      await commentOnPost(testPrisma, { postId: postId!, authorId: 'reader', text: 'Ок' });

      const mine = await getFeed(testPrisma, { viewerId: 'reader' });
      expect(mine.posts[0]).toMatchObject({ likes: 2, comments: 1, likedByMe: true });

      const theirs = await getFeed(testPrisma, { viewerId: 'admin' });
      expect(theirs.posts[0]!.likedByMe).toBe(false);
    });

    it('отдаёт роль автора для бейджа организатора', async () => {
      await seedPosts(1);
      const feed = await getFeed(testPrisma, {});
      expect(feed.posts[0]!.authorRole).toBe('PLAYER');
      expect(feed.posts[0]!.authorName).toBe('Тест author');
    });
  });
});
