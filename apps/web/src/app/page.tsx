import { redirect } from 'next/navigation';

import { loadCurrentUser } from '@/lib/currentUser';

export default async function IndexPage() {
  const user = await loadCurrentUser();

  if (!user) redirect('/login');
  if (user.onboardingCompletedAt === null) redirect('/onboarding');
  redirect('/home');
}
