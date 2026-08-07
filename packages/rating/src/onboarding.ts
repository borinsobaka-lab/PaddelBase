import { RATING_CONFIG, type RatingConfig } from './config.js';
import { clamp, roundTo } from './level.js';

/**
 * Анкета стартового уровня: 10 вопросов.
 *
 * Заменяет анкету из ТЗ §3.2 (4 вопроса, из которых главный — прямая
 * самооценка). Причина замены содержательная: прямая самооценка — худший из
 * доступных предикторов. Слабые игроки систематически завышают себя, сильные
 * занижают, и шкалу каждый понимает по-своему.
 *
 * Модель: поведенческие технические якоря (стекло, удары над головой, подача,
 * позиционирование) формируют базу; стаж, частота, тренер, другой ракеточный
 * спорт и турнирный опыт работают модификаторами; прямая самооценка входит с
 * малым весом и служит детектором завышения.
 *
 * Все числа — инженерная реконструкция под официальные описания уровней
 * Playtomic, а не опубликованный алгоритм: своего Playtomic не публикует.
 * Веса подлежат перекалибровке на собственных данных через 3–6 месяцев
 * (регрессия «анкетный балл → уровень после 20 матчей»).
 */

// --- Q1. Стаж в паделе ---
export type PadelExperience =
  | 'never'
  | 'lessThan3Months'
  | 'from3To6Months'
  | 'from6To12Months'
  | 'from1To2Years'
  | 'from2To4Years'
  | 'moreThan4Years';

const PADEL_EXPERIENCE_SCORE: Record<PadelExperience, number> = {
  never: 0.0,
  lessThan3Months: 0.5,
  from3To6Months: 1.0,
  from6To12Months: 1.5,
  from1To2Years: 2.2,
  from2To4Years: 3.0,
  moreThan4Years: 3.6,
};

// --- Q2. Частота игры ---
export type PlayFrequency =
  | 'irregular'
  | 'oneToTwoPerMonth'
  | 'weekly'
  | 'twoToThreePerWeek'
  | 'fourPlusPerWeek';

const FREQUENCY_SCORE: Record<PlayFrequency, number> = {
  irregular: 0.0,
  oneToTwoPerMonth: 0.0,
  weekly: 0.3,
  twoToThreePerWeek: 0.6,
  fourPlusPerWeek: 0.9,
};

// --- Q3. Занятия с тренером ---
export type CoachingExperience = 'none' | 'fewSessions' | 'monthsRegular' | 'yearPlus';

const COACHING_SCORE: Record<CoachingExperience, number> = {
  none: 0.0,
  fewSessions: 0.2,
  monthsRegular: 0.4,
  yearPlus: 0.6,
};

// --- Q4. Другой ракеточный спорт ---
export type RacketBackground = 'none' | 'amateur' | 'intermediate' | 'competitive' | 'professional';

const RACKET_BACKGROUND_SCORE: Record<RacketBackground, number> = {
  none: 0.0,
  amateur: 0.3,
  intermediate: 0.6,
  competitive: 1.0,
  professional: 1.4,
};

// --- Q5. Игра от стекла ---
export type WallPlay =
  | 'lost'
  | 'slowStraight'
  | 'mediumConfident'
  | 'anglesAndSideWall'
  | 'fastLowAndDouble';

const WALL_PLAY_SCORE: Record<WallPlay, number> = {
  lost: 0.0,
  slowStraight: 1.5,
  mediumConfident: 2.5,
  anglesAndSideWall: 3.5,
  fastLowAndDouble: 4.5,
};

// --- Q6. Удары над головой ---
export type OverheadPlay =
  | 'none'
  | 'uncontrolledSmash'
  | 'unstableBandeja'
  | 'stableBandeja'
  | 'choosesUnderPressure';

const OVERHEAD_SCORE: Record<OverheadPlay, number> = {
  none: 0.0,
  uncontrolledSmash: 1.5,
  unstableBandeja: 2.8,
  stableBandeja: 3.8,
  choosesUnderPressure: 4.8,
};

// --- Q7. Подача и приём ---
export type ServeAndReturn = 'weak' | 'inPlay' | 'directional' | 'tactical';

const SERVE_RETURN_SCORE: Record<ServeAndReturn, number> = {
  weak: 1.0,
  inPlay: 2.5,
  directional: 3.5,
  tactical: 4.5,
};

// --- Q8. Позиционирование и тактика ---
export type Positioning = 'unaware' | 'basic' | 'movesWithPartner' | 'readsTheGame';

const POSITIONING_SCORE: Record<Positioning, number> = {
  unaware: 0.5,
  basic: 2.0,
  movesWithPartner: 3.5,
  readsTheGame: 4.8,
};

