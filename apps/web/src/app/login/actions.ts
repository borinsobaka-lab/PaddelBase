'use server';

import { signInByName, OnboardingError } from '@paddelbase/core';
import { prisma } from '@paddelbase/db';
import { redirect } from 'next/navigation';

import { createSession } from '@/lib/session';

export interface LoginState {
  error?: string;
}

export async function signIn(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const name = String(formData.get('name') ?? '');

  let destination: string;

  try {
    const result = await signInByName(prisma, { name });
    await createSession(result.userId);
    destination = result.needsOnboarding ? '/onboarding' : '/home';
  } catch (error: unknown) {
    if (error instanceof OnboardingError) return { error: error.message };
    throw error;
  }

  // redirect бросает исключение, поэтому вызывается вне try: иначе его
  // перехватил бы наш же catch и вход бы молча ничего не делал.
  redirect(destination);
}
