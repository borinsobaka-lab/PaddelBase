import { listCourts } from '@paddelbase/core';
import { prisma } from '@paddelbase/db';
import { toNumber } from '@paddelbase/db';

import { requireOnboardedUser } from '@/lib/currentUser';

import { CreateMatchForm } from './CreateMatchForm';

export default async function NewMatchPage() {
  const user = await requireOnboardedUser();
  const courts = await listCourts(prisma);

  // Кандидатов в состав отдаём сразу списком: игроков на этапе тестирования
  // немного, а поиск с автодополнением — отдельная работа, которая сейчас
  // ничего не добавит.
  const players = await prisma.user.findMany({
    where: { id: { not: user.id }, onboardingCompletedAt: { not: null } },
    orderBy: { firstName: 'asc' },
    take: 100,
  });

  return (
    <CreateMatchForm
      courts={courts.map((court) => ({ id: court.id, name: court.name, city: court.city }))}
      players={players.map((player) => ({
        id: player.id,
        name: [player.firstName, player.lastName].filter(Boolean).join(' '),
        level: toNumber(player.level),
      }))}
      myLevel={toNumber(user.level)}
    />
  );
}
