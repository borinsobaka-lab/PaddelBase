'use server';

import { markNotificationsRead } from '@paddelbase/core';
import { prisma } from '@paddelbase/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { loadCurrentUser } from '@/lib/currentUser';

export async function markAllRead(): Promise<void> {
  const user = await loadCurrentUser();
  if (!user) redirect('/login');

  await markNotificationsRead(prisma, { userId: user.id });
  revalidatePath('/notifications');
  revalidatePath('/home');
}
