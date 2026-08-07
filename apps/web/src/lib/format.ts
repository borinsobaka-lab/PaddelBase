/**
 * Форматирование дат и подписей.
 *
 * Все даты хранятся в UTC и показываются в Asia/Tbilisi (ТЗ §2). Часовой пояс
 * задан явной константой, а не берётся из браузера: игрок, открывший приложение
 * в поездке, должен видеть время корта, а не своё местное.
 */
export const APP_TIMEZONE = 'Asia/Tbilisi';

const dayFormat = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  timeZone: APP_TIMEZONE,
});

const timeFormat = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: APP_TIMEZONE,
});

export function formatDay(date: Date): string {
  return dayFormat.format(date);
}

export function formatTime(date: Date): string {
  return timeFormat.format(date);
}

export function formatDateTime(date: Date): string {
  return `${formatDay(date)}, ${formatTime(date)}`;
}

export function formatDuration(minutes: number): string {
  if (minutes % 60 === 0) return `${minutes / 60} ч`;
  return `${(minutes / 60).toFixed(1).replace('.', ',')} ч`;
}

export function formatSlots(missing: number): string {
  if (missing === 0) return 'состав собран';
  return `не хватает ${missing} ${plural(missing, 'игрока', 'игроков', 'игроков')}`;
}

export const TOURNAMENT_FORMAT_NAMES: Record<string, string> = {
  AMERICANO: 'Американо',
  MEXICANO: 'Мексикано',
  TEAM_AMERICANO: 'Командный Американо',
  TEAM_MEXICANO: 'Командный Мексикано',
};

export const MATCH_STATUS_NAMES: Record<string, string> = {
  OPEN: 'Набор игроков',
  FILLED: 'Состав собран',
  PLAYED: 'Ждём счёт',
  COMPLETED: 'Завершён',
  DISPUTED: 'Результат оспорен',
  CANCELLED: 'Отменён',
  EXPIRED: 'Не состоялся',
};

/**
 * Согласование существительного с числом. Русский требует трёх форм, и
 * «1 рейтинговых матчей» в интерфейсе выглядит как недоделка.
 */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function ratedMatchesLabel(count: number): string {
  return `${count} ${plural(count, 'рейтинговый матч', 'рейтинговых матча', 'рейтинговых матчей')}`;
}
