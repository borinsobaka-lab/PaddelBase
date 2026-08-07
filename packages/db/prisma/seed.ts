import {
  computeStartLevel,
  initialReliability,
  selfAssessedLevel as computeSelfAssessedLevel,
  type OnboardingAnswers,
} from '@paddelbase/rating';
import { PrismaClient } from '@prisma/client';

import { toLevelDecimal } from '../src/decimal.js';
import { toJson } from '../src/json.js';
import { DEFAULT_COURTS } from './courts.js';

const prisma = new PrismaClient();

interface SeedPlayer {
  firstName: string;
  lastName: string;
  answers: OnboardingAnswers;
}

const TEST_PLAYERS: SeedPlayer[] = [
  {
    firstName: 'Тест',
    lastName: 'Новичок',
    answers: {
      padelExperience: 'none',
      racketExperience: 'none',
      frequency: 'lessThanMonthly',
      selfAssessment: 'beginner',
    },
  },
  {
    firstName: 'Тест',
    lastName: 'Начинающий',
    answers: {
      padelExperience: 'lessThan6Months',
      racketExperience: 'amateur',
      frequency: 'oneToThreePerMonth',
      selfAssessment: 'elementary',
    },
  },
  {
    firstName: 'Тест',
    lastName: 'Средний',
    answers: {
      padelExperience: 'from6To24Months',
      racketExperience: 'amateur',
      frequency: 'oneToTwoPerWeek',
      selfAssessment: 'intermediate',
    },
  },
  {
    firstName: 'Тест',
    lastName: 'Уверенный',
    answers: {
      padelExperience: 'from6To24Months',
      racketExperience: 'confident',
      frequency: 'oneToTwoPerWeek',
      selfAssessment: 'upperIntermediate',
    },
  },
  {
    firstName: 'Тест',
    lastName: 'Продвинутый',
    answers: {
      padelExperience: 'moreThan2Years',
      racketExperience: 'confident',
      frequency: 'threePlusPerWeek',
      selfAssessment: 'advanced',
    },
  },
  {
    firstName: 'Тест',
    lastName: 'Соревновательный',
    answers: {
      padelExperience: 'moreThan2Years',
      racketExperience: 'competitive',
      frequency: 'threePlusPerWeek',
      selfAssessment: 'competitive',
    },
  },
  {
    firstName: 'Тест',
    lastName: 'Теннисист',
    answers: {
      padelExperience: 'none',
      racketExperience: 'competitive',
      frequency: 'oneToTwoPerWeek',
      selfAssessment: 'intermediate',
    },
  },
  {
    firstName: 'Тест',
    lastName: 'Возвращенец',
    answers: {
      padelExperience: 'moreThan2Years',
      racketExperience: 'amateur',
      frequency: 'lessThanMonthly',
      selfAssessment: 'upperIntermediate',
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

  for (const [index, player] of TEST_PLAYERS.entries()) {
    const telegramId = `seed-${index + 1}`;
    const startLevel = computeStartLevel(player.answers);

    // Стартовый уровень считается тем же кодом, что и в проде: seed не должен
    // расходиться с боевой формулой, иначе тестовые данные врут.
    await prisma.user.upsert({
      where: { telegramId },
      update: {},
      create: {
        telegramId,
        firstName: player.firstName,
        lastName: player.lastName,
        city: 'Тбилиси',
        level: toLevelDecimal(startLevel),
        startLevel: toLevelDecimal(startLevel),
        // Голая самооценка, БЕЗ надбавок за опыт: это разные величины,
        // и путать их нельзя — на их расхождении строится анализ сэндбэггинга.
        selfAssessedLevel: toLevelDecimal(computeSelfAssessedLevel(player.answers)),
        onboardingAnswers: toJson(player.answers),
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
