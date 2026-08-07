/**
 * Состав матча в виде миниатюрного корта — сигнатурный элемент приложения.
 *
 * Падел всегда играется 2×2 на корте фиксированной пропорции, разделённом
 * сеткой. Ряд кружков с инициалами этого не показывает: по нему не видно, кто
 * с кем в паре и с какой стороны свободно место. Корт показывает и то, и
 * другое одним взглядом — ровно та задача, которую ТЗ §9 называет главной:
 * «за один взгляд понять, куда я записан и куда ещё могу записаться».
 *
 * Свободные места — пунктирные ячейки. Пустота здесь содержательна: это
 * приглашение, а не отсутствие данных.
 */
export interface CourtPlayer {
  id: string;
  name: string;
}

const SIZES = {
  sm: { court: 'h-12', slot: 'size-6 text-[9px]', gap: 'gap-1', pad: 'p-1.5' },
  md: { court: 'h-16', slot: 'size-8 text-[11px]', gap: 'gap-1.5', pad: 'p-2' },
} as const;

export function CourtLineup({
  players,
  slotsMissing,
  highlightId,
  size = 'sm',
}: {
  players: CourtPlayer[];
  slotsMissing: number;
  /** Кого подсветить как «это вы». */
  highlightId?: string;
  size?: keyof typeof SIZES;
}) {
  const style = SIZES[size];

  // Игроки садятся по парам слева направо, свободные места достаются
  // оставшимся ячейкам — так пустое место всегда видно на своей стороне.
  const seats: (CourtPlayer | null)[] = [
    ...players.slice(0, 4),
    ...Array.from({ length: Math.max(0, Math.min(slotsMissing, 4 - players.length)) }, () => null),
  ];
  while (seats.length < 4) seats.push(null);

  const left = seats.slice(0, 2);
  const right = seats.slice(2, 4);

  return (
    <div
      className={`flex ${style.court} w-full items-stretch rounded-control bg-accent-soft ${style.pad}`}
      role="img"
      aria-label={ariaLabel(players, slotsMissing)}
    >
      <Side seats={left} style={style} highlightId={highlightId} />

      {/* Сетка. Белая линия на зелёном — это и есть разметка корта. */}
      <div className="mx-1.5 w-0.5 shrink-0 rounded-full bg-surface" aria-hidden />

      <Side seats={right} style={style} highlightId={highlightId} />
    </div>
  );
}

function Side({
  seats,
  style,
  highlightId,
}: {
  seats: (CourtPlayer | null)[];
  style: (typeof SIZES)[keyof typeof SIZES];
  highlightId?: string | undefined;
}) {
  return (
    <div className={`flex flex-1 items-center justify-center ${style.gap}`}>
      {seats.map((seat, index) =>
        seat ? (
          <span
            key={seat.id}
            title={seat.name}
            className={`flex ${style.slot} items-center justify-center rounded-full font-semibold ${
              seat.id === highlightId
                ? 'bg-accent text-accent-ink'
                : 'bg-surface text-text-secondary'
            }`}
          >
            {initials(seat.name)}
          </span>
        ) : (
          <span
            key={`free-${index}`}
            className={`flex ${style.slot} items-center justify-center rounded-full border border-dashed border-accent/40 text-accent/60`}
            aria-hidden
          >
            +
          </span>
        ),
      )}
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

function ariaLabel(players: CourtPlayer[], slotsMissing: number): string {
  const names = players.map((player) => player.name).join(', ');
  if (slotsMissing === 0) return `Состав: ${names}`;
  return `Состав: ${names}. Свободных мест: ${slotsMissing}`;
}
