'use client';

import type { FeedPost } from '@paddelbase/core';
import Link from 'next/link';
import { useActionState } from 'react';

import { Badge } from '@/components/Badges';
import { formatDateTime } from '@/lib/format';

import { like, type CommunityActionState } from '@/app/community/actions';

export function PostCard({ post, href }: { post: FeedPost; href?: string }) {
  const [, likeAction, liking] = useActionState<CommunityActionState, FormData>(like, {});
  const body = (
    <>
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sunken text-body font-semibold text-text-secondary">
          {post.authorName[0]?.toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body font-semibold">
            {post.authorName}
            {post.authorRole !== 'PLAYER' ? <Badge tone="accent">организатор</Badge> : null}
            {post.isPinned ? <Badge>закреплено</Badge> : null}
          </p>
          <p className="text-small text-muted">{formatDateTime(post.createdAt)}</p>
        </div>
      </div>

      {post.text ? (
        <p className="mt-3 whitespace-pre-wrap text-body leading-relaxed">{post.text}</p>
      ) : null}

      {post.media.length > 0 ? (
        <ul className={`mt-3 grid gap-2 ${post.media.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {post.media.slice(0, 4).map((item, index) => (
            <li key={item.url} className="relative">
              {item.type === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.url}
                  alt=""
                  loading="lazy"
                  className={`w-full rounded-control object-cover ${
                    post.media.length === 1 ? 'max-h-80' : 'aspect-square'
                  }`}
                />
              ) : (
                <video src={item.url} controls className="w-full rounded-control" />
              )}
              {index === 3 && post.media.length > 4 ? (
                <span className="absolute inset-0 flex items-center justify-center rounded-control bg-text/50 text-title font-medium text-surface">
                  +{post.media.length - 4}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );

  return (
    <article className="rounded-card bg-surface p-4">
      {href ? (
        <Link href={href} className="block">
          {body}
        </Link>
      ) : (
        body
      )}

      <div className="-mb-1.5 mt-2 flex items-center gap-1 border-t border-border pt-1 text-body">
        <form action={likeAction}>
          <input type="hidden" name="postId" value={post.id} />
          <button
            type="submit"
            disabled={liking}
            aria-pressed={post.likedByMe}
            aria-label={`Нравится, отметок: ${post.likes}`}
            className={`pressable figure flex min-h-11 items-center gap-1.5 rounded-control px-2 font-medium ${
              post.likedByMe ? 'text-accent' : 'text-muted'
            }`}
          >
            <HeartIcon filled={post.likedByMe} />
            {post.likes}
          </button>
        </form>

        <Link
          href={href ?? `/community/${post.id}`}
          aria-label={`Комментарии: ${post.comments}`}
          className="pressable figure flex min-h-11 items-center gap-1.5 rounded-control px-2 font-medium text-muted"
        >
          <CommentIcon />
          {post.comments}
        </Link>
      </div>
    </article>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 20s-7-4.6-7-9.3A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7 2.7C19 15.4 12 20 12 20z" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 5h16v11H8l-4 4z" />
    </svg>
  );
}
