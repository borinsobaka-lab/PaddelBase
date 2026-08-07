'use client';

import { formatLevel } from '@paddelbase/rating';
import Link from 'next/link';
import { useActionState, useState } from 'react';

import { LevelChip } from '@/components/Badges';
import { Button, Card, ErrorNote, Field, PageTitle, TextInput } from '@/components/ui';

import { createMatchAction, type CreateMatchState } from './actions';

interface Court {
  id: string;
  name: string;
  city: string;
}

interface Player {
  id: string;
  name: string;
  level: number;
}

const DURATIONS = [
  { value: 60, label: '1 час' },
  { value: 90, label: '1,5 часа' },
  { value: 120, label: '2 часа' },
  { value: 180, label: '3 часа' },
] as const;

export function CreateMatchForm({
  courts,
  players,
  myLevel,
}: {
  courts: Court[];
  players: Player[];
  myLevel: number;
}) {
  const [state, formAction, pending] = useActionState<CreateMatchState, FormData>(
    createMatchAction,
    {},
  );

  const [slotsMissing, setSlotsMissing] = useState(3);
  const [invited, setInvited] = useState<string[]>([]);
  const [restrictLevel, setRestrictLevel] = useState(false);

  // Блок выбора игроков появляется, только когда состав частично собран:
  // при «нужно 3» добавлять некого (ТЗ §4.1).
  const invitesNeeded = 3 - slotsMissing;
  const invitesReady = invited.length === invitesNeeded;

  function toggleInvited(id: string) {
    setInvited((previous) => {
      if (previous.includes(id)) return previous.filter((item) => item !== id);
      if (previous.length >= invitesNeeded) return previous;
      return [...previous, id];
    });
  }

  return (
    <main className="pb-24">
      <div className="flex items-center gap-3 pt-6">
        <Link href="/home" className="text-sm text-muted">
          ← Назад
        </Link>
      </div>

      <PageTitle subtitle="Заявка появится в общей ленте, и на неё смогут откликнуться другие игроки">
        Новый матч
      </PageTitle>

      <form action={formAction} className="flex flex-col gap-5">
        <Card>
          <Field label="Тип матча">
            <div className="grid grid-cols-2 gap-2">
              <Radio name="isRated" value="rated" defaultChecked label="Рейтинговый" />
              <Radio name="isRated" value="friendly" label="Любительский" />
            </div>
          </Field>
          <p className="mt-2 text-xs text-muted">
            Рейтинговый матч меняет уровень участников. Любительский сохранится в истории, но на
            рейтинг не повлияет.
          </p>
        </Card>

        <Card className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Дата">
              <TextInput type="date" name="date" required />
            </Field>
            <Field label="Время">
              <TextInput type="time" name="time" required step={300} />
            </Field>
          </div>

          <Field label="Продолжительность">
            <div className="grid grid-cols-4 gap-2">
              {DURATIONS.map((duration) => (
                <Radio
                  key={duration.value}
                  name="durationMin"
                  value={String(duration.value)}
                  label={duration.label}
                  defaultChecked={duration.value === 90}
                  compact
                />
              ))}
            </div>
          </Field>
        </Card>

        <Card className="flex flex-col gap-4">
          <Field label="Корт">
            <select
              name="courtId"
              required
              className="min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-base"
            >
              {courts.map((court) => (
                <option key={court.id} value={court.id}>
                  {court.name} · {court.city}
                </option>
              ))}
            </select>
          </Field>

          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" name="courtBooked" className="size-4 accent-[var(--color-accent)]" />
            Корт уже забронирован
          </label>
        </Card>

        <Card className="flex flex-col gap-4">
          <Field label="Сколько игроков не хватает">
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((count) => (
                <label
                  key={count}
                  className={`flex min-h-11 cursor-pointer items-center justify-center rounded-control border text-sm font-medium ${
                    slotsMissing === count
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-border bg-surface'
                  }`}
                >
                  <input
                    type="radio"
                    name="slotsMissing"
                    value={count}
                    checked={slotsMissing === count}
                    onChange={() => {
                      setSlotsMissing(count);
                      setInvited([]);
                    }}
                    className="sr-only"
                  />
                  {count}
                </label>
              ))}
            </div>
          </Field>

          {invitesNeeded > 0 ? (
            <Field
              label={`С кем вы уже договорились (${invited.length} из ${invitesNeeded})`}
              hint="Эти игроки сразу попадут в состав, откликаться им не нужно"
            >
              <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                {players.length === 0 ? (
                  <p className="text-sm text-muted">
                    Других игроков пока нет — выберите «не хватает 3».
                  </p>
                ) : (
                  players.map((player) => {
                    const selected = invited.includes(player.id);
                    const disabled = !selected && invited.length >= invitesNeeded;

                    return (
                      <label
                        key={player.id}
                        className={`flex min-h-11 items-center justify-between gap-3 rounded-control border px-3 text-sm ${
                          selected ? 'border-accent bg-accent-soft' : 'border-border bg-surface'
                        } ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            name="invited"
                            value={player.id}
                            checked={selected}
                            disabled={disabled}
                            onChange={() => toggleInvited(player.id)}
                            className="size-4 accent-[var(--color-accent)]"
                          />
                          {player.name}
                        </span>
                        <LevelChip level={player.level} />
                      </label>
                    );
                  })
                )}
              </div>
            </Field>
          ) : null}
        </Card>

        <Card className="flex flex-col gap-4">
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={restrictLevel}
              onChange={(event) => setRestrictLevel(event.target.checked)}
              className="size-4 accent-[var(--color-accent)]"
            />
            Указать желаемый уровень соперников
          </label>

          {restrictLevel ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="От">
                <TextInput
                  type="number"
                  name="levelMin"
                  step="0.25"
                  min="0"
                  max="7"
                  defaultValue={Math.max(0, myLevel - 0.75).toFixed(2)}
                />
              </Field>
              <Field label="До">
                <TextInput
                  type="number"
                  name="levelMax"
                  step="0.25"
                  min="0"
                  max="7"
                  defaultValue={Math.min(7, myLevel + 0.75).toFixed(2)}
                />
              </Field>
            </div>
          ) : null}

          <p className="text-xs text-muted">
            Ваш уровень — {formatLevel(myLevel)}. Игроков вне диапазона мы предупредим, но
            откликнуться не запретим.
          </p>

          <Field label="Комментарий" hint="Например, про парковку или про то, что нужен свой мяч">
            <textarea
              name="comment"
              maxLength={500}
              rows={3}
              className="w-full rounded-control border border-border-strong bg-surface p-3 text-base outline-none focus:border-accent"
            />
          </Field>
        </Card>

        {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}

        <div className="sticky bottom-0 -mx-4 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur">
          <Button
            type="submit"
            variant={invitesReady ? 'primary' : 'ghost'}
            disabled={pending || !invitesReady}
          >
            {pending
              ? 'Размещаем…'
              : invitesReady
                ? 'Разместить заявку'
                : `Выберите ещё ${invitesNeeded - invited.length}`}
          </Button>
        </div>
      </form>
    </main>
  );
}

function Radio({
  name,
  value,
  label,
  defaultChecked,
  compact = false,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked?: boolean;
  compact?: boolean;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-border bg-surface text-center font-medium has-checked:border-accent has-checked:bg-accent-soft has-checked:text-accent ${
        compact ? 'px-1 text-xs' : 'text-sm'
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        required
        className="sr-only"
      />
      {label}
    </label>
  );
}
