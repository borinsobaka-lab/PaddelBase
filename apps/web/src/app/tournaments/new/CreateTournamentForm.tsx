'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';

import { Button, Card, ErrorNote, Field, PageTitle, TextInput } from '@/components/ui';

import { createTournamentAction, type CreateTournamentState } from './actions';

interface Court {
  id: string;
  name: string;
  city: string;
}

const FORMATS = [
  {
    value: 'AMERICANO',
    title: 'Американо',
    description: 'Партнёры меняются каждый раунд, зачёт личный',
  },
  {
    value: 'MEXICANO',
    title: 'Мексикано',
    description: 'Пары составляются по таблице: 1-й с 4-м против 2-го с 3-м',
  },
  {
    value: 'TEAM_AMERICANO',
    title: 'Командный Американо',
    description: 'Пары фиксированы, каждая играет со всеми',
  },
  {
    value: 'TEAM_MEXICANO',
    title: 'Командный Мексикано',
    description: 'Пары фиксированы, соперники — соседи по таблице',
  },
] as const;

const POINTS = [16, 21, 24, 32] as const;

export function CreateTournamentForm({ courts }: { courts: Court[] }) {
  const [state, formAction, pending] = useActionState<CreateTournamentState, FormData>(
    createTournamentAction,
    {},
  );

  const [format, setFormat] = useState<(typeof FORMATS)[number]['value']>('AMERICANO');
  const [participants, setParticipants] = useState(8);
  const [courtsCount, setCourtsCount] = useState(2);
  const [rounds, setRounds] = useState(7);

  const isTeam = format.startsWith('TEAM_');

  // Полная ротация партнёров возможна только при числе игроков, кратном 4,
  // и занимает n − 1 раундов (ТЗ §4.2). Подсказываем, а не навязываем.
  const fullRotationRounds = participants % 4 === 0 ? participants - 1 : null;
  const playersPerRound = Math.min(courtsCount * 4, Math.floor(participants / 4) * 4);
  const restingPerRound = participants - playersPerRound;

  return (
    <main className="pb-24">
      <div className="flex items-center gap-3 pt-6">
        <Link href="/games" className="text-sm text-muted">
          ← Назад
        </Link>
      </div>

      <PageTitle subtitle="Сетка соберётся автоматически, вам останется вводить счёт по кортам">
        Новый турнир
      </PageTitle>

      <form action={formAction} className="flex flex-col gap-5">
        <Card className="flex flex-col gap-3">
          <p className="text-sm font-medium">Формат</p>
          {FORMATS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer flex-col gap-1 rounded-control border p-3 ${
                format === option.value
                  ? 'border-accent bg-accent-soft'
                  : 'border-border bg-surface hover:border-border-strong'
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="format"
                  value={option.value}
                  checked={format === option.value}
                  onChange={() => {
                    setFormat(option.value);
                    setParticipants(option.value.startsWith('TEAM_') ? 6 : 8);
                  }}
                  className="size-4 accent-[var(--color-accent)]"
                />
                {option.title}
              </span>
              <span className="pl-6 text-xs text-muted">{option.description}</span>
            </label>
          ))}
        </Card>

        <Card>
          <Field label="Тип">
            <div className="grid grid-cols-2 gap-2">
              <Choice name="isRated" value="rated" label="Рейтинговый" defaultChecked />
              <Choice name="isRated" value="friendly" label="Любительский" />
            </div>
          </Field>
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

          <Field label="Продолжительность, часов">
            <select
              name="durationMin"
              defaultValue="180"
              className="min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-base"
            >
              {[90, 120, 180, 240, 300].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes / 60}
                </option>
              ))}
            </select>
          </Field>

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
        </Card>

        <Card className="flex flex-col gap-4">
          <Counter
            label={isTeam ? 'Команд' : 'Участников'}
            name="maxParticipants"
            value={participants}
            min={4}
            max={isTeam ? 16 : 32}
            step={isTeam ? 1 : 2}
            onChange={setParticipants}
          />

          <Counter
            label="Кортов"
            name="courtsCount"
            value={courtsCount}
            min={1}
            max={6}
            step={1}
            onChange={setCourtsCount}
          />

          <Counter
            label="Раундов"
            name="roundsCount"
            value={rounds}
            min={1}
            max={31}
            step={1}
            onChange={setRounds}
          />

          {!isTeam && fullRotationRounds !== null ? (
            <p className="text-xs text-muted">
              При {participants} игроках полная ротация занимает {fullRotationRounds}{' '}
              {fullRotationRounds === 1 ? 'раунд' : 'раундов'} — тогда каждый сыграет в паре с
              каждым ровно один раз.{' '}
              {rounds !== fullRotationRounds ? (
                <button
                  type="button"
                  onClick={() => setRounds(fullRotationRounds)}
                  className="font-medium text-accent underline"
                >
                  Поставить {fullRotationRounds}
                </button>
              ) : null}
            </p>
          ) : null}

          {restingPerRound > 0 ? (
            <p className="text-xs text-warn">
              Каждый раунд {restingPerRound}{' '}
              {restingPerRound === 1 ? 'участник будет отдыхать' : 'участников будут отдыхать'}:
              кортов не хватает на всех. Пропуски распределятся поровну.
            </p>
          ) : null}
        </Card>

        <Card className="flex flex-col gap-4">
          <Field label="Очков в раунде">
            <div className="grid grid-cols-4 gap-2">
              {POINTS.map((value) => (
                <Choice
                  key={value}
                  name="pointsPerRound"
                  value={String(value)}
                  label={String(value)}
                  defaultChecked={value === 24}
                />
              ))}
            </div>
          </Field>

          <Field
            label="Компенсация отдыхающим"
            hint="Доля очков раунда, которую получает пропустивший. Не влияет на рейтинг."
          >
            <select
              name="restCompensation"
              defaultValue="0.5"
              className="min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-base"
            >
              <option value="0">Без компенсации</option>
              <option value="0.5">Половина очков раунда</option>
              <option value="1">Полный номинал</option>
            </select>
          </Field>

          <Field label="Взнос, ₾" hint="Необязательно">
            <TextInput type="number" name="feeAmount" min="0" step="1" />
          </Field>

          <Field label="Описание">
            <textarea
              name="description"
              rows={3}
              maxLength={1000}
              className="w-full rounded-control border border-border-strong bg-surface p-3 text-base outline-none focus:border-accent"
            />
          </Field>
        </Card>

        {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}

        <div className="sticky bottom-0 -mx-4 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur">
          <Button type="submit" disabled={pending}>
            {pending ? 'Создаём…' : 'Создать турнир'}
          </Button>
        </div>
      </form>
    </main>
  );
}

function Choice({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-border bg-surface text-sm font-medium has-checked:border-accent has-checked:bg-accent-soft has-checked:text-accent">
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

function Counter({
  label,
  name,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      <input type="hidden" name={name} value={value} />
      <div className="flex items-center gap-2">
        <StepButton label={`Уменьшить ${label}`} onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min}>
          −
        </StepButton>
        <span className="tabular w-10 text-center text-base font-medium">{value}</span>
        <StepButton label={`Увеличить ${label}`} onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max}>
          +
        </StepButton>
      </div>
    </div>
  );
}

function StepButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-11 items-center justify-center rounded-control border border-border-strong bg-surface text-lg disabled:opacity-40"
    >
      {children}
    </button>
  );
}
