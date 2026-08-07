import {
  computeStartLevel,
  initialReliability,
  type OnboardingAnswers,
} from '@paddelbase/rating';
import { PrismaClient } from '@prisma/client';

import { toLevelDecimal } from '../src/decimal.js';
import { toJson } from '../src/json.js';
import { DEFAULT_COURTS } from './courts.js';

const prisma = new PrismaClient();

interface SeedPlayer {
  name: string;
  answers: OnboardingAnswers;
}

/** Профили подобраны так, чтобы покрыть все ветки расчёта стартового уровня. */
const TEST_PLAYERS: SeedPlayer[] = [
  {
    name: 'Тест Новичок',
    answers: {
      padelExperience: 'never',
      frequency: 'irregular',
      coaching: 'none',
      racketBackground: 'none',
      wallPlay: 'lost',
      overhead: 'none',
      serveAndReturn: 'weak',
      positioning: 'unaware',
      competitive: 'none',
      selfAssessment: 'completeBeginner',
    },
  },
  {
    name: 'Тест Полгода',
    answers: {
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
    },
  },
  {
    name: 'Тест Средний',
    answers: {
      padelExperience: 'from1To2Years',
      frequency: 'weekly',
      coaching: 'fewSessions',
      racketBackground: 'amateur',
      wallPlay: 'mediumConfident',
      overhead: 'unstableBandeja',
      serveAndReturn: 'inPlay',
      positioning: 'basic',
      competitive: 'friendly',
      selfAssessment: 'beginner',
    },
  },
  {
    name: 'Тест Уверенный',
    answers: {
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
    },
  },
  {
    name: 'Тест Турнирный',
    answers: {
      padelExperience: 'moreThan4Years',
      frequency: 'fourPlusPerWeek',
      coaching: 'yearPlus',
      racketBackground: 'intermediate',
      wallPlay: 'fastLowAndDouble',
      overhead: 'choosesUnderPressure',
      serveAndReturn: 'tactical',
      positioning: 'readsTheGame',
      competitive: 'regularTournaments',
      selfAssessment: 'advanced',
    },
  },
  {
    name: 'Тест Теннисист',
    answers: {
      padelExperience: 'lessThan3Months',
      frequency: 'weekly',
      coaching: 'none',
      racketBackground: 'professional',
      wallPlay: 'lost',
      overhead: 'uncontrolledSmash',
      serveAndReturn: 'inPlay',
      positioning: 'basic',
      competitive: 'none',
      selfAssessment: 'confidentIntermediate',
    },
  },
  {
    name: 'Тест Скромный',
    answers: {
      padelExperience: 'from2To4Years',
      frequency: 'twoToThreePerWeek',
      coaching: 'monthsRegular',
      racketBackground: 'intermediate',
      wallPlay: 'anglesAndSideWall',
      overhead: 'stableBandeja',
      serveAndReturn: 'directional',
      positioning: 'movesWithPartner',
      competitive: 'amateurLeagues',
      selfAssessment: 'beginner',
    },
  },
  {
    name: 'Тест Хвастун',
    answers: {
      padelExperience: 'from3To6Months',
      frequency: 'oneToTwoPerMonth',
      coaching: 'none',
      racketBackground: 'none',
      wallPlay: 'slowStraight',
      overhead: 'none',
      serveAndReturn: 'weak',
      positioning: 'unaware',
      competitive: 'none',
      selfAssessment: 'advanced',
    },
  },
];

async function main(): Promise<void> {
  // Upsert по паре «название + город»: повторный запуск сида обновляет
  // справочник, а не плодит дубликаты.
  for (const court of DEFAULT_COURTS) {
    const existing = await prisma.court.findFirst({
      where: { name: court.name, city: court.city },
    });

    if (existing) {
      await prisma.court.update({ where: { id: existing.id }, data: court });
    } else {
      await prisma.court.create({ data: court });
    }
  }

  for (const player of TEST_PLAYERS) {
    const [firstName, ...rest] = player.name.split(' ');
    const lastName = rest.join(' ');

    // Стартовый уровень считается тем же кодом, что и в проде: seed не должен
    // расходиться с боевой формулой, иначе тестовые данные врут.
    const result = computeStartLevel(player.answers);

    const existing = await prisma.user.findFirst({ where: { firstName: firstName!, lastName } });
    if (existing) continue;

    await prisma.user.create({
      data: {
        firstName: firstName!,
        lastName,
        city: 'Тбилиси',
        level: toLevelDecimal(result.level),
        startLevel: toLevelDecimal(result.level),
        // Голая самооценка, БЕЗ надбавок за опыт: это разные величины,
        // и путать их нельзя — на их расхождении строится анализ сэндбэггинга.
        selfAssessedLevel: toLevelDecimal(result.selfAssessedLevel),
        onboardingAnswers: toJson(player.answers),
        startLevelBreakdown: toJson(result),
        selfAssessmentInflated: result.selfAssessmentInflated,
        onboardingCompletedAt: new Date(0),
        reliabilityBase: toLevelDecimal(initialReliability()),
        reliability: toLevelDecimal(initialReliability()),
      },
    });
  }

  const courts = await prisma.court.count();
  const users = await prisma.user.count();
  console.log(`Готово: кортов ${courts}, пользователей ${users}.`);
  console.log('Напоминание: справочник кортов временный — заменить на реальные клубы до запуска.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
