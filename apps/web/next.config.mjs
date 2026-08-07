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
