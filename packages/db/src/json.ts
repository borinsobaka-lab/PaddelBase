import { Prisma } from '@prisma/client';

/**
 * Prisma требует, чтобы значение для Json-колонки имело индексную сигнатуру,
 * а обычные интерфейсы TypeScript её не имеют — структурно они совместимы,
 * но система типов этого не признаёт. Приведение собрано в одном месте, чтобы
 * `as unknown as` не расползался по коду приложения.
 *
 * Использовать только для сериализуемых объектов: Date, Map, Set и undefined
 * в Json-колонках не переживут round-trip.
 */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
