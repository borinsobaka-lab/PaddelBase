/**
 * Формы отдают локальные дату и время, хранение — в UTC (ТЗ §2).
 *
 * Пересчёт делается фиксированным сдвигом: в Грузии UTC+4 круглый год, без
 * перехода на летнее время. Часовой пояс браузера здесь не при чём — игрок
 * может создавать заявку из другой страны, а корт всё равно в Тбилиси.
 */
export const TBILISI_OFFSET_HOURS = 4;

export class TimeParseError extends Error {}

export function tbilisiLocalToUtc(date: string, time: string): Date {
  const parsed = new Date(`${date}T${time}:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new TimeParseError('Не удалось разобрать дату и время');
  }
  return new Date(parsed.getTime() - TBILISI_OFFSET_HOURS * 60 * 60 * 1000);
}
