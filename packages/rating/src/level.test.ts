import { describe, expect, it } from 'vitest';

import {
  computeStartLevel,
  formatLevel,
  levelCategory,
  selfAssessedLevel,
  type OnboardingAnswers,
} from './level.js';

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

describe('стартовый уровень по анкете (ТЗ §3.2)', () => {
  const answers = (overrides: Partial<OnboardingAnswers> = {}): OnboardingAnswers => ({
    padelExperience: 'from6To24Months',
    racketExperience: 'amateur',
    frequency: 'oneToTwoPerWeek',
    selfAssessment: 'intermediate',
    ...overrides,
  });

  it('складывает самооценку с надбавками по 0.3', () => {
    // 3.0 + 1.0·0.3 + 0.3·0.3 + 0.4·0.3 = 3.51
    expect(computeStartLevel(answers())).toBe(3.51);
  });

  it('новичок без всякого опыта получает свою самооценку', () => {
    expect(
      computeStartLevel(
        answers({
          padelExperience: 'none',
          racketExperience: 'none',
          frequency: 'lessThanMonthly',
          selfAssessment: 'beginner',
        }),
      ),
    ).toBe(1.5);
  });

  it('ограничивает максимум значением 6.0', () => {
    // 5.4 + 0.45 + 0.27 + 0.18 = 6.30 → 6.0
    expect(
      computeStartLevel(
        answers({
          padelExperience: 'moreThan2Years',
          racketExperience: 'competitive',
          frequency: 'threePlusPerWeek',
          selfAssessment: 'competitive',
        }),
      ),
    ).toBe(6.0);
  });

  it('хранит голую самооценку отдельно — для анализа сэндбэггинга', () => {
    expect(selfAssessedLevel(answers({ selfAssessment: 'advanced' }))).toBe(4.6);
    expect(computeStartLevel(answers({ selfAssessment: 'advanced' }))).toBeGreaterThan(4.6);
  });
});
