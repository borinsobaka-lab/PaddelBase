'use server';

import { OnboardingError, completeOnboarding } from '@paddelbase/core';
import { prisma } from '@paddelbase/db';
import { redirect } from 'next/navigation';

import { loadCurrentUser } from '@/lib/currentUser';
import { parseAnswers } from '@/lib/questionnaire';

export interface OnboardingFormState {
  error?: string;
}

export async function submitOnboarding(
  _previous: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const user = await loadCurrentUser();
  if (!user) redirect('/login');

  try {
    const answers = parseAnswers(formData);
    await completeOnboarding(prisma, { userId: user.id, answers, now: new Date() });
  } catch (error: unknown) {
    if (error instanceof OnboardingError || error instanceof Error) {
      return { error: error.message };
    }
    throw error;
  }

  redirect('/profile?welcome=1');
}
