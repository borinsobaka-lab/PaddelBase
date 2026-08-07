'use server';

import { redirect } from 'next/navigation';

import { destroySession } from '@/lib/session';

export async function signOut(): Promise<void> {
  await destroySession();
  redirect('/login');
}
