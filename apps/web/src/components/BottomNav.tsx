'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { Sheet } from './Sheet';

/**
 * Нижняя панель (ТЗ §5.7).
 *
 * Создание живёт здесь, в центре, а не плавающей кнопкой над содержимым.
 * Плавающая кнопка закрывала собой последнюю карточку списка, требовала
 * компенсирующего отступа снизу на каждом экране и в каждом разделе оказывалась
 * в новом месте. В панели она всегда на одном месте и ничего не перекрывает.
 */
const LEFT = [
  { href: '/home', label: 'Главная', icon: HomeIcon },
  { href: '/games', label: 'Игры', icon: GamesIcon },
] as const;

const RIGHT = [
  { href: '/community', label: 'Комьюнити', icon: CommunityIcon },
  { href: '/profile', label: 'Профиль', icon: ProfileIcon },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-nav border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto flex w-full max-w-[430px] items-center">
          {LEFT.map((item) => (
            <NavItem key={item.href} item={item} pathname={pathname} />
          ))}

          <li className="flex flex-1 justify-center">
            <button
              type="button"
              onClick={() => setCreating(true)}
              aria-label="Создать матч или турнир"
              className="pressable flex size-12 items-center justify-center rounded-full bg-accent text-accent-ink"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </li>

          {RIGHT.map((item) => (
            <NavItem key={item.href} item={item} pathname={pathname} />
          ))}
        </ul>
      </nav>

      <Sheet open={creating} onClose={() => setCreating(false)} title="Что создаём?">
        <div className="flex flex-col gap-2">
          <Link
            href="/matches/new"
            onClick={() => setCreating(false)}
            className="pressable flex min-h-14 items-center justify-center rounded-control bg-accent text-title font-semibold text-accent-ink"
          >
            Матч 2 × 2
          </Link>
          <Link
            href="/tournaments/new"
            onClick={() => setCreating(false)}
            className="pressable flex min-h-14 items-center justify-center rounded-control bg-sunken text-title font-semibold"
          >
            Турнир
          </Link>
        </div>
      </Sheet>
    </>
  );
}

function NavItem({
  item,
  pathname,
}: {
  item: { href: string; label: string; icon: () => React.ReactElement };
  pathname: string;
}) {
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  return (
    <li className="flex-1">
      <Link
        href={item.href}
        /**
         * Полная предзагрузка всех четырёх разделов.
         *
         * По умолчанию Next тянет для динамического маршрута только его
         * loading-границу, то есть скелет: переход всё равно ждёт сервер.
         * `prefetch` берёт готовый экран целиком, и первое же переключение
         * вкладки происходит без запроса.
         */
        prefetch
        aria-current={active ? 'page' : undefined}
        className={`pressable flex min-h-14 flex-col items-center justify-center gap-1 text-caption font-medium ${
          active ? 'text-accent' : 'text-muted'
        }`}
      >
        <Icon />
        {item.label}
      </Link>
    </li>
  );
}

function iconProps(): React.SVGProps<SVGSVGElement> {
  return {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
}

function HomeIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}

function GamesIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18M3 12h18" />
    </svg>
  );
}

function CommunityIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M4 5h16v11H8l-4 4z" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}
