import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'PaddelBase — падел в Грузии',
  description: 'Матчи, турниры и рейтинг для игроков в падел',
};

export const viewport: Viewport = {
  themeColor: '#f1f6f4',
  width: 'device-width',
  initialScale: 1,
  // Масштабирование не запрещаем: у корта в солнце это единственный способ
  // прочитать мелкий текст.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        {/* Кириллические подмножества грузятся на каждом экране — их стоит
            запросить сразу, а не после разбора CSS. Латиница и latin-ext
            подтянутся по мере надобности. */}
        <link
          rel="preload"
          href="/fonts/onest-cyrillic.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/jetbrains-mono-cyrillic.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-dvh">
        {/* Вёрстка mobile-first: базовая ширина 390 px, на десктопе колонка
            центрируется, а не растягивается на всю ширину экрана. */}
        <div className="mx-auto min-h-dvh w-full max-w-[430px] px-4 pb-10">{children}</div>
      </body>
    </html>
  );
}
