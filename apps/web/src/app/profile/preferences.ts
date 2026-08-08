import type { CourtSide, DayTime, Hand, MatchPreference } from '@paddelbase/db';

/**
 * Предпочтения в игре — словари для интерфейса.
 *
 * Здесь же живут русские подписи: держать их рядом со значениями надёжнее, чем
 * раскладывать по компонентам, где рано или поздно разойдутся формулировки.
 *
 * Пустое значение везде означает «не указано», а не «всё равно». Разница
 * содержательная: «любая рука» — осознанный ответ, по нему подбор фильтровать
 * можно; «не указано» значит, что игрок вопрос не видел.
 */

export const HANDS: { value: Hand; label: string }[] = [
  { value: 'RIGHT', label: 'Правая' },
  { value: 'LEFT', label: 'Левая' },
  { value: 'BOTH', label: 'Обе' },
];

/**
 * Сторона корта. В падел это устойчивая роль в паре, а не мелочь: игрок слева
 * закрывает бэкхенд-угол и чаще завершает розыгрыш, игрок справа строит его.
 * Пара из двух «правых» играет заметно хуже, чем каждый из них по отдельности,
 * поэтому вопрос стоит наравне с рабочей рукой.
 */
export const COURT_SIDES: { value: CourtSide; label: string }[] = [
  { value: 'LEFT', label: 'Слева' },
  { value: 'RIGHT', label: 'Справа' },
  { value: 'ANY', label: 'Где угодно' },
];

export const MATCH_PREFERENCES: { value: MatchPreference; label: string }[] = [
  { value: 'RATED', label: 'Рейтинговые' },
  { value: 'CASUAL', label: 'Любительские' },
  { value: 'ANY', label: 'И те, и другие' },
];

export const DAY_TIMES: { value: DayTime; label: string }[] = [
  { value: 'MORNING', label: 'Утро' },
  { value: 'AFTERNOON', label: 'День' },
  { value: 'EVENING', label: 'Вечер' },
];

/** 1 — понедельник, 7 — воскресенье: тот же порядок, что и в ISO-неделе. */
export const WEEKDAYS: { value: number; label: string; full: string }[] = [
  { value: 1, label: 'Пн', full: 'Понедельник' },
  { value: 2, label: 'Вт', full: 'Вторник' },
  { value: 3, label: 'Ср', full: 'Среда' },
  { value: 4, label: 'Чт', full: 'Четверг' },
  { value: 5, label: 'Пт', full: 'Пятница' },
  { value: 6, label: 'Сб', full: 'Суббота' },
  { value: 7, label: 'Вс', full: 'Воскресенье' },
];

export interface PlayerPreferences {
  dominantHand: Hand | null;
  courtSide: CourtSide | null;
  matchPreference: MatchPreference | null;
  preferredTimes: DayTime[];
  preferredDays: number[];
}

const HAND_VALUES = new Set(HANDS.map((item) => item.value));
const SIDE_VALUES = new Set(COURT_SIDES.map((item) => item.value));
const MATCH_VALUES = new Set(MATCH_PREFERENCES.map((item) => item.value));
const TIME_VALUES = new Set(DAY_TIMES.map((item) => item.value));

/**
 * Разбор формы.
 *
 * Значения приходят из браузера, то есть могут быть любыми: всё, что не входит
 * в словарь, отбрасывается молча, а не роняет сохранение. Пустая строка — это
 * «не указано», и она отличается от отсутствия поля только тем, что игрок
 * осознанно снял выбор.
 */
export function parsePreferences(formData: FormData): PlayerPreferences {
  const one = <T extends string>(name: string, allowed: Set<string>): T | null => {
    const raw = String(formData.get(name) ?? '');
    return allowed.has(raw) ? (raw as T) : null;
  };

  const times = formData
    .getAll('preferredTimes')
    .map(String)
    .filter((value) => TIME_VALUES.has(value as DayTime)) as DayTime[];

  const days = formData
    .getAll('preferredDays')
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7);

  return {
    dominantHand: one<Hand>('dominantHand', HAND_VALUES),
    courtSide: one<CourtSide>('courtSide', SIDE_VALUES),
    matchPreference: one<MatchPreference>('matchPreference', MATCH_VALUES),
    // Дубли возможны, если форму подменили: множество дешевле, чем доверие.
    preferredTimes: [...new Set(times)],
    preferredDays: [...new Set(days)].sort((a, b) => a - b),
  };
}

/** Короткая сводка для свёрнутого вида: то, что игрок указал, через точку. */
export function summarize(preferences: PlayerPreferences): string | null {
  const parts: string[] = [];

  const hand = HANDS.find((item) => item.value === preferences.dominantHand);
  if (hand) parts.push(`${hand.label} рука`);

  const side = COURT_SIDES.find((item) => item.value === preferences.courtSide);
  if (side) parts.push(side.label);

  const match = MATCH_PREFERENCES.find((item) => item.value === preferences.matchPreference);
  if (match) parts.push(match.label.toLowerCase());

  if (preferences.preferredTimes.length > 0) {
    parts.push(
      DAY_TIMES.filter((item) => preferences.preferredTimes.includes(item.value))
        .map((item) => item.label.toLowerCase())
        .join(', '),
    );
  }

  if (preferences.preferredDays.length > 0) {
    parts.push(
      WEEKDAYS.filter((item) => preferences.preferredDays.includes(item.value))
        .map((item) => item.label)
        .join(', '),
    );
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}
