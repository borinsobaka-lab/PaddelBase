'use client';

import { useActionState } from 'react';

import { Button, Card, ErrorNote, InfoNote, SectionHeader, Textarea, TextInput } from '@/components/ui';
import { formatDateTime } from '@/lib/format';

import { comment, moderate, report, type CommunityActionState } from '../actions';

function Notice({ state }: { state: CommunityActionState }) {
  if (state.error) return <ErrorNote>{state.error}</ErrorNote>;
  if (state.notice) return <InfoNote>{state.notice}</InfoNote>;
  return null;
}

export function CommentsPanel({
  postId,
  comments,
}: {
  postId: string;
  comments: { id: string; authorName: string; text: string; createdAt: Date }[];
}) {
  const [state, formAction, pending] = useActionState<CommunityActionState, FormData>(comment, {});

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader>
        Комментарии{comments.length > 0 ? ` · ${comments.length}` : ''}
      </SectionHeader>

      {comments.length > 0 ? (
        <Card>
          <ul className="flex flex-col">
            {comments.map((item) => (
              <li key={item.id} className="border-b border-border py-3 first:pt-0 last:border-0 last:pb-0">
                <p className="flex items-baseline gap-2 text-body">
                  <span className="font-semibold">{item.authorName}</span>
                  <span className="text-small text-muted">{formatDateTime(item.createdAt)}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-body leading-relaxed">{item.text}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <p className="text-small text-muted">Пока тихо. Ответьте первым.</p>
      )}

      <Notice state={state} />

      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="postId" value={postId} />
        <Textarea name="text" rows={3} maxLength={1000} required placeholder="Написать комментарий" />
        <Button type="submit" disabled={pending}>
          {pending ? 'Отправляем…' : 'Отправить'}
        </Button>
      </form>
    </section>
  );
}

export function ReportPanel({ postId }: { postId: string }) {
  const [state, formAction, pending] = useActionState<CommunityActionState, FormData>(report, {});

  if (state.notice) return <InfoNote>{state.notice}</InfoNote>;

  return (
    <details className="pt-2">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center text-small text-muted [&::-webkit-details-marker]:hidden">
        Пожаловаться на пост
      </summary>

      <form action={formAction} className="mt-2 flex flex-col gap-2">
        <input type="hidden" name="postId" value={postId} />
        <TextInput type="text" name="reason" maxLength={200} placeholder="Что не так с постом" />
        <Notice state={state} />
        <Button type="submit" variant="ghost" disabled={pending}>
          {pending ? 'Отправляем…' : 'Отправить жалобу'}
        </Button>
      </form>
    </details>
  );
}

export function ModerationPanel({
  postId,
  isPinned,
  isHidden,
}: {
  postId: string;
  isPinned: boolean;
  isHidden: boolean;
}) {
  const [state, formAction, pending] = useActionState<CommunityActionState, FormData>(moderate, {});

  return (
    <Card tone="warn" className="flex flex-col gap-3">
      <p className="label">Модерация</p>
      <Notice state={state} />

      <div className="grid grid-cols-2 gap-2">
        <form action={formAction}>
          <input type="hidden" name="postId" value={postId} />
          <input type="hidden" name="action" value="pin" />
          <input type="hidden" name="value" value={isPinned ? 'off' : 'on'} />
          <Button type="submit" variant="ghost" disabled={pending}>
            {isPinned ? 'Открепить' : 'Закрепить'}
          </Button>
        </form>

        <form action={formAction}>
          <input type="hidden" name="postId" value={postId} />
          <input type="hidden" name="action" value="hide" />
          <input type="hidden" name="value" value={isHidden ? 'off' : 'on'} />
          <Button type="submit" variant="ghost" disabled={pending}>
            {isHidden ? 'Показать' : 'Скрыть'}
          </Button>
        </form>
      </div>

      {isHidden ? (
        <p className="text-small text-warn">Пост скрыт: его видите только вы как администратор.</p>
      ) : null}
    </Card>
  );
}
