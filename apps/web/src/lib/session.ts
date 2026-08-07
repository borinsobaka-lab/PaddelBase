import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Сессия на подписанной куке.
 *
 * ВРЕМЕННОЕ РЕШЕНИЕ на время тестирования: вход делается по одному имени и
 * никого не аутентифицирует. Подпись здесь нужна ровно для одного — чтобы
 * идентификатор в куке нельзя было подменить руками в devtools; она не делает
 * вход безопасным и не заменяет настоящую авторизацию.
 *
 * Весь доступ к текущему пользователю идёт через этот модуль, поэтому переход
 * на Telegram, Google или что-то ещё меняет только его.
 */
const COOKIE_NAME = 'pb_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (value && value.length >= 16) return value;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET обязателен в продакшене: минимум 16 символов');
  }
  return 'dev-only-insecure-session-secret';
}

function sign(userId: string): string {
  return createHmac('sha256', secret()).update(userId).digest('base64url');
}

function verify(userId: string, signature: string): boolean {
  const expected = Buffer.from(sign(userId));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, `${userId}.${sign(userId)}`, {
    httpOnly: true,
    // SameSite=lax достаточно, пока приложение открывается напрямую. Для
    // Telegram Mini App понадобится None + Secure: во встроенном webview
    // кука с lax не долетает, и получается вечный разлогин.
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function readSession(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const separator = raw.lastIndexOf('.');
  if (separator <= 0) return null;

  const userId = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);

  return verify(userId, signature) ? userId : null;
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}
