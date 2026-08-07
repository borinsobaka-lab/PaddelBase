import { describe, expect, it } from 'vitest';

import {
  BEGINNER_BIAS,
  CONFIDENT_AMATEUR_BIAS,
  CROSSOVER_CAP,
  CROSSOVER_FLOOR,
  QUESTIONNAIRE_CAP,
  computeStartLevel,
  experienceScore,
  questionnaireReliability,
  selfAssessedLevel,
  technicalScore,
  type OnboardingAnswers,
} from './onboarding.js';

/** Середина шкалы по всем вопросам — база, от которой отклоняются фикстуры. */
function answers(overrides: Partial<OnboardingAnswers> = {}): OnboardingAnswers {
  return {
    padelExperience: 'from3To6Months',
    frequency: 'weekly',
    coaching: 'none',
    racketBackground: 'none',
    wallPlay: 'slowStraight',
    overhead: 'uncontrolledSmash',
    serveAndReturn: 'inPlay',
    positioning: 'basic',
    competitive: 'none',
    selfAssessment: 'beginner',
    ...overrides,
  };
}

describe('расчётные профили из методики', () => {
  it('профиль 1: полный новичок — фиксированные 0.5', () => {
    const result = computeStartLevel(
      answers({
        padelExperience: 'never',
        frequency: 'irregular',
        wallPlay: 'lost',
        overhead: 'none',
        serveAndReturn: 'weak',
        positioning: 'unaware',
        selfAssessment: 'completeBeginner',
      }),
    );

    expect(result.branch).toBe('completeBeginner');
    expect(result.level).toBe(0.5);
  });

  it('профиль 2: полгода, раз в неделю, без тренера — 1.5', () => {
    const result = computeStartLevel(answers());

    expect(result.technicalScore).toBeCloseTo(1.875, 10);
    expect(result.experienceScore).toBeCloseTo(1.3, 10);
    expect(result.baseScore).toBeCloseTo(1.645, 10);
    expect(result.appliedBias).toBeCloseTo(BEGINNER_BIAS, 10);
    expect(result.level).toBe(1.5);
  });

  it('профиль 3: уверенный любитель, 3 года, тренировки — 4.5', () => {
    const result = computeStartLevel(
      answers({
        padelExperience: 'from2To4Years',
        frequency: 'twoToThreePerWeek',
        coaching: 'monthsRegular',
        racketBackground: 'amateur',
        wallPlay: 'anglesAndSideWall',
        overhead: 'stableBandeja',
        serveAndReturn: 'directional',
        positioning: 'movesWithPartner',
        competitive: 'amateurLeagues',
        selfAssessment: 'strongAmateur',
      }),
    );

    expect(result.technicalScore).toBeCloseTo(3.575, 10);
    expect(result.experienceScore).toBeCloseTo(4.0, 10);
    expect(result.baseScore).toBeCloseTo(3.745, 10);
    expect(result.selfAssessmentInflated).toBe(false);
    expect(result.appliedBias).toBeCloseTo(CONFIDENT_AMATEUR_BIAS, 10);
    expect(result.level).toBe(4.5);
  });

  it('профиль 4: бывший теннисист, впервые взял ракетку — 3.0 в коридоре', () => {
    const result = computeStartLevel(
      answers({
        padelExperience: 'lessThan3Months',
        frequency: 'irregular',
        racketBackground: 'professional',
        wallPlay: 'lost',
        overhead: 'uncontrolledSmash',
        serveAndReturn: 'inPlay',
        positioning: 'basic',
        selfAssessment: 'confidentIntermediate',
      }),
    );

    expect(result.branch).toBe('racketSportCrossover');
    expect(result.level).toBe(3.0);
    // Бывших сильных ракеточников не занижают: они склонны недооценивать себя.
    expect(result.appliedBias).toBe(0);
  });

  it('профиль 5: турнирный игрок — упирается в потолок анкеты', () => {
    const result = computeStartLevel(
      answers({
        padelExperience: 'moreThan4Years',
        frequency: 'fourPlusPerWeek',
        coaching: 'yearPlus',
        wallPlay: 'fastLowAndDouble',
        overhead: 'choosesUnderPressure',
        serveAndReturn: 'tactical',
        positioning: 'readsTheGame',
        competitive: 'regularTournaments',
        selfAssessment: 'advanced',
      }),
    );

    expect(result.technicalScore).toBeCloseTo(4.65, 10);
    expect(result.experienceScore).toBeCloseTo(5.1, 10);
    expect(result.rawLevel).toBeGreaterThan(QUESTIONNAIRE_CAP);
    expect(result.level).toBe(QUESTIONNAIRE_CAP);
  });
});

