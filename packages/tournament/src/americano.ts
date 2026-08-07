import { PairCounter, crossCount } from './counters.js';
import {
  chain,
  compareIds,
  createRandom,
  seededOrder,
  shuffle,
  tieBreakKey,
} from './deterministic.js';
import { circleMethodRounds, type Pairing } from './roundRobin.js';
import type { ScheduleAnalysis, ScheduledMatch, ScheduledRound } from './types.js';

export interface AmericanoScheduleInput {
  /** Игроки в порядке регистрации. */
  playerIds: readonly string[];
  courtsCount: number;
  /** По умолчанию — см. defaultAmericanoRounds. */
  roundsCount?: number;
  /** Seed турнира: делает жеребьёвку воспроизводимой. */
  seed: string;
}

/** Избегать повторного партнёрства важнее, чем повторной встречи (ТЗ §4.2). */
const PARTNER_WEIGHT = 10;

/**
 * Число раундов по умолчанию (ТЗ §4.2): `n − 1` при `n`, кратном 4 — это ровно
 * столько, сколько нужно, чтобы каждый сыграл в паре с каждым один раз.
 */
export function defaultAmericanoRounds(playerCount: number): number {
  return playerCount % 4 === 0 ? playerCount - 1 : 7;
}

/** Общее число матчей при полной ротации (ТЗ §4.2). */
export function fullRotationMatchCount(playerCount: number): number {
  return (playerCount * (playerCount - 1)) / 4;
}

/**
 * Расписание Американо целиком: партнёры не зависят от результатов, поэтому вся
 * сетка генерируется сразу при старте турнира.
 *
 * Две ветки:
 * — если игроков кратно 4 и кортов хватает на всех, используется круговой метод,
 *   и полнота ротации гарантирована построением;
 * — иначе работает жадный планировщик с выравниванием отдыхающих, а качество
 *   полученной сетки нужно смотреть через analyzeSchedule.
 */
export function generateAmericanoSchedule(input: AmericanoScheduleInput): ScheduledRound[] {
  const players = seededOrder(validatePlayers(input.playerIds), input.seed);
  const roundsCount = input.roundsCount ?? defaultAmericanoRounds(players.length);
  if (roundsCount < 1) return [];

  const usableCourts = Math.min(
    Math.max(1, Math.trunc(input.courtsCount)),
    Math.floor(players.length / 4),
  );

  const everyoneFits = players.length % 4 === 0 && usableCourts === players.length / 4;

  return everyoneFits
    ? scheduleByRotation(players, roundsCount, input.seed)
    : scheduleGreedily(players, usableCourts, roundsCount, input.seed);
}

function validatePlayers(playerIds: readonly string[]): string[] {
  if (playerIds.length < 4) {
    throw new Error('Для турнира нужно минимум 4 игрока');
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error('Список игроков содержит дубликаты');
  }
  return [...playerIds];
}

// --- Ветка 1: полная ротация ---

/** Сколько раз пересобирать раунды, доводя равномерность соперников. */
const REBALANCE_SWEEPS = 6;

/** Сколько альтернативных факторизаций перебрать в поисках лучшей по соперникам. */
const CANDIDATE_FACTORIZATIONS = 24;

/** Теоретический минимум: в идеальной сетке каждый встречает каждого соперником дважды. */
const IDEAL_OPPONENT_REPEAT = 2;

/**
 * Полнота ротации партнёров гарантирована любой 1-факторизацией `K_n`, но
 * встречаемость соперников у разных факторизаций разная, и круговой метод здесь
 * далеко не лучший: на 8 игроках перебор всех расстановок по кортам упирается
 * в максимум 4 повтора, тогда как другие факторизации дают 3.
 *
 * Поэтому кроме кругового метода перебирается два десятка факторизаций,
 * построенных случайным поиском от seed турнира, и берётся лучшая. Перебор
 * идёт один раз при старте турнира и укладывается в десятки миллисекунд.
 */
