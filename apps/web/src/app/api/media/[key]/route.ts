import { NextResponse } from 'next/server';

import { readLocalMedia } from '@/lib/storage';

/** Отдача файлов локального дев-хранилища. В продакшене файлы отдаёт Supabase. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const { key } = await params;

  try {
    const bytes = await readLocalMedia(key);
    const extension = key.split('.').pop()?.toLowerCase() ?? '';
    const types: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      mp4: 'video/mp4',
      mov: 'video/quicktime',
    };

    // Buffer → Uint8Array: типы Response не принимают Node-овский Buffer напрямую.
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': types[extension] ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Файл не найден' }, { status: 404 });
  }
}
