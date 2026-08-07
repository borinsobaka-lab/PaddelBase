'use client';

import type { ApplicationCard, MatchCard } from '@paddelbase/core';
import { formatLevel } from '@paddelbase/rating';
import { useActionState, useState } from 'react';

import { LevelChip } from '@/components/Badges';
import { Button, Card, ErrorNote, InfoNote, SectionHeader } from '@/components/ui';

import {
  accept,
  apply,
  cancel,
  confirmScore,
  disputeScore,
  leave,
  reject,
  submitScore,
  type ActionState,
} from './actions';

function Notice({ state }: { state: ActionState }) {
  if (state.error) return <ErrorNote>{state.error}</ErrorNote>;
  if (state.notice) return <InfoNote>{state.notice}</InfoNote>;
  return null;
}

/**
 * Блоки, которые чего-то ждут от игрока, помечены цветом мяча — тем же, что и
 * карточка «требует вас» на главной. Это единственный насыщенный цвет в
 * приложении, и он всегда значит одно: сейчас твой ход.
 */
export function JoinPanel({
  matchId,
  alreadyApplied,
  match,
}: {
  matchId: string;
  alreadyApplied: boolean;
  match: MatchCard;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(apply, {});

  if (alreadyApplied && !state.notice) {
    return (
      <Card>
        <p className="text-sm text-text-secondary">
          Вы откликнулись на эту заявку. Организатор ответит — придёт уведомление.
        </p>
      </Card>
    );
  }

  // Ради одной кнопки карточка не нужна: белый прямоугольник вокруг кнопки не
  // группирует ничего и только отодвигает главное действие экрана от края.
  return (
    <div className="flex flex-col gap-3">
      <Notice state={state} />

      {state.notice ? null : (
        <form action={formAction}>
          <input type="hidden" name="matchId" value={matchId} />
          <Button type="submit" disabled={pending}>
            {pending ? 'Отправляем…' : 'Откликнуться'}
          </Button>
        </form>
      )}

      {match.levelMin !== null && match.levelMax !== null ? (
        <p className="text-center text-xs text-muted">
          Организатор ищет игроков уровня {formatLevel(match.levelMin)}–
          {formatLevel(match.levelMax)}. Откликнуться можно в любом случае.
        </p>
      ) : null}
    </div>
  );
}

export function ApplicationsPanel({
  matchId,
  applications,
}: {
  matchId: string;
  applications: ApplicationCard[];
  match: MatchCard;
}) {
  const [acceptState, acceptAction, accepting] = useActionState<ActionState, FormData>(accept, {});
  const [rejectState, rejectAction, rejecting] = useActionState<ActionState, FormData>(reject, {});
  const busy = accepting || rejecting;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader>Отклики · {applications.length}</SectionHeader>

      <Card tone="action" className="flex flex-col gap-3">
        <Notice state={acceptState} />
        <Notice state={rejectState} />

        <ul className="flex flex-col gap-2.5">
          {applications.map((application) => (
            <li key={application.id} className="rounded-control bg-surface p-3 shadow-raise">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-[15px] font-semibold">
                  {application.name}
                </span>
                <LevelChip level={application.level} />
              </div>

              {/* Надёжность показываем рядом с уровнем: у новичка цифра почти
                  ничего не значит, и организатор должен это видеть. */}
              <p className="mt-1 text-xs text-muted">
                Надёжность {Math.round(application.reliability * 100)} %
                {application.reliability < 0.6 ? ' · уровень ещё калибруется' : ''}
              </p>

              {application.message ? (
                <p className="mt-2 text-sm text-text-secondary">{application.message}</p>
              ) : null}

              {/* Кнопки по содержимому, а не во всю ширину: три сплошных
                  зелёных прямоугольника подряд превращают акцент в фон, и
                  экран перестаёт показывать, что здесь главное. */}
              <div className="mt-3 flex items-center gap-1">
                <form action={acceptAction}>
                  <input type="hidden" name="matchId" value={matchId} />
                  <input type="hidden" name="applicationId" value={application.id} />
                  <Button type="submit" className="!w-auto px-6" disabled={busy}>
                    Принять
                  </Button>
                </form>
                <form action={rejectAction}>
                  <input type="hidden" name="matchId" value={matchId} />
                  <input type="hidden" name="applicationId" value={application.id} />
                  {/* Отказ — тихая кнопка: он необратим для игрока, но не
                      является тем, ради чего организатор открыл экран. */}
                  <Button type="submit" variant="quiet" className="!w-auto px-4" disabled={busy}>
                    Отклонить
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

export function ScorePanel({
  matchId,
  players,
}: {
  matchId: string;
  players: { id: string; name: string; level: number }[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(submitScore, {});

  // Состав пар обязателен: без него рейтинг посчитать нельзя, а восстановить
  // постфактум, кто с кем играл, уже невозможно (ТЗ §4.1).
  const [teams, setTeams] = useState<Record<string, 1 | 2>>(() =>
    Object.fromEntries(players.map((player, index) => [player.id, index < 2 ? 1 : 2])),
  );

  const first = players.filter((player) => teams[player.id] === 1);
  const second = players.filter((player) => teams[player.id] === 2);
  const teamsValid = first.length === 2 && second.length === 2;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader>Ввести счёт</SectionHeader>

      <Card tone="action" className="flex flex-col gap-4">
        <form action={formAction} className="flex flex-col gap-5">
          <input type="hidden" name="matchId" value={matchId} />
          {players.map((player) => (
            <input
              key={player.id}
              type="hidden"
              name="team"
              value={`${player.id}:${teams[player.id]}`}
            />
          ))}

          <div>
            <p className="label">Кто с кем играл</p>
            <ul className="mt-2 flex flex-col gap-2">
              {players.map((player) => (
                <li
                  key={player.id}
                  className="flex items-center justify-between gap-3 rounded-control bg-surface p-2 pl-3 shadow-raise"
                >
                  <span className="min-w-0 truncate text-sm">{player.name}</span>
                  <div className="flex shrink-0 gap-1 rounded-chip bg-sunken p-1">
                    {([1, 2] as const).map((team) => (
                      <button
                        key={team}
                        type="button"
                        aria-pressed={teams[player.id] === team}
                        onClick={() => setTeams((previous) => ({ ...previous, [player.id]: team }))}
                        className={`pressable min-h-9 rounded-chip px-2.5 text-[13px] font-medium transition-colors ${
                          teams[player.id] === team
                            ? 'bg-accent text-accent-ink'
                            : 'text-text-secondary'
                        }`}
                      >
                        {team === 1 ? '1-я' : '2-я'}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>

            {!teamsValid ? (
              <p className="mt-2 text-sm text-warn">В каждой паре должно быть по два игрока.</p>
            ) : null}
          </div>

          <div>
            <p className="label">Счёт по сетам</p>
            <div className="mt-2 flex flex-col gap-2">
              {[1, 2, 3].map((index) => (
                <div key={index} className="flex items-center gap-2.5">
                  <span className="w-14 shrink-0 text-[13px] text-muted">Сет {index}</span>
                  <SetInput name={`set${index}a`} />
                  <span aria-hidden className="text-faint">
                    :
                  </span>
                  <SetInput name={`set${index}b`} />
                  {index === 3 ? (
                    <span className="text-xs text-muted">если играли</span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <Notice state={state} />

          <Button type="submit" disabled={pending || !teamsValid}>
            {pending ? 'Записываем…' : 'Записать счёт'}
          </Button>
        </form>
      </Card>
    </section>
  );
}

function SetInput({ name }: { name: string }) {
  return (
    <input
      type="number"
      name={name}
      min={0}
      max={7}
      inputMode="numeric"
      placeholder="—"
      className="tabular min-h-11 w-14 rounded-control border border-border bg-surface text-center text-lg font-semibold outline-none transition-colors placeholder:font-normal placeholder:text-faint focus:border-accent"
    />
  );
}

export function ConfirmPanel({ matchId }: { matchId: string }) {
  const [confirmState, confirmAction, confirming] = useActionState<ActionState, FormData>(
    confirmScore,
    {},
  );
  const [disputeState, disputeAction, disputing] = useActionState<ActionState, FormData>(
    disputeScore,
    {},
  );
  const busy = confirming || disputing;

  return (
    <Card tone="action" className="flex flex-col gap-3">
      <div>
        <p className="text-[17px] font-semibold leading-tight">Подтвердите результат</p>
        <p className="mt-1 text-sm text-text-secondary">
          Счёт ввели соперники. После подтверждения изменится рейтинг.
        </p>
      </div>

      <Notice state={confirmState} />
      <Notice state={disputeState} />

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <form action={confirmAction}>
          <input type="hidden" name="matchId" value={matchId} />
          <Button type="submit" disabled={busy}>
            Всё верно
          </Button>
        </form>
        <form action={disputeAction}>
          <input type="hidden" name="matchId" value={matchId} />
          <Button type="submit" variant="quiet" className="!w-auto px-4" disabled={busy}>
            Счёт неверен
          </Button>
        </form>
      </div>
    </Card>
  );
}

/**
 * Выход из матча.
 *
 * Стоит последним и выглядит тихо: это не то, ради чего экран открывают, но и
 * прятать его нечестно — человек имеет право уйти.
 */
export function LeavePanel({
  matchId,
  isCreator,
  status,
}: {
  matchId: string;
  isCreator: boolean;
  status: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    isCreator ? cancel : leave,
    {},
  );

  if (status !== 'OPEN' && status !== 'FILLED') return null;

  return (
    <div className="flex flex-col gap-2 pt-2">
      <Notice state={state} />
      <form action={formAction}>
        <input type="hidden" name="matchId" value={matchId} />
        <Button type="submit" variant="quiet" className="text-danger" disabled={pending}>
          {isCreator ? 'Отменить матч' : 'Выйти из матча'}
        </Button>
      </form>
      {isCreator ? (
        <p className="text-center text-xs text-muted">
          Создатель не может просто выйти: без него некому принимать отклики и вводить счёт.
        </p>
      ) : null}
    </div>
  );
}
