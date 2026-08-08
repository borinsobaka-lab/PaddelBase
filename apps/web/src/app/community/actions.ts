'use server';

import {
  CommunityError,
  commentOnPost,
  createPost,
  reportPost,
  setPostHidden,
  setPostPinned,
  toggleLike,
  type MediaItem,
} from '@paddelbase/core';
import { prisma } from '@paddelbase/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { loadCurrentUser } from '@/lib/currentUser';
import { revalidateFeedsAndNotifications } from '@/lib/revalidate';

export interface CommunityActionState {
  error?: string;
  notice?: string;
}

function toState(error: unknown): CommunityActionState {
  if (error instanceof CommunityError) return { error: error.message };
  throw error;
}

async function currentUserId(): Promise<string> {
  const user = await loadCurrentUser();
  if (!user) redirect('/login');
  return user.id;
}

export async function publish(
  _previous: CommunityActionState,
  formData: FormData,
): Promise<CommunityActionState> {
  let postId: string;

  try {
    // Файлы уже загружены с клиента, здесь приходят только описания.
    const media = JSON.parse(String(formData.get('media') || '[]')) as MediaItem[];

    postId = await createPost(prisma, {
      authorId: await currentUserId(),
      text: String(formData.get('text') ?? ''),
      media,
    });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return { error: 'Не удалось разобрать список вложений' };
    return toState(error);
  }

  redirect(`/community/${postId}`);
}

export async function like(
  _previous: CommunityActionState,
  formData: FormData,
): Promise<CommunityActionState> {
  try {
    await toggleLike(prisma, {
      postId: String(formData.get('postId')),
      userId: await currentUserId(),
    });
    revalidatePath('/community');
  revalidatePath('/notifications');
    return {};
  } catch (error: unknown) {
    return toState(error);
  }
}

export async function comment(
  _previous: CommunityActionState,
  formData: FormData,
): Promise<CommunityActionState> {
  const postId = String(formData.get('postId'));

  try {
    await commentOnPost(prisma, {
      postId,
      authorId: await currentUserId(),
      text: String(formData.get('text') ?? ''),
    });
    revalidatePath(`/community/${postId}`);
    return {};
  } catch (error: unknown) {
    return toState(error);
  }
}

export async function report(
  _previous: CommunityActionState,
  formData: FormData,
): Promise<CommunityActionState> {
  const postId = String(formData.get('postId'));

  try {
    await reportPost(prisma, {
      postId,
      reporterId: await currentUserId(),
      ...(String(formData.get('reason') ?? '').trim() === ''
        ? {}
        : { reason: String(formData.get('reason')).trim() }),
    });
    revalidatePath(`/community/${postId}`);
    return { notice: 'Жалоба отправлена, модератор посмотрит' };
  } catch (error: unknown) {
    return toState(error);
  }
}

export async function moderate(
  _previous: CommunityActionState,
  formData: FormData,
): Promise<CommunityActionState> {
  const postId = String(formData.get('postId'));
  const adminId = await currentUserId();

  try {
    if (formData.get('action') === 'pin') {
      await setPostPinned(prisma, { postId, adminId, pinned: formData.get('value') === 'on' });
    } else {
      await setPostHidden(prisma, { postId, adminId, hidden: formData.get('value') === 'on' });
    }
    revalidatePath('/community');
  revalidatePath('/notifications');
    revalidatePath(`/community/${postId}`);
    return {};
  } catch (error: unknown) {
    return toState(error);
  }
}
