import { AppShell } from '@/components/AppShell';
import { PageTitle } from '@/components/ui';
import { requireOnboardedUser } from '@/lib/currentUser';

export default async function CommunityPage() {
  await requireOnboardedUser();

  return (
    <AppShell>
      <main>
        <PageTitle subtitle="Лента постов подключается следующим шагом — доменная часть уже готова">
          Комьюнити
        </PageTitle>
      </main>
    </AppShell>
  );
}
