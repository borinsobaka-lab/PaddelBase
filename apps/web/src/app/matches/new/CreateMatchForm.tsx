'use client';

import { formatLevel } from '@paddelbase/rating';
import { useActionState, useState } from 'react';

import { LevelChip } from '@/components/Badges';
import {
  BackLink,
  Button,
  Card,
  CheckRow,
  ErrorNote,
  Field,
  PageTitle,
  Segmented,
  SegmentedOption,
  Select,
  StickyBar,
  Textarea,
  TextInput,
} from '@/components/ui';

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
  { value: 60, label: '1 ч' },
  { value: 90, label: '1,5 ч' },
  { value: 120, label: '2 ч' },
  { value: 180, label: '3 ч' },
] as const;

/**
 * Создание матча.
 *
 * Форма длинная, и раньше все пять карточек весили одинаково: тип матча
 * выглядел так же важно, как галочка «корт забронирован». Здесь у каждой
 * группы есть подпись, а сама группа отвечает на один вопрос — когда, где,
 * с кем, для кого.
 */
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
    <main className="pb-4">
      <BackLink href="/home" />

      <PageTitle subtitle="Заявка появится в общей ленте, и на неё смогут откликнуться другие игроки">
        Новый матч
      </PageTitle>

      <form action={formAction} className="flex flex-col gap-5">
        <Card className="flex flex-col gap-3">
          <Field label="Тип матча">
            <Segmented>
              <SegmentedOption name="isRated" value="rated" defaultChecked label="Рейтинговый" />
              <SegmentedOption name="isRated" value="friendly" label="Любительский" />
            </Segmented>
          </Field>
          <p className="text-xs text-muted">
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
            <Segmented columns={4}>
              {DURATIONS.map((duration) => (
                <SegmentedOption
                  key={duration.value}
                  name="durationMin"
                  value={String(duration.value)}
                  label={duration.label}
                  defaultChecked={duration.value === 90}
                  compact
                />
              ))}
            </Segmented>
          </Field>

          <Field label="Корт">
            <Select name="courtId" required>
              {courts.map((court) => (
                <option key={court.id} value={court.id}>
                  {court.name} · {court.city}
                </option>
              ))}
            </Select>
          </Field>

          <CheckRow name="courtBooked" label="Корт уже забронирован" />
        </Card>

        <Card className="flex flex-col gap-4">
          <Field label="Сколько игроков не хватает">
            <Segmented columns={3}>
              {[1, 2, 3].map((count) => (
                <SegmentedOption
                  key={count}
                  name="slotsMissing"
                  value={String(count)}
                  label={String(count)}
                  checked={slotsMissing === count}
                  onChange={() => {
                    setSlotsMissing(count);
                    setInvited([]);
                  }}
                />
              ))}
            </Segmented>
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
                        className={`flex min-h-11 items-center justify-between gap-3 rounded-control border px-3 text-sm transition-colors ${
                          selected ? 'border-accent bg-accent-soft' : 'border-border bg-surface'
                        } ${disabled ? 'opacity-45' : 'cursor-pointer'}`}
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <input
                            type="checkbox"
                            name="invited"
                            value={player.id}
                            checked={selected}
                            disabled={disabled}
                            onChange={() => toggleInvited(player.id)}
                            className="size-[18px] shrink-0 accent-[var(--color-accent)]"
                          />
                          <span className="truncate">{player.name}</span>
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

        <Card className="flex flex-col gap-3">
          <CheckRow
            checked={restrictLevel}
            onChange={(event) => setRestrictLevel(event.target.checked)}
            label="Указать желаемый уровень соперников"
            hint={`Ваш уровень — ${formatLevel(myLevel)}. Игроков вне диапазона предупредим, но откликнуться не запретим.`}
          />

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
        </Card>

        <Card>
          <Field label="Комментарий" hint="Например, про парковку или про то, что нужен свой мяч">
            <Textarea name="comment" maxLength={500} rows={3} />
          </Field>
        </Card>

        {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}

        <StickyBar>
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
        </StickyBar>
      </form>
    </main>
  );
}