function scheduleByRotation(
  players: readonly string[],
  roundsCount: number,
  seed: string,
): ScheduledRound[] {
  const random = createRandom(seed);
  const candidates: Pairing[][][] = [circleMethodRounds(players)];

  for (let attempt = 0; attempt < CANDIDATE_FACTORIZATIONS; attempt += 1) {
    const factorization = randomFactorization(players, random);
    if (factorization) candidates.push(factorization);
  }

  let best = buildRotationRounds(candidates[0]!, roundsCount);
  let bestScore = scoreRounds(best);

  for (const factorization of candidates.slice(1)) {
    if (bestScore.maxOpponentRepeat <= IDEAL_OPPONENT_REPEAT) break;

    const rounds = buildRotationRounds(factorization, roundsCount);
    const score = scoreRounds(rounds);

    const better =
      score.maxOpponentRepeat < bestScore.maxOpponentRepeat ||
      (score.maxOpponentRepeat === bestScore.maxOpponentRepeat &&
        score.spread < bestScore.spread);

    if (better) {
      best = rounds;
      bestScore = score;
    }
  }

  return best;
}

/**
 * Случайная 1-факторизация `K_n`: раунд за раундом ищется полное паросочетание
 * из ещё не использованных пар. Возвращает null, если поиск не уложился в
 * лимит шагов — вызывающий код просто пропускает такого кандидата.
 */
function randomFactorization(
  players: readonly string[],
  random: () => number,
): Pairing[][] | null {
  const n = players.length;
  const used = new Set<string>();
  const edgeKey = (a: number, b: number) => (a < b ? `${a} ${b}` : `${b} ${a}`);
  const rounds: Pairing[][] = [];

  let steps = 0;
  const stepLimit = 20_000;

  const match = (available: readonly number[], acc: [number, number][]): boolean => {
    if (available.length === 0) return true;
    if ((steps += 1) > stepLimit) return false;

    const first = available[0]!;
    const rest = available.slice(1);

    for (const candidate of shuffle(rest, random)) {
      if (used.has(edgeKey(first, candidate))) continue;

      used.add(edgeKey(first, candidate));
      acc.push([first, candidate]);

      if (match(rest.filter((id) => id !== candidate), acc)) return true;

      used.delete(edgeKey(first, candidate));
      acc.pop();
    }

    return false;
  };

  for (let round = 0; round < n - 1; round += 1) {
    const acc: [number, number][] = [];
    if (!match(Array.from({ length: n }, (_, index) => index), acc)) return null;
    rounds.push(acc.map(([a, b]) => [players[a]!, players[b]!] as Pairing));
  }

  return rounds;
}

function scoreRounds(rounds: readonly ScheduledRound[]): {
  maxOpponentRepeat: number;
  spread: number;
} {
  const opponents = new PairCounter();
  for (const round of rounds) {
    for (const match of round.matches) registerOpponents(opponents, match.teamA, match.teamB);
  }
  return { maxOpponentRepeat: opponents.max(), spread: opponents.sumOfSquares() };
}

function buildRotationRounds(
  factorization: readonly Pairing[][],
  roundsCount: number,
): ScheduledRound[] {
  // За пределами n − 1 раундов повторение партнёров математически неизбежно:
  // факторизация проходится по кругу.
  const pairsPerRound = Array.from(
    { length: roundsCount },
    (_, index) => factorization[index % factorization.length]!,
  );

  const opponents = new PairCounter();
  const matchesPerRound = pairsPerRound.map((pairs) => matchUpPairs(pairs, opponents));

  // Первый проход жаден и близорук: ранние раунды выбирают, не зная поздних.
  // Каждый последующий проход пересобирает раунд заново, уже видя все
  // остальные, — это заметно выравнивает встречаемость соперников.
  for (let sweep = 0; sweep < REBALANCE_SWEEPS; sweep += 1) {
    let changed = false;

    for (let index = 0; index < matchesPerRound.length; index += 1) {
      const current = matchesPerRound[index]!;
      for (const match of current) unregisterOpponents(opponents, match.teamA, match.teamB);

      const rebuilt = matchUpPairs(pairsPerRound[index]!, opponents);
      if (!sameMatches(current, rebuilt)) changed = true;
      matchesPerRound[index] = rebuilt;
    }

    if (!changed) break;
  }

  return matchesPerRound.map((matches, index) => ({
    roundNumber: index + 1,
    matches,
    resting: [],
  }));
}

