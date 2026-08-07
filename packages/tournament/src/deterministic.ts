/**
 * Детерминированные разрешения ничьих.
 *
 * Любая сетка обязана быть воспроизводимой: организатор перезагружает страницу,
 * сервер перезапускается, история пересчитывается — расстановка должна получиться
 * та же самая. Поэтому вместо Math.random() везде используется хеш от
 * (seed турнира + идентификатор), а окончательный резерв — сравнение по id.
 */

/** FNV-1a, 32 бита. Нужен не криптостойкий хеш, а устойчивый и одинаковый везде. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function tieBreakKey(seed: string, id: string): number {
  return hashString(`${seed}:${id}`);
}

/** Псевдослучайный, но воспроизводимый порядок. Заменяет жеребьёвку. */
export function seededOrder(ids: readonly string[], seed: string): string[] {
  return [...ids].sort((a, b) => {
    const diff = tieBreakKey(seed, a) - tieBreakKey(seed, b);
    return diff !== 0 ? diff : compareIds(a, b);
  });
}

export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Воспроизводимый генератор псевдослучайных чисел (mulberry32), инициализируемый
 * seed турнира. Нужен там, где приходится перебирать варианты: результат обязан
 * зависеть только от seed, иначе сетка перестанет быть воспроизводимой.
 */
export function createRandom(seed: string): () => number {
  let state = hashString(seed);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Тасование Фишера—Йетса. Сортировка со случайным компаратором даёт смещённое распределение. */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/** Сравнение по списку критериев: первый ненулевой выигрывает. */
export function chain(...comparisons: number[]): number {
  for (const value of comparisons) {
    if (value !== 0) return value;
  }
  return 0;
}
