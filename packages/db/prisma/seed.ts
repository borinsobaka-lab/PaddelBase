import {
  computeStartLevel,
  initialReliability,
  selfAssessedLevel as computeSelfAssessedLevel,
  type OnboardingAnswers,
} from '@paddelbase/rating';
import { PrismaClient } from '@prisma/client';

import { toLevelDecimal } from '../src/decimal.js';
import { toJson } from '../src/json.js';

const prisma = new PrismaClient();

/**
 * ВНИМАНИЕ: корты ниже — заглушки для локальной разработки, а не реальные клубы.
 *
 * Настоящий справочник кортов Грузии нужно собрать отдельно (название, адрес,
 * координаты, число кортов) и загрузить либо через админку, либо отдельным
 * импортом. Выдумывать названия и адреса клубов здесь нельзя: они попадут в
 * интерфейс и будут выглядеть как достоверные данные.
 */
const PLACEHOLDER_COURTS = [
  { name: 'Клуб 1 (заглушка)', city: 'Тбилиси', address: 'Адрес не заполнен', courtsQty: 4 },
  { name: 'Клуб 2 (заглушка)', city: 'Тбилиси', address: 'Адрес не заполнен', courtsQty: 2 },
  { name: 'Клуб 3 (заглушка)', city: 'Батуми', address: 'Адрес не заполнен', courtsQty: 3 },
];

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
  for (const court of PLACEHOLDER_COURTS) {
    const existing = await prisma.court.findFirst({ where: { name: court.name } });
    if (existing) continue;
    await prisma.court.create({ data: court });
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
  console.log('Напоминание: справочник кортов заполнен заглушками, реальные данные нужно загрузить отдельно.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
