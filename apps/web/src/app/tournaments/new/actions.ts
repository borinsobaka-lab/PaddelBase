'use server';

import { TournamentError, createTournament } from '@paddelbase/core';
import { prisma } from '@paddelbase/db';
import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';

import { loadCurrentUser } from '@/lib/currentUser';
import { tbilisiLocalToUtc } from '@/lib/time';

export interface CreateTournamentState {
  error?: string;
}

export async function createTournamentAction(
  _previous: CreateTournamentState,
  formData: FormData,
): Promise<CreateTournamentState> {
  const user = await loadCurrentUser();
  if (!user) redirect('/login');

  let tournamentId: string;

  try {
    const date = String(formData.get('date') ?? '');
    const time = String(formData.get('time') ?? '');
    if (!date || !time) return { error: 'Укажите дату и время начала' };

    const format = String(formData.get('format')) as
      | 'AMERICANO'
      | 'MEXICANO'
      | 'TEAM_AMERICANO'
      | 'TEAM_MEXICANO';

    tournamentId = await createTournament(prisma, {
      organizerId: user.id,
      courtId: String(formData.get('courtId') ?? ''),
      format,
      isRated: formData.get('isRated') === 'rated',
      startsAt: tbilisiLocalToUtc(date, time),
      durationMin: Number(formData.get('durationMin')),
      courtsCount: Number(formData.get('courtsCount')),
      maxParticipants: Number(formData.get('maxParticipants')),
      pointsPerRound: Number(formData.get('pointsPerRound')),
      roundsCount: Number(formData.get('roundsCount')),
      restCompensation: Number(formData.get('restCompensation')),
      ...(formData.get('feeAmount') ? { feeAmount: Number(formData.get('feeAmount')) } : {}),
      ...(String(formData.get('description') ?? '').trim() === ''
        ? {}
        : { description: String(formData.get('description')).trim() }),
      // Seed фиксируется при создании и больше не меняется: от него зависит
      // вся сетка, и пересоздание seed'а перетасовало бы уже сыгранный турнир.
      seed: randomUUID(),
      now: new Date(),
    });
  } catch (error: unknown) {
    if (error instanceof TournamentError) return { error: error.message };
    throw error;
  }

  redirect(`/tournaments/${tournamentId}`);
}
