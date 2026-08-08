'use server';

import { prisma } from '@paddelbase/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { loadCurrentUser } from '@/lib/currentUser';
import { destroySession } from '@/lib/session';

import { parsePreferences } from './preferences';

export async function signOut(): Promise<void> {
  await destroySession();
  redirect('/login');
}

export interface PreferencesState {
  saved?: boolean;
  error?: string;
}

/**
 * Сохранение предпочтений в игре.
 *
 * Отдельного экрана у формы нет намеренно: четыре группы вариантов помещаются
 * в плашку на профиле, а лишний переход ради пяти нажатий — та причина, по
 * которой такие анкеты не заполняют.
 */
export async function savePreferences(
  _previous: PreferencesState,
  formData: FormData,
): Promise<PreferencesState> {
  const user = await loadCurrentUser();
  if (!user) redirect('/login');

  await prisma.user.update({
    where: { id: user.id },
    data: parsePreferences(formData),
  });

  revalidatePath('/profile');
  return { saved: true };
}