/**
 * Пары внутри раунда уже зафиксированы круговым методом; остаётся развести их
 * по кортам так, чтобы поменьше повторялись соперники.
 *
 * Стоимость считается предельная — `2·count + 1` за каждую встречу, что
 * эквивалентно минимизации суммы квадратов счётчиков. Это давит именно на пик
 * повторов, тогда как простая сумма счётчиков одинаково оценивает «дважды по
 * одному разу» и «один раз дважды».
 */
function matchUpPairs(pairs: readonly Pairing[], opponents: PairCounter): ScheduledMatch[] {
  const remaining = [...pairs];
  const matches: ScheduledMatch[] = [];

  while (remaining.length >= 2) {
    // Ищем глобально самую дешёвую пару пар, а не первую попавшуюся: жадность
    // «слева направо» хуже, потому что дорогие сочетания сваливаются в конец
    // списка, где выбора уже не остаётся.
    let bestA = 0;
    let bestB = 1;
    let bestCost = Number.POSITIVE_INFINITY;

    for (let i = 0; i < remaining.length; i += 1) {
      for (let j = i + 1; j < remaining.length; j += 1) {
        const cost = marginalCost(opponents, remaining[i]!, remaining[j]!);
        if (cost < bestCost) {
          bestCost = cost;
          bestA = i;
          bestB = j;
        }
      }
    }

    const teamA = remaining[bestA]!;
    const teamB = remaining[bestB]!;
    remaining.splice(bestB, 1);
    remaining.splice(bestA, 1);

    registerOpponents(opponents, teamA, teamB);
    matches.push({ courtNumber: matches.length + 1, teamA, teamB });
  }

  return matches;
}

function marginalCost(opponents: PairCounter, pairA: Pairing, pairB: Pairing): number {
  let cost = 0;
  for (const a of pairA) {
    for (const b of pairB) cost += 2 * opponents.get(a, b) + 1;
  }
  return cost;
}

function sameMatches(left: readonly ScheduledMatch[], right: readonly ScheduledMatch[]): boolean {
  const key = (matches: readonly ScheduledMatch[]) =>
    matches
      .map((match) => [...match.teamA, ...match.teamB].sort().join('+'))
      .sort()
      .join('|');
  return key(left) === key(right);
}

// --- Ветка 2: жадный планировщик ---

function scheduleGreedily(
  players: readonly string[],
  courts: number,
  roundsCount: number,
  seed: string,
): ScheduledRound[] {
  const partners = new PairCounter();
  const opponents = new PairCounter();
  const restCount = new Map(players.map((id) => [id, 0]));
  const playedCount = new Map(players.map((id) => [id, 0]));

  const playersPerRound = courts * 4;
  const rounds: ScheduledRound[] = [];

  for (let index = 0; index < roundsCount; index += 1) {
    const selected = selectPlayersForRound(players, playersPerRound, restCount, playedCount, seed);
    const selectedSet = new Set(selected);
    const resting = players.filter((id) => !selectedSet.has(id));

    for (const id of resting) restCount.set(id, restCount.get(id)! + 1);
    for (const id of selected) playedCount.set(id, playedCount.get(id)! + 1);

    const matches: ScheduledMatch[] = [];
    for (const group of groupIntoFours(selected, opponents)) {
      const { teamA, teamB } = splitIntoTeams(group, partners, opponents);
      partners.increment(teamA[0], teamA[1]);
      partners.increment(teamB[0], teamB[1]);
      registerOpponents(opponents, teamA, teamB);
      matches.push({ courtNumber: matches.length + 1, teamA, teamB });
    }

    rounds.push({ roundNumber: index + 1, matches, resting });
  }

  return rounds;
}

/**
 * Кто играет в этом раунде.
 *
 * ТЗ §4.2 предписывает отбирать игроков с **минимальным** `restCount`, но это
 * инверсия: `restCount` считает пропущенные раунды, поэтому при таком отборе
 * тот, кто уже много отдыхал, не попадёт в игру никогда, и требование
 * «разница не более 1» из того же пункта нарушается систематически. Отбираем
 * тех, кто отдыхал больше всех.
 */
