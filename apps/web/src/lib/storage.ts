import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Хранилище медиа.
 *
 * Два адаптера за одним интерфейсом. В продакшене — Supabase Storage; локально,
 * пока проект Supabase не заведён, файлы кладутся на диск. Это не заглушка
 * «на потом»: разработка и тесты не должны требовать облачных ключей, а
 * переключение делается одной переменной окружения.
 *
 * Ограничения ТЗ §5.5 (10 фото либо 2 видео, 100 МБ, 2 минуты) проверяются
 * доменным слоем при создании поста; здесь — только размер файла, чтобы
 * не принимать заведомо неподъёмное.
 */

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
]);

export class UploadError extends Error {}

export interface StoredFile {
  url: string;
  key: string;
}

export interface MediaStorage {
  readonly kind: 'supabase' | 'local';
  put(file: File): Promise<StoredFile>;
}

function extensionFor(file: File): string {
  const fromName = path.extname(file.name).toLowerCase();
  if (fromName.length > 1 && fromName.length <= 6) return fromName;

  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
  };
  return map[file.type] ?? '.bin';
}

function assertAcceptable(file: File): void {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new UploadError(`Формат ${file.type || 'неизвестен'} не поддерживается`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError('Файл больше 100 МБ');
  }
  if (file.size === 0) {
    throw new UploadError('Файл пустой');
  }
}

/**
 * Supabase Storage. Загрузка идёт с сервера сервисным ключом: подписанные URL
 * для клиента дали бы прямую запись в бакет, а проверять ограничения ТЗ всё
 * равно нужно на сервере.
 */
class SupabaseStorage implements MediaStorage {
  readonly kind = 'supabase' as const;

  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly bucket: string,
  ) {}

  async put(file: File): Promise<StoredFile> {
    assertAcceptable(file);

    const key = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}${extensionFor(file)}`;
    const endpoint = `${this.url}/storage/v1/object/${this.bucket}/${key}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.serviceKey}`,
        'Content-Type': file.type,
        'x-upsert': 'false',
      },
      body: await file.arrayBuffer(),
    });

    if (!response.ok) {
      throw new UploadError(
        `Не удалось загрузить файл: ${response.status} ${await response.text().catch(() => '')}`,
      );
    }

    return { key, url: `${this.url}/storage/v1/object/public/${this.bucket}/${key}` };
  }
}

/** Локальный диск для разработки. Отдаётся через /api/media/<key>. */
class LocalStorage implements MediaStorage {
  readonly kind = 'local' as const;

  constructor(private readonly root: string) {}

  async put(file: File): Promise<StoredFile> {
    assertAcceptable(file);

    const bytes = Buffer.from(await file.arrayBuffer());
    // Имя от содержимого: повторная загрузка того же файла не плодит копии.
    const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 32);
    const key = `${digest}${extensionFor(file)}`;

    await mkdir(this.root, { recursive: true });
    await writeFile(path.join(this.root, key), bytes);

    return { key, url: `/api/media/${key}` };
  }
}

export const LOCAL_MEDIA_ROOT = path.join(process.cwd(), '.uploads');

export function mediaStorage(): MediaStorage {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'media';

  if (url && serviceKey) return new SupabaseStorage(url, serviceKey, bucket);

  // Продакшен-сборку без настроенного хранилища роняем намеренно: молча
  // писать на диск контейнера значит потерять все загруженные файлы при первом
  // же перезапуске, и заметит это не разработчик, а игрок. Явный опт-ин нужен
  // для локального прогона production-сборки.
  const localAllowed =
    process.env.NODE_ENV !== 'production' || process.env.MEDIA_STORAGE === 'local';

  if (!localAllowed) {
    throw new Error(
      'SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY обязательны: локальный диск в контейнере не переживёт перезапуск. Для локального прогона задайте MEDIA_STORAGE=local',
    );
  }

  return new LocalStorage(LOCAL_MEDIA_ROOT);
}

/** Чтение локального файла: только для дев-адаптера. */
export async function readLocalMedia(key: string): Promise<Buffer> {
  // Ключ приходит из URL, поэтому путь нормализуется и проверяется: без этого
  // «../../» вычитал бы что угодно с диска.
  const safe = path.basename(key);
  if (safe !== key) throw new UploadError('Некорректный путь');

  return readFile(path.join(LOCAL_MEDIA_ROOT, safe));
}
