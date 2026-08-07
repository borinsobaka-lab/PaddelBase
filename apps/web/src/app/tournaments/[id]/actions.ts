'use server';

import {
  TournamentError,
  closeRound,
  enterRoundScore,
  finishTournament,
  joinTournament,
  leaveTournament,
  registerTeam,
  startTournament,
} from '@paddelbase/core';
import { prisma } from '@paddelbase/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { loadCurrentUser } from '@/lib/currentUser';

export interface TournamentActionState {
  error?: string;
  notice?: string;
}

function toState(error: unknown): TournamentActionState {
  if (error instanceof TournamentError) return { error: error.message };
  throw error;
}

async function currentUserId(): Promise<string> {
  const user = await loadCurrentUser();
  if (!user) redirect('/login');
  return user.id;
}

export async function join(
  _previous: TournamentActionState,
  formData: FormData,
): Promise<TournamentActionState> {
  const tournamentId = String(formData.get('tournamentId'));

  try {
    await joinTournament(prisma, { tournamentId, userId: await currentUserId() });
    revalidatePath(`/tournaments/${tournamentId}`);
    return { notice: 'Вы записаны' };
  } catch (error: unknown) {
    return toState(error);
  }
}

export async function leaveAction(
  _previous: TournamentActionState,
  formData: FormData,
): Promise<TournamentActionState> {
  const tournamentId = String(formData.get('tournamentId'));

  try {
    await leaveTournament(prisma, { tournamentId, userId: await currentUserId() });
    revalidatePath(`/tournaments/${tournamentId}`);
    return { notice: 'Вы снялись с турнира' };
  } catch (error: unknown) {
    return toState(error);
  }
}

export async function registerTeamAction(
  _previous: TournamentActionState,
  formData: FormData,
): Promise<TournamentActionState> {
  const tournamentId = String(formData.get('tournamentId'));

  try {
    await registerTeam(prisma, {
      tournamentId,
      captainId: await currentUserId(),
      partnerId: String(formData.get('partnerId')),
      ...(String(formData.get('teamName') ?? '').trim() === ''
        ? {}
        : { name: String(formData.get('teamName')).trim() }),
    });
    revalidatePath(`/tournaments/${tournamentId}`);
    return { notice: 'Команда заявлена' };
  } catch (error: unknown) {
    return toState(error);
  }
}

export async function start(
  _previous: TournamentActionState,
  formData: FormData,
): Promise<TournamentActionState> {
  const tournamentId = String(formData.get('tournamentId'));

  try {
    await startTournament(prisma, {
      tournamentId,
      organizerId: await currentUserId(),
      now: new Date(),
    });
    revalidatePath(`/tournaments/${tournamentId}`);
    return { notice: 'Турнир начался, сетка первого раунда готова' };
  } catch (error: unknown) {
    return toState(error);
  }
}

export async function saveScore(
  _previous: TournamentActionState,
  formData: FormData,
): Promise<TournamentActionState> {
  const tournamentId = String(formData.get('tournamentId'));

  try {
    await enterRoundScore(prisma, {
      tournamentMatchId: String(formData.get('matchId')),
      organizerId: await currentUserId(),
      scoreA: Number(formData.get('scoreA')),
      scoreB: Number(formData.get('scoreB')),
    });
    revalidatePath(`/tournaments/${tournamentId}`);
    return {};
  } catch (error: unknown) {
    return toState(error);
  }
}

export async function closeRoundAction(
  _previous: TournamentActionState,
  formData: FormData,
): Promise<TournamentActionState> {
  const tournamentId = String(formData.get('tournamentId'));

  try {
    const result = await closeRound(prisma, {
      tournamentId,
      roundNumber: Number(formData.get('roundNumber')),
      organizerId: await currentUserId(),
      now: new Date(),
    });
    revalidatePath(`/tournaments/${tournamentId}`);

    return {
      notice:
        result.nextRoundNumber === null
          ? 'Все раунды сыграны — можно завершать турнир'
          : `Раунд закрыт, сетка ${result.nextRoundNumber}-го готова`,
    };
  } catch (error: unknown) {
    return toState(error);
  }
}

export async function finish(
  _previous: TournamentActionState,
  formData: FormData,
): Promise<TournamentActionState> {
  const tournamentId = String(formData.get('tournamentId'));

  try {
    const result = await finishTournament(prisma, {
      tournamentId,
      organizerId: await currentUserId(),
      now: new Date(),
    });
    revalidatePath(`/tournaments/${tournamentId}`);

    return {
      notice: result.ratingApplied
        ? 'Турнир завершён, рейтинг участников обновлён'
        : 'Турнир завершён',
    };
  } catch (error: unknown) {
    return toState(error);
  }
}