function selectPlayersForRound(
  players: readonly string[],
  playersPerRound: number,
  restCount: ReadonlyMap<string, number>,
  playedCount: ReadonlyMap<string, number>,
  seed: string,
): string[] {
  return [...players]
    .sort((a, b) =>
      chain(
        restCount.get(b)! - restCount.get(a)!,
        playedCount.get(a)! - playedCount.get(b)!,
        tieBreakKey(seed, a) - tieBreakKey(seed, b),
        compareIds(a, b),
      ),
    )
    .slice(0, playersPerRound);
}

/** Разбить отобранных на четвёрки, минимизируя повторные встречи (ТЗ §4.2, шаг 2). */
function groupIntoFours(selected: readonly string[], opponents: PairCounter): string[][] {
  const pool = [...selected];
  const groups: string[][] = [];

  while (pool.length >= 4) {
    const group = [pool.shift()!];

    while (group.length < 4) {
      let bestIndex = 0;
      let bestCost = Number.POSITIVE_INFINITY;

      for (let index = 0; index < pool.length; index += 1) {
        const candidate = pool[index]!;
        const cost = group.reduce((sum, member) => sum + opponents.get(member, candidate), 0);
        if (cost < bestCost) {
          bestCost = cost;
          bestIndex = index;
        }
      }

      group.push(pool.splice(bestIndex, 1)[0]!);
    }

    groups.push(group);
  }

  return groups;
}

/** Из трёх возможных разбиений четвёрки на пары выбрать самое дешёвое (ТЗ §4.2, шаг 3). */
function splitIntoTeams(
  group: readonly string[],
  partners: PairCounter,
  opponents: PairCounter,
): { teamA: Pairing; teamB: Pairing } {
  const [p0, p1, p2, p3] = group as [string, string, string, string];

  const options: { teamA: Pairing; teamB: Pairing }[] = [
    { teamA: [p0, p1], teamB: [p2, p3] },
    { teamA: [p0, p2], teamB: [p1, p3] },
    { teamA: [p0, p3], teamB: [p1, p2] },
  ];

  let best = options[0]!;
  let bestCost = Number.POSITIVE_INFINITY;

  for (const option of options) {
    const cost =
      PARTNER_WEIGHT *
        (partners.get(option.teamA[0], option.teamA[1]) +
          partners.get(option.teamB[0], option.teamB[1])) +
      crossCount(opponents, option.teamA, option.teamB);

    if (cost < bestCost) {
      bestCost = cost;
      best = option;
    }
  }

  return best;
}

function registerOpponents(opponents: PairCounter, teamA: Pairing, teamB: Pairing): void {
  for (const a of teamA) {
    for (const b of teamB) opponents.increment(a, b);
  }
}

// --- Проверка качества сетки ---

export function analyzeSchedule(
  rounds: readonly ScheduledRound[],
  playerIds: readonly string[],
): ScheduleAnalysis {
  const partners = new PairCounter();
  const opponents = new PairCounter();
  const restCount = new Map(playerIds.map((id) => [id, 0]));

  for (const round of rounds) {
    for (const match of round.matches) {
      partners.increment(match.teamA[0], match.teamA[1]);
      partners.increment(match.teamB[0], match.teamB[1]);
      registerOpponents(opponents, match.teamA, match.teamB);
    }
    for (const id of round.resting) {
      restCount.set(id, (restCount.get(id) ?? 0) + 1);
    }
  }

  const rests = [...restCount.values()];
  const maxPartnerRepeat = partners.max();

  return {
    rounds: rounds.length,
    maxPartnerRepeat,
    maxOpponentRepeat: opponents.max(),
    restSpread: rests.length === 0 ? 0 : Math.max(...rests) - Math.min(...rests),
    isPerfectPartnerRotation: maxPartnerRepeat <= 1,
  };
}

function unregisterOpponents(opponents: PairCounter, teamA: Pairing, teamB: Pairing): void {
  for (const a of teamA) {
    for (const b of teamB) opponents.decrement(a, b);
  }
}
