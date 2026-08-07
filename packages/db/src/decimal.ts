import { Prisma } from '@prisma/client';

/**
 * Граница между БД и чистой логикой.
 *
 * Пакеты `rating` и `tournament` работают с обычными числами и ничего не знают
 * о Prisma — это условие их тестируемости. Конвертация живёт здесь, в одном
 * месте, чтобы `.toNumber()` не расползался по всему коду приложения.
 */
export function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : value.toNumber();
}

/** Уровень и надёжность хранятся как decimal(4,3): округляем на входе в БД. */
export function toLevelDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(3));
}

/** Дельта рейтинга хранится как decimal(5,4). */
export function toDeltaDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(4));
}
