'use client';

import { useActionState } from 'react';

import { InfoNote, Panel } from '@/components/ui';

import { savePreferences, type PreferencesState } from './actions';
import {
  COURT_SIDES,
  DAY_TIMES,
  HANDS,
  MATCH_PREFERENCES,
  WEEKDAYS,
  type PlayerPreferences,
} from './preferences';

/**
 * Предпочтения в игре.
 *
 * Отвечает на вопрос «как со мной играть»: рука, сторона корта, какие матчи
 * интересны и когда удобно. Всё необязательное — незаполненное поле означает
 * «не указано», и подбор по нему не фильтрует.
 *
 * Варианты выбираются плашками, а не выпадающими списками: их по три-семь на
 * группу, все видны сразу, и выбор занимает одно нажатие вместо трёх.
 */
export function PreferencesForm({ initial }: { initial: PlayerPreferences }) {
  const [state, formAction, pending] = useActionState<PreferencesState, FormData>(
    savePreferences,
    {},
  );

  return (
    <Panel title="Предпочтения в игре">
      <form action={formAction} className="flex flex-col gap-6">
        <p className="-mt-1 text-small text-text-secondary">
          Заполнять необязательно. Это подсказка другим игрокам, с кем и когда вам удобно играть.
        </p>

        <Group label="Рабочая рука">
          {HANDS.map((item) => (
            <Chip
              key={item.value}
              name="dominantHand"
              value={item.value}
              defaultChecked={initial.dominantHand === item.value}
            >
              {item.label}
            </Chip>
          ))}
        </Group>

        <Group
          label="Сторона корта"
          hint="В падел это роль в паре: слева чаще завершают розыгрыш, справа — строят."
        >
          {COURT_SIDES.map((item) => (
            <Chip
              key={item.value}
              name="courtSide"
              value={item.value}
              defaultChecked={initial.courtSide === item.value}
            >
              {item.label}
            </Chip>
          ))}
        </Group>

        <Group
          label="Какие матчи интересны"
          hint="Рейтинговые меняют ваш уровень, любительские остаются в истории."
        >
          {MATCH_PREFERENCES.map((item) => (
            <Chip
              key={item.value}
              name="matchPreference"
              value={item.value}
              defaultChecked={initial.matchPreference === item.value}
            >
              {item.label}
            </Chip>
          ))}
        </Group>

        <Group label="Когда удобно играть">
          {DAY_TIMES.map((item) => (
            <Chip
              key={item.value}
              type="checkbox"
              name="preferredTimes"
              value={item.value}
              defaultChecked={initial.preferredTimes.includes(item.value)}
            >
              {item.label}
            </Chip>
          ))}
        </Group>

        <Group label="Дни недели">
          {WEEKDAYS.map((item) => (
            <Chip
              key={item.value}
              type="checkbox"
              name="preferredDays"
              value={String(item.value)}
              aria-label={item.full}
              defaultChecked={initial.preferredDays.includes(item.value)}
            >
              {item.label}
            </Chip>
          ))}
        </Group>

        {state.saved ? <InfoNote>Сохранено</InfoNote> : null}

        <button
          type="submit"
          disabled={pending}
          className="pressable min-h-14 w-full rounded-control bg-accent text-title font-semibold text-accent-ink disabled:pointer-events-none disabled:opacity-40"
        >
          {pending ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </form>
    </Panel>
  );
}

function Group({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="text-title font-bold">{label}</legend>
      {hint ? <p className="mt-1 text-small text-muted">{hint}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

/**
 * Вариант-плашка.
 *
 * Сам переключатель скрыт визуально, но остаётся в разметке: так работает
 * клавиатура, читалки с экрана и, главное, отправка формы без единой строчки
 * состояния на клиенте.
 */
function Chip({
  children,
  type = 'radio',
  ...props
}: React.ComponentProps<'input'> & { children: React.ReactNode }) {
  return (
    <label className="pressable cursor-pointer">
      <input type={type} className="peer sr-only" {...props} />
      <span className="flex min-h-11 items-center rounded-control bg-sunken px-4 text-body font-medium text-text-secondary transition-colors peer-checked:bg-accent peer-checked:text-accent-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
        {children}
      </span>
    </label>
  );
}
