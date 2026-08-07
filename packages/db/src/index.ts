import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

/**
 * Единственный экземпляр клиента на процесс.
 *
 * В dev-режиме Next.js перезагружает модули при каждом изменении, и без этого
 * кеша на globalThis за сессию разработки накапливаются десятки соединений —
 * а лимит пулера Supabase небольшой.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
export * from './decimal.js';
export * from './json.js';
