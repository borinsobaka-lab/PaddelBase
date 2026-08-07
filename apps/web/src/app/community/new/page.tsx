import { requireOnboardedUser } from '@/lib/currentUser';

import { PostComposer } from './PostComposer';

export default async function NewPostPage() {
  await requireOnboardedUser();
  return <PostComposer />;
}