// --- Q9. Соревновательный опыт ---
export type CompetitiveExperience = 'none' | 'friendly' | 'amateurLeagues' | 'regularTournaments';

const COMPETITIVE_SCORE: Record<CompetitiveExperience, number> = {
  none: 0.0,
  friendly: 0.0,
  amateurLeagues: 0.3,
  regularTournaments: 0.6,
};

// --- Q10. Прямая самооценка ---
export type SelfAssessment =
  | 'completeBeginner'
  | 'beginner'
  | 'confidentIntermediate'
  | 'strongAmateur'
  | 'advanced';

const SELF_ASSESSMENT_SCORE: Record<SelfAssessment, number> = {
  completeBeginner: 0.5,
  beginner: 1.5,
  confidentIntermediate: 3.0,
  strongAmateur: 4.0,
  advanced: 5.0,
};

export interface OnboardingAnswers {
  padelExperience: PadelExperience;
  frequency: PlayFrequency;
  coaching: CoachingExperience;
  racketBackground: RacketBackground;
  wallPlay: WallPlay;
  overhead: OverheadPlay;
  serveAndReturn: ServeAndReturn;
  positioning: Positioning;
  competitive: CompetitiveExperience;
  selfAssessment: SelfAssessment;
}

// --- Константы модели ---

/** Вес технических якорей против биографии: техника предсказательнее. */
export const TECHNICAL_WEIGHT = 0.6;
/** Вес прямой самооценки: она входит как sanity-check, а не как основа. */
export const SELF_ASSESSMENT_WEIGHT = 0.15;

/** Компенсация эффекта Даннинга—Крюгера у новичков: слабые завышают себя. */
export const BEGINNER_BIAS = -0.3;
/**
 * Та же компенсация для «уверенных любителей». Отдельная константа, потому что
 * это другой профиль: у новичка завышена вся картина мира, у любителя со стажем
 * — только представление о собственном уровне.
 */
export const CONFIDENT_AMATEUR_BIAS = -0.5;

/** Насколько самооценка должна превышать расчётную базу, чтобы счесть её завышенной. */
export const INFLATION_THRESHOLD = 1.5;

/** Коридор для бывших сильных ракеточников без падел-стажа. */
export const CROSSOVER_FLOOR = 2.5;
export const CROSSOVER_CAP = 3.5;

/** Уровень полного новичка. */
export const COMPLETE_BEGINNER_LEVEL = 0.5;

/**
 * Потолок анкеты. Выше — только через сыгранные матчи: заявленный высокий
 * уровень ничем не подтверждён, а ошибка наверху шкалы дороже всего.
 */
export const QUESTIONNAIRE_CAP = 5.0;

/** Шаг отображения уровня у Playtomic. Анкета — грубая оценка, точность до сотых была бы ложной. */
export const START_LEVEL_STEP = 0.25;

/** Стаж, ниже которого игрок считается новичком в паделе. */
const SHORT_PADEL_EXPERIENCE: readonly PadelExperience[] = [
  'never',
  'lessThan3Months',
  'from3To6Months',
];

export type StartLevelBranch = 'completeBeginner' | 'racketSportCrossover' | 'standard';

export interface StartLevelResult {
  /** Итоговый стартовый уровень, округлённый до 0.25. */
  level: number;
  /** Голая самооценка — хранится отдельно для анализа сэндбэггинга. */
  selfAssessedLevel: number;
  /** Средний балл технических якорей Q5–Q8. */
  technicalScore: number;
  /** Стаж + частота + тренер. */
  experienceScore: number;
  /** Взвешенная комбинация техники и опыта. */
  baseScore: number;
  /** Значение до ограничений и округления. */
  rawLevel: number;
  branch: StartLevelBranch;
  appliedBias: number;
  /**
   * Самооценка сильно выше расчётной базы. Её вклад отброшен, а профиль
   * помечен: это материал для антисэндбэггинг-аналитики.
   */
  selfAssessmentInflated: boolean;
}

function roundToStep(value: number): number {
  return roundTo(Math.round(value / START_LEVEL_STEP) * START_LEVEL_STEP, 3);
}

export function selfAssessedLevel(answers: OnboardingAnswers): number {
  return SELF_ASSESSMENT_SCORE[answers.selfAssessment];
}

/** Средний балл технических якорей — самая предсказательная часть анкеты. */
export function technicalScore(answers: OnboardingAnswers): number {
  return (
    (WALL_PLAY_SCORE[answers.wallPlay] +
      OVERHEAD_SCORE[answers.overhead] +
      SERVE_RETURN_SCORE[answers.serveAndReturn] +
      POSITIONING_SCORE[answers.positioning]) /
    4
  );
}

