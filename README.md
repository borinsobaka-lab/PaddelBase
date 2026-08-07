# PaddelBase

Веб-приложение для организации игр в падел в Грузии: заявки на матчи, турниры
(Американо, Мексикано и их командные версии), рейтинг игроков, лента комьюнити.

Первый канал дистрибуции — Telegram Web App, вёрстка mobile-first.

## Структура репозитория

```
apps/web              — Next.js приложение              (ещё не создано)
packages/rating       — движок рейтинга, чистая логика   ✔
packages/tournament   — генераторы сеток, чистая логика  ✔
packages/db           — Prisma-схема и клиент            ✔
packages/core         — доменные операции над БД          ✔
apps/web              — Next.js приложение              (следующий шаг)
```

`packages/rating` и `packages/tournament` не импортируют ничего из `web` и `db`:
принимают простые объекты, возвращают простые объекты. Это условие
тестируемости и возможности пересчитать всю историю рейтинга при изменении
формулы.

## Команды

```bash
pnpm install
pnpm test         # все пакеты
pnpm typecheck
```

Часть тестов `packages/core` работает против настоящего PostgreSQL — логика
опирается на транзакции и запросы по связям, подменять это заглушкой
бессмысленно. Без `TEST_DATABASE_URL` они пропускаются:

```bash
createdb paddelbase_test
export TEST_DATABASE_URL=postgresql://localhost:5432/paddelbase_test
DATABASE_URL=$TEST_DATABASE_URL DIRECT_URL=$TEST_DATABASE_URL pnpm db:deploy
pnpm --filter @paddelbase/core test
```

## База данных

```bash
cp .env.example .env      # заполнить DATABASE_URL и DIRECT_URL из Supabase
pnpm db:generate          # Prisma Client
pnpm db:deploy            # применить миграции
pnpm db:seed              # заглушки кортов и тестовые игроки
```

`DATABASE_URL` — пулер Supabase на порту 6543 обязательно с `?pgbouncer=true`;
`DIRECT_URL` — прямое соединение на 5432, его использует только миграция.

Таблицы живут в схеме `app`, а не в `public`: `public` публикуется наружу через
PostgREST по публичному anon-ключу, а Prisma создаёт таблицы без RLS.

Справочник кортов (`packages/db/prisma/courts.ts`) — **временный**: районы и
города вместо реальных клубов, без координат. Заменить до запуска; сид работает
по upsert'у, поэтому правка файла и повторный `pnpm db:seed` обновят записи.

## Метрики

Без них коэффициенты §3.8 нельзя откалибровать — сейчас все они инженерная
реконструкция:

```bash
pnpm rating:metrics                 # отчёт за всю историю
pnpm rating:metrics --from=2026-06-01
pnpm rating:metrics --json
```

Ключевая цифра — качество предсказания: целевой коридор 60–70 %. Выше означает,
что матчи слишком неравные, ниже — что модель не работает.

## Пересчёт рейтинга

Движок — чистая функция, а по каждому событию хранится снимок «до», поэтому всю
историю можно переиграть по изменившимся коэффициентам:

```bash
pnpm rating:recompute --dry-run            # посчитать и показать масштаб сдвига
pnpm rating:recompute --from=2026-08-01    # только с даты
pnpm rating:recompute                      # вся история
```

Пересчёт идёт в одной транзакции: либо переписывается вся история, либо не
меняется ничего. Любое изменение констант в `packages/rating/src/config.ts`
обязано сопровождаться повышением `RATING_CONFIG_VERSION` и пересчётом.

## Документы

- [`docs/decisions.md`](docs/decisions.md) — принятые решения и отклонения от ТЗ
  с обоснованиями. Читать до правок в `packages/rating`.

## Стек

Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui, Prisma поверх
Supabase Cloud (PostgreSQL 16), файлы в Supabase Storage, деплой в Coolify на
Hetzner. Подробности и следствия — в `docs/decisions.md`.
