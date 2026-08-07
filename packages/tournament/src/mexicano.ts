import { chain, compareIds, seededOrder, tieBreakKey } from './deterministic.js';
import { compareForSeeding } from './standings.js';
import type { ScheduledMatch, ScheduledRound } from './types.js';

export interface MexicanoParticipant {
  playerId: string;
  points: number;
  pointsDiff: number;
  restCount: number;
  /** Уровень рейтинга: используется для посева первого раунда и как тай-брейк. */
  level: number;
}

export interface MexicanoRoundInput {
  roundNumber: number;
  participants: readonly MexicanoParticipant[];
  courtsCount: number;
  seed: string;
  /**
   * Посев первого раунда по уровню вместо жеребьёвки (ТЗ §4.3). По умолчанию
   * включён: у всех игроков уровень есть уже после анкеты, а ровный старт лучше
   * случайного.
   */
  seedFirstRoundByLevel?: boolean;
}

/**
 * Сетка одного раунда Мексикано.
 *
 * В отличие от Американо, сетка следующего раунда зависит от текущей таблицы,
 * поэтому генерируется по одному раунду за раз, после закрытия предыдущего
 * (ТЗ §4.6).
 */
export function generateMexicanoRound(input: MexicanoRoundInput): ScheduledRound {
  const participants = validate(input.participants);
  const order = orderParticipants(input, participants);

  const courts = Math.min(
    Math.max(1, Math.trunc(input.courtsCount)),
    Math.floor(participants.length / 4),
  );
  const playersPerRound = courts * 4;

  const restCount = new Map(participants.map((p) => [p.playerId, p.restCount]));
  const restingIds = selectResting(order, participants.length - playersPerRound, restCount);
  const playing = order.filter((id) => !restingIds.has(id));

  return {
    roundNumber: input.roundNumber,
    matches: pairByStandings(playing),
    resting: order.filter((id) => restingIds.has(id)),
  };
}

function validate(participants: readonly MexicanoParticipant[]): readonly MexicanoParticipant[] {
  if (participants.length < 4) {
    throw new Error('Для турнира нужно минимум 4 игрока');
  }
  if (new Set(participants.map((p) => p.playerId)).size !== participants.length) {
    throw new Error('Список игроков содержит дубликаты');
  }
  return participants;
}

function orderParticipants(
  input: MexicanoRoundInput,
  participants: readonly MexicanoParticipant[],
): string[] {
  const ids = participants.map((p) => p.playerId);

  if (input.roundNumber <= 1) {
    if (input.seedFirstRoundByLevel === false) return seededOrder(ids, input.seed);

    return [...participants]
      .sort((a, b) =>
        chain(
          b.level - a.level,
          tieBreakKey(input.seed, a.playerId) - tieBreakKey(input.seed, b.playerId),
          compareIds(a.playerId, b.playerId),
        ),
      )
      .map((p) => p.playerId);
  }

  const levels = Object.fromEntries(participants.map((p) => [p.playerId, p.level]));

  return [...participants]
    .sort((a, b) =>
      compareForSeeding(
        { id: a.playerId, points: a.points, pointsDiff: a.pointsDiff },
        { id: b.playerId, points: b.points, pointsDiff: b.pointsDiff },
        levels,
      ),
    )
    .map((p) => p.playerId);
}

/**
 * Кто отдыхает. ТЗ §4.3 говорит «отдыхает нижняя часть таблицы» и одновременно
 * требует выравнивания `restCount` — эти правила конфликтуют, как только кто-то
 * задержался внизу таблицы на несколько раундов. Приоритет отдан выравниванию
 * (оно в ТЗ сформулировано как жёсткий инвариант «разница не более 1»),
 * а положение в таблице работает вторым критерием.
 */
function selectResting(
  order: readonly string[],
  count: number,
  restCount: ReadonlyMap<string, number>,
): Set<string> {
  if (count <= 0) return new Set();

  const position = new Map(order.map((id, index) => [id, index]));

  return new Set(
    [...order]
      .sort((a, b) =>
        chain(
          (restCount.get(a) ?? 0) - (restCount.get(b) ?? 0),
          position.get(b)! - position.get(a)!,
          compareIds(a, b),
        ),
      )
      .slice(0, count),
  );
}

/**
 * Четвёрки берутся из таблицы сверху вниз, внутри четвёрки — 1-й с 4-м против
 * 2-го с 3-м (ТЗ §4.3). Это и есть смысл Мексикано: сильнейший играет
 * с слабейшим из своей четвёрки, матчи получаются ровными.
 */
function pairByStandings(playing: readonly string[]): ScheduledMatch[] {
  const matches: ScheduledMatch[] = [];

  for (let index = 0; index + 3 < playing.length; index += 4) {
    const [first, second, third, fourth] = [
      playing[index]!,
      playing[index + 1]!,
      playing[index + 2]!,
      playing[index + 3]!,
    ];

    matches.push({
      courtNumber: matches.length + 1,
      teamA: [first, fourth],
      teamB: [second, third],
    });
  }

  return matches;
}