describe('поправки на когнитивные искажения', () => {
  it('занижает новичка: слабые игроки систематически завышают себя', () => {
    const withBias = computeStartLevel(answers({ padelExperience: 'lessThan3Months' }));
    const withoutBias = computeStartLevel(answers({ padelExperience: 'from6To12Months' }));

    expect(withBias.appliedBias).toBe(BEGINNER_BIAS);
    expect(withoutBias.appliedBias).toBe(0);
  });

  it('занижает уверенного любителя отдельной поправкой', () => {
    const modest = computeStartLevel(
      answers({ padelExperience: 'from1To2Years', selfAssessment: 'beginner' }),
    );
    const confident = computeStartLevel(
      answers({ padelExperience: 'from1To2Years', selfAssessment: 'confidentIntermediate' }),
    );

    expect(modest.appliedBias).toBe(0);
    expect(confident.appliedBias).toBe(CONFIDENT_AMATEUR_BIAS);
  });

  it('не занижает бывшего сильного ракеточника', () => {
    const result = computeStartLevel(
      answers({
        padelExperience: 'lessThan3Months',
        racketBackground: 'competitive',
        selfAssessment: 'confidentIntermediate',
      }),
    );

    expect(result.appliedBias).toBe(0);
    expect(result.level).toBeGreaterThanOrEqual(CROSSOVER_FLOOR);
    expect(result.level).toBeLessThanOrEqual(CROSSOVER_CAP);
  });

  it('держит бывшего ракеточника в коридоре при любой технике', () => {
    const clueless = computeStartLevel(
      answers({
        padelExperience: 'never',
        racketBackground: 'professional',
        wallPlay: 'lost',
        overhead: 'none',
        serveAndReturn: 'weak',
        positioning: 'unaware',
        selfAssessment: 'completeBeginner',
      }),
    );
    const boastful = computeStartLevel(
      answers({
        padelExperience: 'lessThan3Months',
        racketBackground: 'professional',
        wallPlay: 'fastLowAndDouble',
        overhead: 'choosesUnderPressure',
        serveAndReturn: 'tactical',
        positioning: 'readsTheGame',
        selfAssessment: 'advanced',
      }),
    );

    expect(clueless.level).toBe(CROSSOVER_FLOOR);
    expect(boastful.level).toBe(CROSSOVER_CAP);
  });
});

