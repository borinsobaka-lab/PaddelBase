import { toJson, toLevelDecimal, type PrismaClient } from '@paddelbase/db';
import {
  computeStartLevel,
  initialReliability,
  type OnboardingAnswers,
  type RatingConfig,
  type StartLevelResult,
} from '@paddelbase/rating';

/**
 * Прохождение анкеты и вход по имени.
 *
 * Вход по имени — временное решение на время тестирования: он никого не
 * аутентифицирует, любой может представиться кем угодно. Вся логика спрятана за
 * одной функцией, чтобы при переходе на Telegram, Google или что-то ещё
 * менялась только она, а экраны остались нетронутыми.
 */

export class OnboardingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OnboardingError';
  }
}

export const MAX_NAME_LENGTH = 60;

export interface SignInResult {
  userId: string;
  isNew: boolean;
  needsOnboarding: boolean;
}

/**
 * Вход по имени: находит игрока с таким именем либо заводит нового.
 *
 * ВРЕМЕННО. Совпадение имён означает вход в чужой профиль — на этапе
 * тестирования это принято сознательно.
 */
export async function signInByName(
  prisma: PrismaClient,
  input: { name: string; city?: string },
): Promise<SignInResult> {
  const name = input.name.trim().replace(/\s+/g, ' ');

  if (name.length === 0) throw new OnboardingError('Введите имя');
  if (name.length > MAX_NAME_LENGTH) {
    throw new OnboardingError(`Имя не длиннее ${MAX_NAME_LENGTH} символов`);
  }

  const [firstName, ...restOfName] = name.split(' ');
  const lastName = restOfName.join(' ');

  const existing = await prisma.user.findFirst({
    where: {
      firstName: { equals: firstName!, mode: 'insensitive' },
      lastName: lastName === '' ? null : { equals: lastName, mode: 'insensitive' },
    },
  });

  if (existing) {
    return {
      userId: existing.id,
      isNew: false,
      needsOnboarding: existing.onboardingCompletedAt === null,
    };
  }

  // Уровень до анкеты — заведомо неизвестен. Ставим середину шкалы и не
  // показываем его: пока анкета не пройдена, приложение ведёт игрока в неё.
  const created = await prisma.user.create({
    data: {
      firstName: firstName!,
      ...(lastName === '' ? {} : { lastName }),
      ...(input.city === undefined ? {} : { city: input.city }),
      level: toLevelDecimal(3.0),
      startLevel: toLevelDecimal(3.0),
      selfAssessedLevel: toLevelDecimal(3.0),
      reliabilityBase: toLevelDecimal(initialReliability()),
      reliability: toLevelDecimal(initialReliability()),
    },
  });

  return { userId: created.id, isNew: true, needsOnboarding: true };
}

/**
 * Сохранение анкеты и расчёт стартового уровня.
 *
 * Анкета проходится один раз: после первого рейтингового матча уровень
 * определяют результаты, и переписать старт означало бы стереть историю
 * (ТЗ §5.6). Раскладка расчёта сохраняется целиком — без неё через полгода
 * будет невозможно ни перекалибровать веса, ни разобрать спорный случай.
 */
export async function completeOnboarding(
  prisma: PrismaClient,
  input: {
    userId: string;
    answers: OnboardingAnswers;
    now: Date;
    config?: RatingConfig;
  },
): Promise<StartLevelResult> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: input.userId } });
    if (!user) throw new OnboardingError('Игрок не найден');

    if (user.ratedMatchesCount > 0) {
      throw new OnboardingError(
        'Анкету можно заполнить только до первого рейтингового матча — дальше уровень определяют результаты',
      );
    }

    const result = computeStartLevel(input.answers);
    const reliability = initialReliability(input.config);

    await tx.user.update({
      where: { id: user.id },
      data: {
        level: toLevelDecimal(result.level),
        startLevel: toLevelDecimal(result.level),
        selfAssessedLevel: toLevelDecimal(result.selfAssessedLevel),
        onboardingAnswers: toJson(input.answers),
        startLevelBreakdown: toJson(result),
        selfAssessmentInflated: result.selfAssessmentInflated,
        onboardingCompletedAt: input.now,
        reliabilityBase: toLevelDecimal(reliability),
        reliability: toLevelDecimal(reliability),
      },
    });

    return result;
  });
}

export interface PlayerProfile {
  id: string;
  name: string;
  city: string | null;
  role: string;
  level: number;
  reliability: number;
  ratedMatchesCount: number;
  onboardingCompleted: boolean;
  createdAt: Date;
}

export function fullName(user: { firstName: string; lastName: string | null }): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ');
}
