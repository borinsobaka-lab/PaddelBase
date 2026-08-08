# Сборка под Coolify. Multi-stage: в финальный образ попадает только standalone
# вывод Next.js, а не node_modules всего монорепо.
FROM node:22-alpine AS base
# openssl — движку Prisma; на голом alpine он падает с «Unable to require
# libquery_engine». curl — планировщику Coolify: он дёргает /api/cron изнутри
# контейнера, а в node:alpine нет ни curl, ни полноценного wget.
RUN apk add --no-cache openssl curl
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/rating/package.json packages/rating/
COPY packages/tournament/package.json packages/tournament/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages ./packages
COPY . .
# Prisma Client генерируется до сборки: Next.js импортирует его типы.
RUN pnpm --filter @paddelbase/db generate
RUN pnpm --filter @paddelbase/web build
# Версия CLI обязана совпадать с версией клиента: расхождение мажора или минора
# ломает `migrate deploy`. Берём её из установленного пакета, а не из
# package.json — там диапазон с кареткой, и образ мог бы получить другую сборку.
RUN node -p "require('prisma/package.json').version" > /prisma-version

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -S nextjs

COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
# public/ standalone-вывод в себя не включает, а там лежат файлы шрифтов.
# Без этой строки приложение молча откатывается на системный шрифт.
COPY --from=build --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
# Схема и миграции нужны в рантайме: prisma migrate deploy запускается
# при выкатке, а не при сборке образа — миграции применяются к живой базе.
COPY --from=build --chown=nextjs:nodejs /app/packages/db/prisma ./packages/db/prisma

# Сам CLI в standalone-вывод не попадает: трассировщик Next.js включает только
# то, что импортируется кодом, а `prisma` никто не импортирует. Без этой строки
# в контейнере лежат миграции и нечем их применить.
COPY --from=build /prisma-version /tmp/prisma-version
RUN npm install -g "prisma@$(cat /tmp/prisma-version)" && rm /tmp/prisma-version

USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
