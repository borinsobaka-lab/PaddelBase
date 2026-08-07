import { RATING_CONFIG, type RatingConfig } from './config.js';
import { RATING_CONFIG_VERSION } from './config.js';
import { clampLevel, roundLevel } from './level.js';
import type {
  MatchOutcome,
  MatchRatingBreakdown,
  MatchRatingDelta,
  MatchRatingInput,
  MatchRatingResult,
  PlayerSnapshot,
  TeamSide,
} from './types.js';

/**
 * Вес повторных матчей (ТЗ §3.5, п. 2). `repeatCount` — порядковый номер
 * встречи этого состава за последние 30 дней, начиная с 1.
 */
export function resolveRepeatWeight(repeatCount: number, config: RatingConfig = RATING_CONFIG): number {
  const table = config.W_REPEAT;
  const index = Math.min(Math.max(Math.trunc(repeatCount), 1), table.length) - 1;
  return table[index] ?? table[table.length - 1] ?? 1;
}

/**
 * Множитель разрыва (ТЗ §3.5, п. 1).
 *
 * Условие применения в ТЗ описано словами как «победа», а в псевдокоде — как
 * `S > E`. Выбран второй вариант и зафиксирован явно: демпфируется только
 * положительная дельта. Смысл — «нельзя набрать рейтинг, обыгрывая заведомо
 * слабых», при этом проигрыш слабым засчитывается с полным весом. Формулировка
 * через знак дельты, а не через факт победы, оставляет систему согласованной:
 * демпфируется ровно то, что является приростом.
 */
export function resolveGapWeight(
  ownTeamLevel: number,
  opponentTeamLevel: number,
  isGain: boolean,
  config: RatingConfig = RATING_CONFIG,
): number {
  const gap = ownTeamLevel - opponentTeamLevel;
  if (!isGain || gap <= config.GAP_LIMIT) return 1;
  return Math.max(0.15, 1 - (gap - config.GAP_LIMIT));
}

/** Индивидуальный K-фактор (ТЗ §3.3, шаг 4). */
export function resolveK(reliability: number, config: RatingConfig = RATING_CONFIG): number {
  return config.K_MIN + (config.K_MAX - config.K_MIN) * (1 - reliability);
}

/** Максимальный шаг за один матч зависит от того, откалиброван игрок или нет. */
export function resolveMaxStep(reliability: number, config: RatingConfig = RATING_CONFIG): number {
  return reliability < config.RELIABLE_THRESHOLD ? config.MAX_STEP_CALIBRATING : config.MAX_STEP_RELIABLE;
}

/** Ожидание для пары A (ТЗ §3.3, шаг 2). */
export function expectedScore(levelA: number, levelB: number, config: RatingConfig = RATING_CONFIG): number {
  return 1 / (1 + 10 ** ((levelB - levelA) / config.D));
}

/** Матч, завершённый досрочно, не рейтингуется (ТЗ §3.5, п. 5). */
export function meetsMinimumVolume(
  scoreA: number,
  scoreB: number,
  config: RatingConfig = RATING_CONFIG,
): boolean {
  return scoreA + scoreB >= config.MIN_GAMES_FOR_RATING;
}

function teamLevel(team: readonly [PlayerSnapshot, PlayerSnapshot]): number {
  return (team[0].level + team[1].level) / 2;
}

/** Вклад самого факта победы в фактический результат пары A. */
function winFactorA(outcome: MatchOutcome): number {
  if (outcome === 'A') return 1;
  if (outcome === 'B') return 0;
  return 0.5;
}

/**
 * Изменения уровня после одного матча. Чистая функция: не читает время,
 * не обращается к БД, не имеет побочных эффектов (ТЗ §2, требование к
 * архитектуре). Всё, что нужно для пересчёта, возвращается в `breakdown`.
 *
 * Дельта каждого игрока считается независимо (у партнёров разный K), поэтому
 * сумма изменений по четверым не равна нулю — это осознанный компромисс ТЗ §3.3
 * ради быстрой калибровки новичков.
 */
export function computeMatchDeltas(
  input: MatchRatingInput,
  config: RatingConfig = RATING_CONFIG,
): MatchRatingResult {
  const levelA = teamLevel(input.teamA);
  const levelB = teamLevel(input.teamB);

  const expectedA = expectedScore(levelA, levelB, config);
  const expectedB = 1 - expectedA;

  const total = input.scoreA + input.scoreB;
  const gameShareA = total > 0 ? input.scoreA / total : 0.5;
  const actualA = config.W_WIN * winFactorA(input.winner) + (1 - config.W_WIN) * gameShareA;
  const actualB = 1 - actualA;

  const wFormat = config.W_FORMAT[input.format];
  const wDuration = config.W_DURATION[input.duration];
  const wRepeat = resolveRepeatWeight(input.repeatCount, config);

  const wGapA = resolveGapWeight(levelA, levelB, actualA > expectedA, config);
  const wGapB = resolveGapWeight(levelB, levelA, actualB > expectedB, config);

  const buildTeam = (
    team: readonly [PlayerSnapshot, PlayerSnapshot],
    side: TeamSide,
    actual: number,
    expected: number,
    wGap: number,
  ): MatchRatingDelta[] =>
    team.map((player) => {
      const k = resolveK(player.reliability, config);
      const maxStep = resolveMaxStep(player.reliability, config);

      const raw = k * (actual - expected) * wFormat * wDuration * wRepeat * wGap;
      const stepped = Math.min(Math.max(raw, -maxStep), maxStep);

      const levelBefore = roundLevel(player.level);
      const levelAfter = clampLevel(levelBefore + stepped, config);

      return {
        playerId: player.id,
        team: side,
        // Дельта выводится из округлённых уровней, а не берётся сырой:
        // levelBefore + delta должно точно равняться levelAfter и после
        // записи в decimal(4,3), иначе пересчёт истории поедет.
        delta: roundLevel(levelAfter - levelBefore),
        levelBefore,
        levelAfter,
      };
    });

  const breakdown: MatchRatingBreakdown = {
    levelA,
    levelB,
    expectedA,
    expectedB,
    actualA,
    actualB,
    gameShareA,
    wFormat,
    wDuration,
    wRepeat,
    wGapA,
    wGapB,
  };

  return {
    deltas: [
      ...buildTeam(input.teamA, 'A', actualA, expectedA, wGapA),
      ...buildTeam(input.teamB, 'B', actualB, expectedB, wGapB),
    ],
    breakdown,
    configVersion: RATING_CONFIG_VERSION,
  };
}
