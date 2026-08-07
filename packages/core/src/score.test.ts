import { describe, expect, it } from 'vitest';

import {
  InvalidScoreError,
  durationFromSets,
  formatMatchScore,
  isValidSet,
  parseMatchScore,
} from './score.js';

describe('корректность отдельного сета (ТЗ §4.1)', () => {
  it('принимает сет до 6 с разницей в два гейма', () => {
    for (const loser of [0, 1, 2, 3, 4]) {
      expect(isValidSet({ a: 6, b: loser })).toBe(true);
      expect(isValidSet({ a: loser, b: 6 })).toBe(true);
    }
  });

  it('принимает 7:5 и тай-брейк 7:6', () => {
    expect(isValidSet({ a: 7, b: 5 })).toBe(true);
    expect(isValidSet({ a: 7, b: 6 })).toBe(true);
    expect(isValidSet({ a: 6, b: 7 })).toBe(true);
  });

  it('отвергает 6:5 — сет не заканчивается с разницей в один гейм', () => {
    expect(isValidSet({ a: 6, b: 5 })).toBe(false);
  });

  it('отвергает недоигранные и невозможные счета', () => {
    for (const set of [
      { a: 5, b: 3 },
      { a: 8, b: 6 },
      { a: 7, b: 4 },
      { a: 6, b: 6 },
      { a: -1, b: 6 },
      { a: 6.5, b: 2 },
    ]) {
      expect(isValidSet(set)).toBe(false);
    }
  });
});

describe('разбор счёта матча', () => {
  it('считает сеты, геймы и победителя', () => {
    const parsed = parseMatchScore([
      { a: 6, b: 4 },
      { a: 3, b: 6 },
      { a: 7, b: 5 },
    ]);

    expect(parsed.setsA).toBe(2);
    expect(parsed.setsB).toBe(1);
    expect(parsed.gamesA).toBe(16);
    expect(parsed.gamesB).toBe(15);
    expect(parsed.winnerTeam).toBe(1);
  });

  it('принимает матч из одного сета', () => {
    expect(parseMatchScore([{ a: 6, b: 2 }]).winnerTeam).toBe(1);
  });

  it('принимает победу 2:0 по сетам', () => {
    const parsed = parseMatchScore([
      { a: 4, b: 6 },
      { a: 5, b: 7 },
    ]);
    expect(parsed.winnerTeam).toBe(2);
    expect(parsed.gamesA).toBe(9);
  });

  it('отвергает лишний сет после победы 2:0', () => {
    expect(() =>
      parseMatchScore([
        { a: 6, b: 4 },
        { a: 6, b: 3 },
        { a: 6, b: 2 },
      ]),
    ).toThrow(/лишний/);
  });

  it('отвергает пустой счёт и больше трёх сетов', () => {
    expect(() => parseMatchScore([])).toThrow(InvalidScoreError);
    expect(() =>
      parseMatchScore([
        { a: 6, b: 4 },
        { a: 4, b: 6 },
        { a: 6, b: 4 },
        { a: 4, b: 6 },
      ]),
    ).toThrow(/больше 3/);
  });

  it('отвергает ничью по сетам', () => {
    expect(() =>
      parseMatchScore([
        { a: 6, b: 4 },
        { a: 4, b: 6 },
      ]),
    ).toThrow(/Ничья/);
  });

  it('сообщает, какой именно сет неверен', () => {
    expect(() =>
      parseMatchScore([
        { a: 6, b: 4 },
        { a: 6, b: 5 },
      ]),
    ).toThrow(/Сет 2/);
  });
});

describe('вспомогательное', () => {
  it('выводит продолжительность из числа сетов', () => {
    expect(durationFromSets(1)).toBe('oneSet');
    expect(durationFromSets(2)).toBe('twoSets');
    expect(durationFromSets(3)).toBe('threeSets');
  });

  it('форматирует счёт для карточки матча', () => {
    expect(
      formatMatchScore([
        { a: 6, b: 4 },
        { a: 3, b: 6 },
        { a: 7, b: 5 },
      ]),
    ).toBe('6:4, 3:6, 7:5');
  });
});
