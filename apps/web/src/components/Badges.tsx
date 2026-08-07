import { formatLevel, levelCategory } from '@paddelbase/rating';

import type { ReactNode } from 'react';

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'warn';
}) {
  const tones = {
    neutral: 'bg-surface-raised text-muted',
    accent: 'bg-accent-soft text-accent',
    warn: 'bg-warn-soft text-warn',
  } as const;

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>
  );
}

/** Уровень игрока: цифра и буквенная категория рядом — как в профиле. */
export function LevelChip({ level }: { level: number }) {
  return (
    <span className="tabular inline-flex items-center gap-1 rounded-full bg-surface-raised px-2 py-0.5 text-xs font-medium">
      {formatLevel(level)}
      <span className="text-muted">{levelCategory(level)}</span>
    </span>
  );
}

/**
 * Кружки с инициалами вместо аватаров: загрузка фото ещё не сделана, а пустые
 * серые кружки не дают понять, кто в составе.
 */
export function PlayerAvatars({ players }: { players: { id: string; name: string }[] }) {
  return (
    <div className="flex -space-x-2">
      {players.map((player) => (
        <span
          key={player.id}
          title={player.name}
          className="flex size-7 items-center justify-center rounded-full border-2 border-surface bg-surface-raised text-xs font-medium"
        >
          {initials(player.name)}
        </span>
      ))}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
