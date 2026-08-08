'use client';

import { useActionState, useState } from 'react';

import { Button, ChoiceRow, ErrorNote, StickyBar, TopBar } from '@/components/ui';
import { QUESTIONS } from '@/lib/questionnaire';

import { submitOnboarding, type OnboardingFormState } from './actions';

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState<OnboardingFormState, FormData>(
    submitOnboarding,
    {},
  );
  const [answered, setAnswered] = useState<Record<string, string>>({});

  const total = QUESTIONS.length;
  const done = Object.keys(answered).length;
  const complete = done === total;

  return (
    <main className="screen">
      <TopBar subtitle="Десять вопросов, чтобы определить стартовый уровень. Отвечайте честно: заниженный ответ всё равно раскроется за первые матчи, а завышенный испортит подбор соперников.">Ваш уровень</TopBar>

      {/* Полоса прогресса прилипает к верху: анкета длинная, и на пятом вопросе
          важно видеть, что осталось немного. Раньше об этом говорила только
          подпись «Вопрос 5 из 10» внутри карточки. */}
      <div className="sticky top-0 z-sticky -mx-4 bg-canvas/92 px-4 pb-3 pt-2 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${Math.round((done / total) * 100)}%` }}
            />
          </div>
          <span className="figure shrink-0 text-small font-medium text-text-secondary">
            {done} / {total}
          </span>
        </div>
      </div>

      <form action={formAction} className="flex flex-col gap-5 pt-2">
        {QUESTIONS.map((question, index) => {
          const chosen = answered[question.key];

          return (
            <fieldset key={question.key}>
              <legend className="sr-only">{question.title}</legend>

              <div className="flex items-baseline gap-2">
                {/* Номер вопроса — цифрой, а не фразой «Вопрос 3 из 10»:
                    общий счётчик уже стоит в полосе прогресса, и повторять
                    его десять раз незачем. */}
                <span
                  className={`figure flex size-6 shrink-0 items-center justify-center rounded-full text-caption font-semibold ${
                    chosen ? 'bg-accent text-accent-ink' : 'bg-sunken text-muted'
                  }`}
                  aria-hidden
                >
                  {index + 1}
                </span>
                <p className="text-title font-semibold leading-snug">{question.title}</p>
              </div>

              {question.hint ? (
                <p className="ml-8 mt-1 text-small text-muted">{question.hint}</p>
              ) : null}

              <div className="ml-8 mt-3 flex flex-col gap-2">
                {question.options.map((option) => (
                  <ChoiceRow
                    key={option.value}
                    name={question.key}
                    value={option.value}
                    checked={chosen === option.value}
                    onChange={() =>
                      setAnswered((previous) => ({ ...previous, [question.key]: option.value }))
                    }
                    required
                    label={option.label}
                  />
                ))}
              </div>
            </fieldset>
          );
        })}

        {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}

        <StickyBar>
          {/* Пока анкета не заполнена, кнопка тихая: яркая зелёная кнопка,
              которая ничего не делает, только провоцирует по ней жать. */}
          <Button
            type="submit"
            variant={complete ? 'primary' : 'ghost'}
            disabled={pending || !complete}
          >
            {pending
              ? 'Считаем уровень…'
              : complete
                ? 'Узнать свой уровень'
                : `Осталось ${total - done} из ${total}`}
          </Button>
        </StickyBar>
      </form>
    </main>
  );
}
