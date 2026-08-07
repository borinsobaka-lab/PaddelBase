import { PrismaClient } from '@paddelbase/db';

import { collectRatingMetrics, formatMetrics } from '../metrics.js';

/**
 * Отчёт по метрикам ТЗ §12.
 *
 *   pnpm rating:metrics
 *   pnpm rating:metrics --from=2026-06-01
 *   pnpm rating:metrics --json
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const fromArg = argv.find((arg) => arg.startsWith('--from='));
  const asJson = argv.includes('--json');

  const from = fromArg ? new Date(fromArg.slice('--from='.length)) : undefined;
  if (from && Number.isNaN(from.getTime())) {
    throw new Error(`Не разобрать дату «${fromArg}». Ожидается ISO-формат, например 2026-06-01`);
  }

  const prisma = new PrismaClient();

  try {
    const metrics = await collectRatingMetrics(prisma, {
      now: new Date(),
      ...(from ? { from } : {}),
    });

    console.log(asJson ? JSON.stringify(metrics, null, 2) : formatMetrics(metrics));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
