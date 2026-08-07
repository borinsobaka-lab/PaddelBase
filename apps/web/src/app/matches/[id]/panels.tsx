'use client';

import type { ApplicationCard, MatchCard } from '@paddelbase/core';
import { formatLevel } from '@paddelbase/rating';
import { useActionState, useState } from 'react';

import { LevelChip } from '@/components/Badges';
import { Button, Card, ErrorNote } from '@/components/ui';

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
  if (state.notice) {
    return (
      <p className="rounded-control bg-accent-soft px-3 py-2 text-sm text-accent">{state.notice}</p>
    );
  }
  return null;
}

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
        <p className="text-sm text-muted">
          Вы откликнулись на эту заявку. Организатор ответит — придёт уведомление.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3">
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
        <p className="text-xs text-muted">
          Организатор ищет игроков уровня {formatLevel(match.levelMin)}–
          {formatLevel(match.levelMax)}. Откликнуться можно в любом случае.
        </p>
      ) : null}
    </Card>
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

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-medium">Отклики ({applications.length})</h2>
      <Notice state={acceptState} />
      <Notice state={rejectState} />

      <ul className="flex flex-col gap-3">
        {applications.map((application) => (
          <li key={application.id} className="rounded-control border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{application.name}</span>
              <LevelChip level={application.level} />
            </div>

            {/* Надёжность показываем рядом с уровнем: у новичка цифра почти
                ничего не значит, и организатор должен это видеть. */}
            <p className="mt-1 text-xs text-muted">
              Надёжность {Math.round(application.reliability * 100)} %
              {application.reliability < 0.6 ? ' · уровень ещё калибруется' : ''}
            </p>

            {application.message ? (
              <p className="mt-2 text-sm">{application.message}</p>
            ) : null}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <form action={acceptAction}>
                <input type="hidden" name="matchId" value={matchId} />
                <input type="hidden" name="applicationId" value={application.id} />
                <Button type="submit" disabled={accepting || rejecting}>
                  Принять
                </Button>
              </form>
              <form action={rejectAction}>
                <input type="hidden" name="matchId" value={matchId} />
                <input type="hidden" name="applicationId" value={application.id} />
                <Button type="submit" variant="ghost" disabled={accepting || rejecting}>
                  Отклонить
                </Button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </Card>
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
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="font-medium">Ввести счёт</h2>
        <p className="mt-1 text-sm text-muted">
          Сначала укажите, кто с кем играл, затем счёт по сетам.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="matchId" value={matchId} />
        {players.map((player) => (
          <input
            key={player.id}
            type="hidden"
            name="team"
            value={`${player.id}:${teams[player.id]}`}
          />
        ))}

        <ul className="flex flex-col gap-2">
          {players.map((player) => (
            <li
              key={player.id}
              className="flex items-center justify-between gap-3 rounded-control border border-border p-2"
            >
              <span className="text-sm">{player.name}</span>
              <div className="flex gap-1">
                {([1, 2] as const).map((team) => (
                  <button
                    key={team}
                    type="button"
                    onClick={() => setTeams((previous) => ({ ...previous, [player.id]: team }))}
                    className={`min-h-9 rounded-control px-3 text-sm font-medium ${
                      teams[player.id] === team
                        ? 'bg-accent text-accent-ink'
                        : 'bg-surface-raised text-muted'
                    }`}
                  >
                    {team === 1 ? '1-я пара' : '2-я пара'}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>

        {!teamsValid ? (
          <p className="text-sm text-warn">В каждой паре должно быть по два игрока.</p>
        ) : null}

        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((index) => (
            <div key={index} className="flex items-center gap-3">
              <span className="w-16 text-sm text-muted">Сет {index}</span>
              <input
                type="number"
                name={`set${index}a`}
                min={0}
                max={7}
                inputMode="numeric"
                placeholder="—"
                className="tabular min-h-11 w-16 rounded-control border border-border-strong bg-surface text-center text-base"
              />
              <span aria-hidden className="text-muted">
                :
              </span>
              <input
                type="number"
                name={`set${index}b`}
                min={0}
                max={7}
                inputMode="numeric"
                placeholder="—"
                className="tabular min-h-11 w-16 rounded-control border border-border-strong bg-surface text-center text-base"
              />
              {index === 3 ? <span className="text-xs text-muted">если играли</span> : null}
            </div>
          ))}
        </div>

        <Notice state={state} />

        <Button type="submit" disabled={pending || !teamsValid}>
          {pending ? 'Записываем…' : 'Записать счёт'}
        </Button>
      </form>
    </Card>
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

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-medium">Подтвердите результат</h2>
      <p className="text-sm text-muted">
        Счёт ввели соперники. Подтвердите его — после этого изменится рейтинг.
      </p>

      <Notice state={confirmState} />
      <Notice state={disputeState} />

      <div className="grid grid-cols-2 gap-2">
        <form action={confirmAction}>
          <input type="hidden" name="matchId" value={matchId} />
          <Button type="submit" disabled={confirming || disputing}>
            Всё верно
          </Button>
        </form>
        <form action={disputeAction}>
          <input type="hidden" name="matchId" value={matchId} />
          <Button type="submit" variant="ghost" disabled={confirming || disputing}>
            Счёт неверен
          </Button>
        </form>
      </div>
    </Card>
  );
}

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
    <Card className="flex flex-col gap-2">
      <Notice state={state} />
      <form action={formAction}>
        <input type="hidden" name="matchId" value={matchId} />
        <Button type="submit" variant="ghost" disabled={pending}>
          {isCreator ? 'Отменить матч' : 'Выйти из матча'}
        </Button>
      </form>
      {isCreator ? (
        <p className="text-xs text-muted">
          Создатель не может просто выйти: без него некому принимать отклики и вводить счёт.
        </p>
      ) : null}
    </Card>
  );
}
