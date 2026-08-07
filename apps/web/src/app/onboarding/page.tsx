import { redirect } from 'next/navigation';

import { loadCurrentUser } from '@/lib/currentUser';

import { OnboardingForm } from './OnboardingForm';

export default async function OnboardingPage() {
  const user = await loadCurrentUser();
  if (!user) redirect('/login');
  if (user.onboardingCompletedAt !== null) redirect('/profile');

  return <OnboardingForm />;
}
