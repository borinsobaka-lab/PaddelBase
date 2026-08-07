'use client';

import { useActionState, useState } from 'react';

import { Button, ErrorNote, PageTitle } from '@/components/ui';
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
    <main>
      <PageTitle subtitle="Десять вопросов, чтобы определить стартовый уровень. Отвечайте честно: заниженный ответ всё равно раскроется за первые матчи, а завышенный испортит подбор соперников.">
        Ваш уровень
      </PageTitle>

      <form action={formAction} className="flex flex-col gap-6">
        {QUESTIONS.map((question, index) => (
          <fieldset key={question.key} className="rounded-card border border-border bg-surface p-4">
            <legend className="sr-only">{question.title}</legend>

            <p className="text-xs font-medium text-muted">
              Вопрос {index + 1} из {total}
            </p>
            <p className="mt-1 font-medium">{question.title}</p>
            {question.hint ? <p className="mt-1 text-xs text-muted">{question.hint}</p> : null}

            <div className="mt-3 flex flex-col gap-2">
              {question.options.map((option) => {
                const selected = answered[question.key] === option.value;

                return (
                  <label
                    key={option.value}
                    className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-control border px-3 py-2 text-sm transition-colors ${
                      selected
                        ? 'border-accent bg-accent-soft'
                        : 'border-border bg-surface hover:border-border-strong'
                    }`}
                  >
                    <input
                      type="radio"
                      name={question.key}
                      value={option.value}
                      checked={selected}
                      onChange={() =>
                        setAnswered((previous) => ({ ...previous, [question.key]: option.value }))
                      }
                      className="size-4 shrink-0 accent-[var(--color-accent)]"
                      required
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}

        {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}

        {/* Кнопка прилипает к низу: анкета длинная, и прокручивать её обратно
            ради отправки было бы издевательством. */}
        <div className="sticky bottom-0 -mx-4 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur">
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
                : `Отвечено ${done} из ${total}`}
          </Button>
        </div>
      </form>
    </main>
  );
}
