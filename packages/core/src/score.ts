/**
 * Разбор и валидация падел-счёта (ТЗ §4.1).
 *
 * Чистая логика: ни БД, ни времени. Счёт вводит игрок вручную, поэтому проверять
 * его нужно строго — некорректный счёт попадёт в движок рейтинга и исказит
 * уровни всех четверых, а обнаружится это в лучшем случае через недели.
 */

export interface SetScore {
  a: number;
  b: number;
}

export interface ParsedMatchScore {
  sets: SetScore[];
  setsA: number;
  setsB: number;
  gamesA: number;
  gamesB: number;
  /** 1 — победила первая пара, 2 — вторая. */
  winnerTeam: 1 | 2;
}

export class InvalidScoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidScoreError';
  }
}

export const MAX_SETS = 3;

/**
 * Допустимые исходы сета: до 6 с разницей в два гейма, 7:5, либо 7:6 по
 * тай-брейку. Всё остальное — опечатка при вводе.
 */
export function isValidSet(set: SetScore): boolean {
  const { a, b } = set;

  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return false;

  const high = Math.max(a, b);
  const low = Math.min(a, b);

  if (high === 6) return low <= 4;
  if (high === 7) return low === 5 || low === 6;
  return false;
}

function setWinner(set: SetScore): 1 | 2 {
  return set.a > set.b ? 1 : 2;
}

/**
 * Разбирает счёт матча целиком и возвращает всё, что нужно движку рейтинга.
 * Бросает InvalidScoreError с человекочитаемым текстом — он показывается
 * игроку в форме ввода.
 */
export function parseMatchScore(sets: readonly SetScore[]): ParsedMatchScore {
  if (sets.length === 0) {
    throw new InvalidScoreError('Введите счёт хотя бы одного сета');
  }
  if (sets.length > MAX_SETS) {
    throw new InvalidScoreError(`В матче не может быть больше ${MAX_SETS} сетов`);
  }

  let setsA = 0;
  let setsB = 0;
  let gamesA = 0;
  let gamesB = 0;

  for (const [index, set] of sets.entries()) {
    if (!isValidSet(set)) {
      throw new InvalidScoreError(
        `Сет ${index + 1}: счёт ${set.a}:${set.b} невозможен. Сет играется до 6 с разницей в два гейма, либо 7:5, либо 7:6 по тай-брейку`,
      );
    }

    // Матч не продолжается после того, как кто-то взял два сета.
    if (setsA === 2 || setsB === 2) {
      throw new InvalidScoreError(
        `Сет ${index + 1} лишний: матч уже закончился со счётом ${setsA}:${setsB} по сетам`,
      );
    }

    if (setWinner(set) === 1) setsA += 1;
    else setsB += 1;

    gamesA += set.a;
    gamesB += set.b;
  }

  if (setsA === setsB) {
    throw new InvalidScoreError(
      `Ничья по сетам (${setsA}:${setsB}) — доиграйте матч или укажите победителя решающего сета`,
    );
  }

  return {
    sets: sets.map((set) => ({ a: set.a, b: set.b })),
    setsA,
    setsB,
    gamesA,
    gamesB,
    winnerTeam: setsA > setsB ? 1 : 2,
  };
}

/** Продолжительность для движка рейтинга выводится из числа сыгранных сетов. */
export function durationFromSets(setCount: number): 'oneSet' | 'twoSets' | 'threeSets' {
  if (setCount <= 1) return 'oneSet';
  if (setCount === 2) return 'twoSets';
  return 'threeSets';
}

/** «6:4, 3:6, 7:5» — для карточки матча и истории. */
export function formatMatchScore(sets: readonly SetScore[]): string {
  return sets.map((set) => `${set.a}:${set.b}`).join(', ');
}
