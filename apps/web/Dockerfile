# Сборка под Coolify. Multi-stage: в финальный образ попадает только standalone
# вывод Next.js, а не node_modules всего монорепо.
FROM node:22-alpine AS base
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

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -S nextjs

COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
# Схема и миграции нужны в рантайме: prisma migrate deploy запускается
# при выкатке, а не при сборке образа.
COPY --from=build --chown=nextjs:nodejs /app/packages/db/prisma ./packages/db/prisma

USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
