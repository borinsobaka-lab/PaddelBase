import { PrismaClient } from '@paddelbase/db';
import { RATING_CONFIG, RATING_CONFIG_VERSION } from '@paddelbase/rating';

import { recomputeRatings } from '../recompute.js';

/**
 * CLI полного пересчёта рейтинга (ТЗ §3.10).
 *
 *   pnpm rating:recompute --dry-run
 *   pnpm rating:recompute --from=2026-08-01
 *   pnpm rating:recompute
 *
 * Пересчёт идёт в одной транзакции: либо переписывается вся история, либо
 * не меняется ничего.
 */
function parseArgs(argv: readonly string[]): { from?: Date; dryRun: boolean } {
  const dryRun = argv.includes('--dry-run');
  const fromArg = argv.find((arg) => arg.startsWith('--from='));

  if (!fromArg) return { dryRun };

  const raw = fromArg.slice('--from='.length);
  const from = new Date(raw);
  if (Number.isNaN(from.getTime())) {
    throw new Error(`Не разобрать дату «${raw}». Ожидается ISO-формат, например 2026-08-01`);
  }

  return { from, dryRun };
}

async function main(): Promise<void> {
  const { from, dryRun } = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  console.log(
    [
      `Пересчёт рейтинга${dryRun ? ' (dry run, записи не будет)' : ''}`,
      `Версия конфига: ${RATING_CONFIG_VERSION}`,
      `D = ${RATING_CONFIG.D}, W_WIN = ${RATING_CONFIG.W_WIN}, K = ${RATING_CONFIG.K_MIN}…${RATING_CONFIG.K_MAX}`,
      from ? `С даты: ${from.toISOString()}` : 'Вся история',
      '',
    ].join('\n'),
  );

  try {
    const started = Date.now();
    const summary = await recomputeRatings(prisma, {
      ...(from ? { from } : {}),
      ...(dryRun ? { dryRun } : {}),
    });

    console.log(`Матчей прогнано:      ${summary.matchesReplayed}`);
    console.log(`Турниров прогнано:    ${summary.tournamentsReplayed}`);
    console.log(`Событий записано:     ${summary.eventsWritten}`);
    console.log(`Игроков затронуто:    ${summary.playersTouched}`);
    console.log(`Максимальный сдвиг:   ${summary.maxLevelShift.toFixed(3)}`);

    if (summary.skipped.length > 0) {
      console.log(`\nНе зачтено матчей: ${summary.skipped.length}`);
      const byReason = new Map<string, number>();
      for (const skip of summary.skipped) {
        byReason.set(skip.reason, (byReason.get(skip.reason) ?? 0) + 1);
      }
      for (const [reason, count] of byReason) console.log(`  ${reason}: ${count}`);
    }

    console.log(`\nГотово за ${((Date.now() - started) / 1000).toFixed(1)} с`);

    if (dryRun) {
      console.log('Изменения откачены: это был dry run.');
    } else if (summary.maxLevelShift > 0.5) {
      console.log(
        '\nВНИМАНИЕ: уровни сдвинулись более чем на 0.5. Стоит убедиться, что это ожидаемо,',
      );
      console.log('и предупредить игроков — рейтинг у них изменится заметно.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
