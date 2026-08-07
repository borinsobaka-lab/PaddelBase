'use client';

import type { MediaItem } from '@paddelbase/core';
import Link from 'next/link';
import { useActionState, useRef, useState } from 'react';

import { Button, Card, ErrorNote, PageTitle } from '@/components/ui';

import { publish, type CommunityActionState } from '../actions';

const MAX_TEXT = 2000;
const MAX_IMAGES = 10;
const MAX_VIDEOS = 2;

/** Длинная сторона, до которой ужимаются фото перед отправкой (ТЗ §5.5). */
const MAX_IMAGE_SIDE = 1600;
const JPEG_QUALITY = 0.82;

/**
 * Сжатие на клиенте.
 *
 * Снимок с телефона — это 3–6 МБ, и грузить их полным размером значит тратить
 * мобильный трафик игрока и место в хранилище ради картинки, которая всё равно
 * показывается в ленте шириной 390 px.
 */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));

  if (scale === 1 && file.size < 1_000_000) return file;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext('2d');
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  bitmap.close();

  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
}

interface Attachment extends MediaItem {
  localId: string;
}

export function PostComposer() {
  const [state, formAction, pending] = useActionState<CommunityActionState, FormData>(publish, {});
  const [text, setText] = useState('');
  const [media, setMedia] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const images = media.filter((item) => item.type === 'image').length;
  const videos = media.filter((item) => item.type === 'video').length;
  const empty = text.trim().length === 0 && media.length === 0;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    setUploadError(null);
    setUploading(true);

    try {
      for (const original of Array.from(files)) {
        const isVideo = original.type.startsWith('video/');

        if (isVideo && videos + 1 > MAX_VIDEOS) {
          throw new Error(`Не больше ${MAX_VIDEOS} видео в посте`);
        }
        if (!isVideo && images + 1 > MAX_IMAGES) {
          throw new Error(`Не больше ${MAX_IMAGES} фото в посте`);
        }

        const prepared = await compressImage(original);
        const body = new FormData();
        body.append('file', prepared);

        const response = await fetch('/api/media/upload', { method: 'POST', body });
        const payload = (await response.json()) as { url?: string; type?: string; error?: string };

        if (!response.ok || !payload.url) {
          throw new Error(payload.error ?? 'Не удалось загрузить файл');
        }

        setMedia((previous) => [
          ...previous,
          {
            localId: `${Date.now()}-${previous.length}`,
            type: payload.type === 'video' ? 'video' : 'image',
            url: payload.url!,
          },
        ]);
      }
    } catch (error: unknown) {
      setUploadError(error instanceof Error ? error.message : 'Не удалось загрузить файл');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <main className="pb-24">
      <div className="flex items-center gap-3 pt-6">
        <Link href="/community" className="text-sm text-muted">
          ← Назад
        </Link>
      </div>

      <PageTitle>Новый пост</PageTitle>

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="media" value={JSON.stringify(media.map(({ localId, ...rest }) => rest))} />

        <Card className="flex flex-col gap-3">
          <textarea
            name="text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={6}
            maxLength={MAX_TEXT}
            placeholder="Ищем четвёртого в субботу, играем в Ваке…"
            className="w-full resize-none bg-transparent text-base outline-none placeholder:text-muted"
          />
          <p className="text-right text-xs text-muted">
            {text.length} / {MAX_TEXT}
          </p>
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Вложения</span>
            <span className="text-xs text-muted">
              {images} из {MAX_IMAGES} фото · {videos} из {MAX_VIDEOS} видео
            </span>
          </div>

          {media.length > 0 ? (
            <ul className="grid grid-cols-3 gap-2">
              {media.map((item) => (
                <li key={item.localId} className="relative">
                  {item.type === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.url}
                      alt=""
                      className="aspect-square w-full rounded-control object-cover"
                    />
                  ) : (
                    <video src={item.url} className="aspect-square w-full rounded-control object-cover" />
                  )}
                  <button
                    type="button"
                    aria-label="Убрать вложение"
                    onClick={() =>
                      setMedia((previous) => previous.filter((entry) => entry.localId !== item.localId))
                    }
                    className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-text/70 text-sm text-surface"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
            multiple
            onChange={(event) => void handleFiles(event.target.files)}
            className="text-sm file:mr-3 file:min-h-11 file:rounded-control file:border file:border-border-strong file:bg-surface file:px-4 file:text-sm"
          />

          {uploading ? <p className="text-sm text-muted">Загружаем…</p> : null}
          {uploadError ? <ErrorNote>{uploadError}</ErrorNote> : null}

          <p className="text-xs text-muted">
            Фото ужимаются до 1600 px перед отправкой. Видео — до 100 МБ и двух минут. Фото и видео
            в одном посте смешивать нельзя.
          </p>
        </Card>

        {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}

        <div className="sticky bottom-0 -mx-4 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur">
          <Button
            type="submit"
            variant={empty ? 'ghost' : 'primary'}
            disabled={pending || uploading || empty}
          >
            {pending ? 'Публикуем…' : 'Опубликовать'}
          </Button>
        </div>
      </form>
    </main>
  );
}
