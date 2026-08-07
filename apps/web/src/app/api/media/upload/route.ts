import { NextResponse } from 'next/server';

import { loadCurrentUser } from '@/lib/currentUser';
import { UploadError, mediaStorage } from '@/lib/storage';

/**
 * Загрузка файла. Отдельный route handler, а не серверный экшен: экшены
 * сериализуют аргументы через RSC-протокол, и гонять через него бинарные
 * данные на десятки мегабайт — не то, для чего он сделан.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await loadCurrentUser();
  if (!user) return NextResponse.json({ error: 'Нужно войти' }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Файл не передан' }, { status: 400 });
    }

    const stored = await mediaStorage().put(file);
    return NextResponse.json({ url: stored.url, type: file.type.startsWith('video/') ? 'video' : 'image' });
  } catch (error: unknown) {
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
