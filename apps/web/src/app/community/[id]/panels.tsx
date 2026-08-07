'use client';

import { useActionState } from 'react';

import { Button, Card, ErrorNote } from '@/components/ui';
import { formatDateTime } from '@/lib/format';

import { comment, moderate, report, type CommunityActionState } from '../actions';

function Notice({ state }: { state: CommunityActionState }) {
  if (state.error) return <ErrorNote>{state.error}</ErrorNote>;
  if (state.notice) {
    return (
      <p className="rounded-control bg-accent-soft px-3 py-2 text-sm text-accent">{state.notice}</p>
    );
  }
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
    <Card className="flex flex-col gap-3">
      <h2 className="font-medium">Комментарии ({comments.length})</h2>

      {comments.length === 0 ? (
        <p className="text-sm text-muted">Пока тихо. Ответьте первым.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((item) => (
            <li key={item.id} className="border-t border-border pt-3 first:border-0 first:pt-0">
              <p className="text-sm font-medium">{item.authorName}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{item.text}</p>
              <p className="mt-1 text-xs text-muted">{formatDateTime(item.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}

      <Notice state={state} />

      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="postId" value={postId} />
        <textarea
          name="text"
          rows={3}
          maxLength={1000}
          required
          placeholder="Написать комментарий"
          className="w-full rounded-control border border-border-strong bg-surface p-3 text-base outline-none focus:border-accent"
        />
        <Button type="submit" disabled={pending}>
          {pending ? 'Отправляем…' : 'Отправить'}
        </Button>
      </form>
    </Card>
  );
}

export function ReportPanel({ postId }: { postId: string }) {
  const [state, formAction, pending] = useActionState<CommunityActionState, FormData>(report, {});

  if (state.notice) {
    return (
      <Card>
        <p className="text-sm text-accent">{state.notice}</p>
      </Card>
    );
  }

  return (
    <Card>
      <details>
        <summary className="cursor-pointer text-sm text-muted">Пожаловаться на пост</summary>

        <form action={formAction} className="mt-3 flex flex-col gap-2">
          <input type="hidden" name="postId" value={postId} />
          <input
            type="text"
            name="reason"
            maxLength={200}
            placeholder="Что не так с постом"
            className="min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-base"
          />
          <Notice state={state} />
          <Button type="submit" variant="ghost" disabled={pending}>
            {pending ? 'Отправляем…' : 'Отправить жалобу'}
          </Button>
        </form>
      </details>
    </Card>
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
    <Card className="flex flex-col gap-3">
      <h2 className="font-medium">Модерация</h2>
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
        <p className="text-xs text-warn">Пост скрыт: его видите только вы как администратор.</p>
      ) : null}
    </Card>
  );
}
