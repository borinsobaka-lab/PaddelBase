'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Нижняя панель на четыре пункта (ТЗ §5.7). */
const ITEMS = [
  { href: '/home', label: 'Главная', icon: HomeIcon },
  { href: '/games', label: 'Игры', icon: GamesIcon },
  { href: '/community', label: 'Комьюнити', icon: CommunityIcon },
  { href: '/profile', label: 'Профиль', icon: ProfileIcon },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/92 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex w-full max-w-[430px]">
        {ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`pressable flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                  active ? 'text-accent' : 'text-muted'
                }`}
              >
                <Icon />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
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
