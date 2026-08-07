import { prisma } from '@paddelbase/db';
import { redirect } from 'next/navigation';

import { readSession } from './session.js';

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof loadCurrentUser>>>;

export async function loadCurrentUser() {
  const userId = await readSession();
  if (!userId) return null;

  return prisma.user.findUnique({ where: { id: userId } });
}

/**
 * Пользователь, прошедший анкету. Всё, что показывает уровень, должно ходить
 * через неё: страница с рейтингом до заполнения анкеты показывала бы выдуманное
 * число.
 */
export async function requireOnboardedUser() {
  const user = await loadCurrentUser();
  if (!user) redirect('/login');
  if (user.onboardingCompletedAt === null) redirect('/onboarding');
  return user;
}
