# PaddelBase

Веб-приложение для организации игр в падел в Грузии: заявки на матчи, турниры
(Американо, Мексикано и их командные версии), рейтинг игроков, лента комьюнити.

Первый канал дистрибуции — Telegram Web App, вёрстка mobile-first.

## Структура репозитория

```
apps/web              — Next.js приложение              (ещё не создано)
packages/rating       — движок рейтинга, чистая логика   ✔
packages/tournament   — генераторы сеток, чистая логика  ✔
packages/db           — Prisma-схема и клиент            (следующий шаг)
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

## Документы

- [`docs/decisions.md`](docs/decisions.md) — принятые решения и отклонения от ТЗ
  с обоснованиями. Читать до правок в `packages/rating`.

## Стек

Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui, Prisma поверх
Supabase Cloud (PostgreSQL 16), файлы в Supabase Storage, деплой в Coolify на
Hetzner. Подробности и следствия — в `docs/decisions.md`.
