import { listCourts } from '@paddelbase/core';
import { prisma } from '@paddelbase/db';

import { requireOnboardedUser } from '@/lib/currentUser';

import { CreateTournamentForm } from './CreateTournamentForm';

export default async function NewTournamentPage() {
  await requireOnboardedUser();
  const courts = await listCourts(prisma);

  return (
    <CreateTournamentForm
      courts={courts.map((court) => ({ id: court.id, name: court.name, city: court.city }))}
    />
  );
}
