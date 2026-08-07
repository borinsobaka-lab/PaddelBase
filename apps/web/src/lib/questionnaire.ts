import type { OnboardingAnswers } from '@paddelbase/rating';

/**
 * Тексты анкеты стартового уровня.
 *
 * Ключи вариантов типизированы против OnboardingAnswers: опечатка или
 * переименование в движке ломает сборку здесь, а не молча даёт неверный
 * уровень.
 *
 * Все строки собраны в одном файле — когда дойдём до английского и грузинского
 * (ТЗ §2), извлекать в словарь придётся только его.
 */
export interface Question<K extends keyof OnboardingAnswers = keyof OnboardingAnswers> {
  key: K;
  title: string;
  hint?: string;
  options: { value: OnboardingAnswers[K]; label: string }[];
}

function question<K extends keyof OnboardingAnswers>(definition: Question<K>): Question<K> {
  return definition;
}

export const QUESTIONS = [
  question({
    key: 'padelExperience',
    title: 'Как давно вы играете в падел?',
    options: [
      { value: 'never', label: 'Никогда не играл или пробовал пару раз' },
      { value: 'lessThan3Months', label: 'Меньше 3 месяцев' },
      { value: 'from3To6Months', label: '3–6 месяцев' },
      { value: 'from6To12Months', label: '6–12 месяцев' },
      { value: 'from1To2Years', label: '1–2 года' },
      { value: 'from2To4Years', label: '2–4 года' },
      { value: 'moreThan4Years', label: 'Больше 4 лет' },
    ],
  }),
  question({
    key: 'frequency',
    title: 'Как часто вы играете сейчас?',
    options: [
      { value: 'irregular', label: 'Нерегулярно' },
      { value: 'oneToTwoPerMonth', label: '1–2 раза в месяц' },
      { value: 'weekly', label: 'Примерно раз в неделю' },
      { value: 'twoToThreePerWeek', label: '2–3 раза в неделю' },
      { value: 'fourPlusPerWeek', label: '4 раза в неделю и чаще' },
    ],
  }),
  question({
    key: 'coaching',
    title: 'Занимались ли вы с тренером по паделу?',
    options: [
      { value: 'none', label: 'Нет, никогда' },
      { value: 'fewSessions', label: 'Несколько разовых занятий' },
      { value: 'monthsRegular', label: 'Регулярно несколько месяцев' },
      { value: 'yearPlus', label: 'Регулярно больше года' },
    ],
  }),
  question({
    key: 'racketBackground',
    title: 'Играли ли вы в другой ракеточный вид спорта?',
    hint: 'Теннис, сквош, бадминтон, настольный теннис, пиклбол',
    options: [
      { value: 'none', label: 'Нет' },
      { value: 'amateur', label: 'Любительски, иногда' },
      { value: 'intermediate', label: 'Регулярно, на среднем уровне' },
      { value: 'competitive', label: 'На соревновательном уровне: клуб, лига, турниры' },
      { value: 'professional', label: 'Профессионально или полупрофессионально' },
    ],
  }),
  question({
    key: 'wallPlay',
    title: 'Как вы играете у задней стенки?',
    hint: 'Самый показательный вопрос анкеты: работа со стеклом отличает падел от тенниса',
    options: [
      { value: 'lost', label: 'Теряюсь, не понимаю, как играть от стекла' },
      { value: 'slowStraight', label: 'Возвращаю только медленные прямые отскоки' },
      { value: 'mediumConfident', label: 'Уверенно играю средние отскоки от задней стенки' },
      { value: 'anglesAndSideWall', label: 'Справляюсь с углами и боковым стеклом' },
      { value: 'fastLowAndDouble', label: 'Уверенно играю быстрые низкие и угловые, двойное стекло' },
    ],
  }),
  question({
    key: 'overhead',
    title: 'Удары над головой: бандеха, вибора, смэш',
    options: [
      { value: 'none', label: 'Не бью над головой или не знаю, что это' },
      { value: 'uncontrolledSmash', label: 'Пробую смэш, но без контроля' },
      { value: 'unstableBandeja', label: 'Делаю бандеху, но нестабильно' },
      { value: 'stableBandeja', label: 'Стабильная бандеха, пробую вибору' },
      { value: 'choosesUnderPressure', label: 'Уверенно выбираю удар под давлением' },
    ],
  }),
  question({
    key: 'serveAndReturn',
    title: 'Подача и приём',
    options: [
      { value: 'weak', label: 'Подаю снизу, часто ошибаюсь; приём нестабилен' },
      { value: 'inPlay', label: 'Стабильно ввожу мяч, но без контроля глубины' },
      { value: 'directional', label: 'Контролирую направление подачи и приёма' },
      { value: 'tactical', label: 'Подаю тактически, приём агрессивный, ошибаюсь редко' },
    ],
  }),
  question({
    key: 'positioning',
    title: 'Позиционирование и тактика в паре',
    options: [
      { value: 'unaware', label: 'Не знаю, где стоять' },
      { value: 'basic', label: 'Знаю базовые позиции, но часто оказываюсь не на месте' },
      { value: 'movesWithPartner', label: 'Двигаюсь с партнёром, понимаю, когда атаковать' },
      { value: 'readsTheGame', label: 'Читаю игру и ищу слабое место соперника' },
    ],
  }),
  question({
    key: 'competitive',
    title: 'Соревновательный опыт в паделе',
    options: [
      { value: 'none', label: 'Не играл матчей на счёт' },
      { value: 'friendly', label: 'Играю дружеские матчи на счёт' },
      { value: 'amateurLeagues', label: 'Играл в любительских лигах и клубных турнирах' },
      { value: 'regularTournaments', label: 'Регулярно играю турниры, есть категория' },
    ],
  }),
  question({
    key: 'selfAssessment',
    title: 'Как бы вы сами оценили свой уровень?',
    hint: 'Этот ответ влияет на результат меньше остальных — он служит проверкой',
    options: [
      { value: 'completeBeginner', label: 'Полный новичок' },
      { value: 'beginner', label: 'Начинающий' },
      { value: 'confidentIntermediate', label: 'Уверенный любитель среднего уровня' },
      { value: 'strongAmateur', label: 'Сильный любитель' },
      { value: 'advanced', label: 'Продвинутый, соревновательный' },
    ],
  }),
] as const satisfies readonly Question[];

/** Разбор ответов формы. Неизвестный ключ означает подделанный запрос. */
export function parseAnswers(formData: FormData): OnboardingAnswers {
  const answers: Partial<Record<keyof OnboardingAnswers, string>> = {};

  for (const item of QUESTIONS) {
    const value = formData.get(item.key);
    if (typeof value !== 'string') {
      throw new Error(`Не отвечен вопрос: ${item.title}`);
    }
    if (!item.options.some((option) => option.value === value)) {
      throw new Error(`Неизвестный вариант ответа в вопросе: ${item.title}`);
    }
    answers[item.key] = value;
  }

  return answers as unknown as OnboardingAnswers;
}
