'use server';

import { MatchLifecycleError, createMatch } from '@paddelbase/core';
import { prisma } from '@paddelbase/db';
import { redirect } from 'next/navigation';

import { loadCurrentUser } from '@/lib/currentUser';

export interface CreateMatchState {
  error?: string;
}

export async function createMatchAction(
  _previous: CreateMatchState,
  formData: FormData,
): Promise<CreateMatchState> {
  const user = await loadCurrentUser();
  if (!user) redirect('/login');

  let matchId: string;

  try {
    const date = String(formData.get('date') ?? '');
    const time = String(formData.get('time') ?? '');
    if (!date || !time) return { error: 'Укажите дату и время начала' };

    matchId = await createMatch(prisma, {
      creatorId: user.id,
      courtId: String(formData.get('courtId') ?? ''),
      startsAt: tbilisiLocalToUtc(date, time),
      durationMin: Number(formData.get('durationMin')),
      isRated: formData.get('isRated') === 'rated',
      slotsMissing: Number(formData.get('slotsMissing')),
      invitedUserIds: formData.getAll('invited').map(String).filter(Boolean),
      courtBooked: formData.get('courtBooked') === 'on',
      ...parseLevelRange(formData),
      ...(String(formData.get('comment') ?? '').trim() === ''
        ? {}
        : { comment: String(formData.get('comment')).trim() }),
      now: new Date(),
    });
  } catch (error: unknown) {
    if (error instanceof MatchLifecycleError) return { error: error.message };
    throw error;
  }

  redirect(`/matches/${matchId}`);
}

function parseLevelRange(formData: FormData): { levelMin?: number; levelMax?: number } {
  const min = formData.get('levelMin');
  const max = formData.get('levelMax');
  if (!min || !max) return {};
  return { levelMin: Number(min), levelMax: Number(max) };
}

/**
 * Форма отдаёт локальные дату и время. Хранение — в UTC, отображение — в
 * Asia/Tbilisi (ТЗ §2), поэтому пересчёт делается здесь фиксированным сдвигом:
 * в Грузии UTC+4 круглый год, без перехода на летнее время.
 */
const TBILISI_OFFSET_HOURS = 4;

function tbilisiLocalToUtc(date: string, time: string): Date {
  const parsed = new Date(`${date}T${time}:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new MatchLifecycleError('Не удалось разобрать дату и время');
  }
  return new Date(parsed.getTime() - TBILISI_OFFSET_HOURS * 60 * 60 * 1000);
}
