import { describe, expect, it } from 'vitest';

import { formatLevel, levelCategory } from './level.js';

describe('буквенные категории (ТЗ §3.11)', () => {
  it('раскладывает шкалу по границам из ТЗ', () => {
    expect(levelCategory(0.0)).toBe('D');
    expect(levelCategory(1.5)).toBe('D');
    expect(levelCategory(1.51)).toBe('D+');
    expect(levelCategory(2.2)).toBe('D+');
    expect(levelCategory(2.21)).toBe('C');
    expect(levelCategory(3.2)).toBe('C');
    expect(levelCategory(3.21)).toBe('C+');
    expect(levelCategory(5.0)).toBe('C+');
    expect(levelCategory(5.01)).toBe('B');
    expect(levelCategory(6.5)).toBe('B');
    expect(levelCategory(6.51)).toBe('A');
    expect(levelCategory(7.0)).toBe('A');
  });

  it('никогда не противоречит цифре, показанной рядом в интерфейсе', () => {
    // 1.504 отображается как «1.50» — значит и категория должна быть D, а не D+.
    expect(formatLevel(1.504)).toBe('1.50');
    expect(levelCategory(1.504)).toBe('D');
    expect(formatLevel(1.506)).toBe('1.51');
    expect(levelCategory(1.506)).toBe('D+');

    // Цифра и буква обязаны быть согласованы на всей шкале с шагом хранения.
    for (let stored = 0; stored <= 7000; stored += 1) {
      const level = stored / 1000;
      const displayed = Number(formatLevel(level));
      expect(levelCategory(level)).toBe(levelCategory(displayed));
    }
  });
});
