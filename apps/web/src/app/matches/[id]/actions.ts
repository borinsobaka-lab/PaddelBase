'use server';

import {
  MatchLifecycleError,
  MatchResultError,
  acceptApplication,
  applyToMatch,
  cancelMatch,
  confirmMatchResult,
  disputeMatchResult,
  enterMatchResult,
  leaveMatch,
  rejectApplication,
} from '@paddelbase/core';
import { InvalidScoreError } from '@paddelbase/core';
import { prisma } from '@paddelbase/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { loadCurrentUser } from '@/lib/currentUser';
import { revalidateFeedsAndNotifications } from '@/lib/revalidate';

export interface ActionState {
  error?: string;
  notice?: string;
}

/** Доменные ошибки показываем игроку, всё остальное — падает наверх. */
function toState(error: unknown): ActionState {
  if (
    error instanceof MatchLifecycleError ||
    error instanceof MatchResultError ||
    error instanceof InvalidScoreError
  ) {
    return { error: error.message };
  }
  throw error;
}

async function currentUserId(): Promise<string> {
  const user = await loadCurrentUser();
  if (!user) redirect('/login');
  return user.id;
}

export async function apply(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const matchId = String(formData.get('matchId'));

  try {
    const result = await applyToMatch(prisma, {
      matchId,
      userId: await currentUserId(),
      now: new Date(),
    });
    revalidatePath(`/matches/${matchId}`);
  revalidateFeedsAndNotifications();

    return {
      notice: result.levelOutOfRange
        ? 'Отклик отправлен. Ваш уровень вне желаемого диапазона — создатель это увидит.'
        : 'Отклик отправлен',
    };
  } catch (error: unknown) {
    return toState(error);
  }
}

export async function accept(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const matchId = String(formData.get('matchId'));

  try {
    await acceptApplication(prisma, {
      applicationId: String(formData.get('applicationId')),
      creatorId: await currentUserId(),
      now: new Date(),
    });
    revalidatePath(`/matches/${matchId}`);
  revalidateFeedsAndNotifications();
    return {};
  } catch (error: unknown) {
    return toState(error);
  }
}

export async function reject(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const matchId = String(formData.get('matchId'));

  try {
    await rejectApplication(prisma, {
      applicationId: String(formData.get('applicationId')),
      creatorId: await currentUserId(),
    });
    revalidatePath(`/matches/${matchId}`);
  revalidateFeedsAndNotifications();
    return {};
  } catch (error: unknown) {
    return toState(error);
  }
}

export async function leave(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const matchId = String(formData.get('matchId'));

  try {
    await leaveMatch(prisma, { matchId, userId: await currentUserId(), now: new Date() });
  } catch (error: unknown) {
    return toState(error);
  }

  redirect('/home');
}

export async function cancel(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const matchId = String(formData.get('matchId'));

  try {
    await cancelMatch(prisma, { matchId, creatorId: await currentUserId() });
  } catch (error: unknown) {
    return toState(error);
  }

  redirect('/home');
}

export async function submitScore(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const matchId = String(formData.get('matchId'));

  try {
    const sets = [1, 2, 3]
      .map((index) => ({
        a: formData.get(`set${index}a`),
        b: formData.get(`set${index}b`),
      }))
      .filter((set) => set.a !== null && set.a !== '' && set.b !== null && set.b !== '')
      .map((set) => ({ a: Number(set.a), b: Number(set.b) }));

    const teams = formData
      .getAll('team')
      .map(String)
      .map((entry) => {
        const [userId, team] = entry.split(':');
        return { userId: userId!, team: Number(team) as 1 | 2 };
      });

    await enterMatchResult(prisma, {
      matchId,
      enteredById: await currentUserId(),
      sets,
      teams,
      now: new Date(),
    });

    revalidatePath(`/matches/${matchId}`);
  revalidateFeedsAndNotifications();
    return { notice: 'Счёт записан. Соперники подтвердят результат — после этого изменится рейтинг.' };
  } catch (error: unknown) {
    return toState(error);
  }
}

export async function confirmScore(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const matchId = String(formData.get('matchId'));

  try {
    const applied = await confirmMatchResult(prisma, {
      matchId,
      userId: await currentUserId(),
      now: new Date(),
    });
    revalidatePath(`/matches/${matchId}`);
  revalidateFeedsAndNotifications();

    return {
      notice: applied.applied ? 'Результат подтверждён, рейтинг обновлён' : 'Результат подтверждён',
    };
  } catch (error: unknown) {
    return toState(error);
  }
}

export async function disputeScore(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const matchId = String(formData.get('matchId'));

  try {
    await disputeMatchResult(prisma, {
      matchId,
      userId: await currentUserId(),
      now: new Date(),
    });
    revalidatePath(`/matches/${matchId}`);
  revalidateFeedsAndNotifications();
    return { notice: 'Результат оспорен. Рейтинг не изменится до ручного разбора.' };
  } catch (error: unknown) {
    return toState(error);
  }
}