describe('детектор завышения', () => {
  it('отбрасывает вклад самооценки, если она сильно выше расчётной базы', () => {
    const result = computeStartLevel(
      answers({
        wallPlay: 'lost',
        overhead: 'none',
        serveAndReturn: 'weak',
        positioning: 'unaware',
        selfAssessment: 'advanced',
      }),
    );

    expect(result.selfAssessmentInflated).toBe(true);
    // Вклад Q10 отброшен, поэтому и добавка, и связанное с ней занижение сняты.
    expect(result.appliedBias).toBe(BEGINNER_BIAS);
  });

  it('не срабатывает, когда самооценка согласуется с ответами', () => {
    const result = computeStartLevel(
      answers({
        padelExperience: 'from2To4Years',
        wallPlay: 'anglesAndSideWall',
        overhead: 'stableBandeja',
        serveAndReturn: 'directional',
        positioning: 'movesWithPartner',
        selfAssessment: 'confidentIntermediate',
      }),
    );

    expect(result.selfAssessmentInflated).toBe(false);
  });

  it('завышенная самооценка не выгоднее честной', () => {
    const base = {
      padelExperience: 'from1To2Years',
      wallPlay: 'mediumConfident',
      overhead: 'unstableBandeja',
      serveAndReturn: 'inPlay',
      positioning: 'basic',
    } as const;

    const honest = computeStartLevel(answers({ ...base, selfAssessment: 'beginner' }));
    const inflated = computeStartLevel(answers({ ...base, selfAssessment: 'advanced' }));

    expect(inflated.level).toBeLessThanOrEqual(honest.level);
  });
});

describe('границы и форма результата', () => {
  it('никогда не выходит за 0…5', () => {
    const lowest = computeStartLevel(
      answers({
        padelExperience: 'lessThan3Months',
        frequency: 'irregular',
        wallPlay: 'lost',
        overhead: 'none',
        serveAndReturn: 'weak',
        positioning: 'unaware',
        selfAssessment: 'completeBeginner',
      }),
    );

    expect(lowest.level).toBeGreaterThanOrEqual(0);
    expect(lowest.level).toBeLessThanOrEqual(QUESTIONNAIRE_CAP);
  });

  it('округляет до шага 0.25 — точность до сотых была бы ложной', () => {
    const levels = new Set<number>();
    for (const experience of ['from6To12Months', 'from1To2Years', 'from2To4Years'] as const) {
      for (const wall of ['slowStraight', 'mediumConfident', 'anglesAndSideWall'] as const) {
        levels.add(computeStartLevel(answers({ padelExperience: experience, wallPlay: wall })).level);
      }
    }

    for (const level of levels) {
      expect(Math.round(level * 4) / 4).toBeCloseTo(level, 10);
    }
  });

  it('отдаёт всю раскладку — она нужна для перекалибровки весов на данных', () => {
    const result = computeStartLevel(answers());

    expect(result).toMatchObject({
      level: expect.any(Number),
      selfAssessedLevel: expect.any(Number),
      technicalScore: expect.any(Number),
      experienceScore: expect.any(Number),
      baseScore: expect.any(Number),
      rawLevel: expect.any(Number),
      branch: expect.any(String),
      appliedBias: expect.any(Number),
      selfAssessmentInflated: expect.any(Boolean),
    });
  });

  it('чистая функция: одинаковый вход даёт одинаковый результат', () => {
    expect(computeStartLevel(answers())).toEqual(computeStartLevel(answers()));
  });

  it('техника весит больше биографии', () => {
    const strongTech = computeStartLevel(
      answers({
        wallPlay: 'anglesAndSideWall',
        overhead: 'stableBandeja',
        serveAndReturn: 'directional',
        positioning: 'movesWithPartner',
      }),
    );
    const strongBio = computeStartLevel(
      answers({ padelExperience: 'from2To4Years', frequency: 'fourPlusPerWeek', coaching: 'yearPlus' }),
    );

    expect(technicalScore(answers())).toBeCloseTo(1.875, 10);
    expect(experienceScore(answers())).toBeCloseTo(1.3, 10);
    expect(strongTech.level).toBeGreaterThan(strongBio.level - 1);
  });

  it('хранит голую самооценку отдельно — для анализа сэндбэггинга', () => {
    expect(selfAssessedLevel(answers({ selfAssessment: 'strongAmateur' }))).toBe(4.0);
  });

  it('стартовая надёжность заметно ниже тренерской оценки в 50 %', () => {
    expect(questionnaireReliability()).toBe(0.2);
    expect(questionnaireReliability()).toBeLessThan(0.5);
  });
});
