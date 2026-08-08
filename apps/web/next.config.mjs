/** @type {import('next').NextConfig} */
const nextConfig = {
  // Coolify собирает образ из Dockerfile: standalone кладёт в сборку только
  // реально используемые зависимости вместо всего node_modules монорепо.
  output: 'standalone',
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,

  // Движок Prisma — бинарник, который никто не импортирует по имени: он
  // подгружается по вычисленному пути. Трассировщик Next.js такого не видит и
  // в standalone его не кладёт, а приложение падает на первом же запросе к
  // базе. Указываем явно.
  outputFileTracingIncludes: {
    '/**': ['../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**'],
  },
  experimental: {
    /**
     * Клиентский кеш роутера.
     *
     * По умолчанию `dynamic: 0` — каждый переход между разделами идёт на
     * сервер заново, даже возврат на экран, который открывали пять секунд
     * назад. На мобильной сети это те самые полсекунды белого экрана при
     * каждом переключении вкладки.
     *
     * 180 секунд — компромисс, а не максимум: в пределах одного сеанса
     * переключение вкладок мгновенное, а приложение, открытое через час,
     * начинает с холодного кеша и показывает свежие данные. Кеш живёт в
     * памяти вкладки и не переживает её закрытие.
     *
     * Устаревание внутри окна закрыто с другой стороны: каждое серверное
     * действие вызывает revalidatePath (см. lib/revalidate.ts), а это
     * сбрасывает клиентский кеш целиком. То есть свои же изменения игрок
     * видит сразу, а не через три минуты.
     */
    staleTimes: {
      dynamic: 180,
      static: 300,
    },
  },

  transpilePackages: [
    '@paddelbase/core',
    '@paddelbase/db',
    '@paddelbase/rating',
    '@paddelbase/tournament',
  ],

  webpack: (config) => {
    // Пакеты монорепо импортируют друг друга с расширением `.js`, как требует
    // ESM в Node: по этим же файлам работают CLI-скрипты пересчёта и метрик.
    // Webpack ищет буквально `.js` и не находит исходники — сопоставляем.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
