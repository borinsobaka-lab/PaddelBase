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

## Документы

- [`docs/decisions.md`](docs/decisions.md) — принятые решения и отклонения от ТЗ
  с обоснованиями. Читать до правок в `packages/rating`.

## Стек

Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui, Prisma поверх
Supabase Cloud (PostgreSQL 16), файлы в Supabase Storage, деплой в Coolify на
Hetzner. Подробности и следствия — в `docs/decisions.md`.