export function experienceScore(answers: OnboardingAnswers): number {
  return (
    PADEL_EXPERIENCE_SCORE[answers.padelExperience] +
    FREQUENCY_SCORE[answers.frequency] +
    COACHING_SCORE[answers.coaching]
  );
}

/**
 * Стартовый уровень по анкете.
 *
 * Возвращает не только число, но и всю раскладку: она сохраняется вместе с
 * ответами и нужна для перекалибровки весов на реальных данных и для разбора
 * спорных случаев. Без неё через полгода будет невозможно понять, почему у
 * конкретного игрока получился именно такой старт.
 */
export function computeStartLevel(answers: OnboardingAnswers): StartLevelResult {
  const tech = technicalScore(answers);
  const exp = experienceScore(answers);
  const base = TECHNICAL_WEIGHT * tech + (1 - TECHNICAL_WEIGHT) * exp;
  const self = selfAssessedLevel(answers);

  const racketScore = RACKET_BACKGROUND_SCORE[answers.racketBackground];
  const competitiveScore = COMPETITIVE_SCORE[answers.competitive];

  // Детектор завышения: самооценка сравнивается с базой, а не с итогом,
  // потому что итог она сама же и формирует.
  const inflated = self > base + INFLATION_THRESHOLD;
  const selfContribution = inflated ? 0 : SELF_ASSESSMENT_WEIGHT * self;

  const shortPadelExperience = SHORT_PADEL_EXPERIENCE.includes(answers.padelExperience);
  const strongRacketBackground = racketScore >= RACKET_BACKGROUND_SCORE.competitive;

  const shared = {
    selfAssessedLevel: self,
    technicalScore: tech,
    experienceScore: exp,
    baseScore: base,
    selfAssessmentInflated: inflated,
  };

  // Бывший сильный ракеточник без падел-стажа: удары, ноги и глаз переносятся,
  // а стекло, подача снизу и позиционирование — нет. Занижать его не нужно:
  // сильные игроки склонны себя недооценивать, а не переоценивать.
  //
  // Детектор завышения здесь отключён намеренно. Он сравнивает самооценку с
  // расчётной базой, а у такого игрока база занижена по построению — он ещё не
  // играл в падел. Срабатывание было бы систематическим ложноположительным и
  // засоряло бы антисэндбэггинг-аналитику. Границы коридора и так не дают
  // самооценке вытянуть уровень.
  if (strongRacketBackground && shortPadelExperience) {
    const raw = base + racketScore + competitiveScore + SELF_ASSESSMENT_WEIGHT * self;
    return {
      ...shared,
      selfAssessmentInflated: false,
      rawLevel: raw,
      level: roundToStep(clamp(raw, CROSSOVER_FLOOR, CROSSOVER_CAP)),
      branch: 'racketSportCrossover',
      appliedBias: 0,
    };
  }

  // Никогда не играл и без ракеточного прошлого: технические якоря заполнены
  // наугад и смысла не несут.
  if (answers.padelExperience === 'never') {
    return {
      ...shared,
      rawLevel: COMPLETE_BEGINNER_LEVEL,
      level: COMPLETE_BEGINNER_LEVEL,
      branch: 'completeBeginner',
      appliedBias: 0,
    };
  }

  let bias = 0;
  if (shortPadelExperience && racketScore <= RACKET_BACKGROUND_SCORE.amateur) {
    bias += BEGINNER_BIAS;
  }
  // Занижение по самооценке применяется только если она вообще учтена: если
  // детектор уже отбросил её вклад, штрафовать вдобавок было бы двойным счётом.
  if (!inflated && self >= SELF_ASSESSMENT_SCORE.confidentIntermediate) {
    bias += CONFIDENT_AMATEUR_BIAS;
  }

  const raw = base + racketScore + competitiveScore + selfContribution + bias;

  return {
    ...shared,
    rawLevel: raw,
    level: roundToStep(clamp(raw, 0, QUESTIONNAIRE_CAP)),
    branch: 'standard',
    appliedBias: bias,
  };
}

/**
 * Надёжность анкетного уровня.
 *
 * Ориентир — Playtomic: очная оценка тренером в сертифицированном клубе даёт
 * ровно 50 %, значит неверифицированная анкета должна давать заметно меньше.
 * При таком значении первые матчи двигают уровень крупно, и к 15–20 матчам
 * анкета полностью уступает место реальным результатам.
 */
export function questionnaireReliability(config: RatingConfig = RATING_CONFIG): number {
  return config.INITIAL_RELIABILITY;
}
