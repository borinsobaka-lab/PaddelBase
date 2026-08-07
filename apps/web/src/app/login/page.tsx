'use client';

import { useActionState } from 'react';

import { Button, ErrorNote, Field, TextInput } from '@/components/ui';

import { signIn, type LoginState } from './actions';

/**
 * Вход.
 *
 * Первый экран приложения — единственный, где нечего показывать, кроме самого
 * продукта. Раньше он выглядел как форма настроек: заголовок, поле, кнопка,
 * прижатые к верху. Здесь форма стоит по центру экрана, а над ней — корт,
 * который дальше встречается в каждой карточке матча. Узнаваемость начинается
 * до регистрации.
 */
export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(signIn, {});

  return (
    <main className="flex min-h-dvh flex-col justify-center gap-8 py-10">
      <header>
        <CourtMark />
        <h1 className="mt-6 text-[30px] font-semibold leading-none">PaddelBase</h1>
        <p className="mt-2 max-w-[30ch] text-[15px] text-text-secondary">
          Матчи, турниры и честный уровень для игроков в падел в Грузии.
        </p>
      </header>

      <form action={formAction} className="flex flex-col gap-4">
        <Field label="Как вас зовут" hint="Под этим именем вас увидят другие игроки">
          <TextInput
            name="name"
            autoComplete="name"
            autoFocus
            required
            maxLength={60}
            placeholder="Например, Георгий Мчедлишвили"
          />
        </Field>

        {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}

        <Button type="submit" disabled={pending}>
          {pending ? 'Входим…' : 'Войти'}
        </Button>
      </form>

      <p className="text-xs text-muted">
        Пока идёт тестирование, вход делается по имени и ничего не защищает: кто угодно может
        представиться кем угодно. Настоящая авторизация появится перед запуском.
      </p>
    </main>
  );
}

/** Тот же корт, что и в составе матча, — только пустой. */
function CourtMark() {
  return (
    <div className="flex h-24 w-full items-stretch rounded-card bg-accent-soft p-3" aria-hidden>
      <div className="flex flex-1 items-center justify-center gap-2">
        <Seat />
        <Seat />
      </div>
      <div className="mx-2 w-0.5 shrink-0 rounded-full bg-surface" />
      <div className="flex flex-1 items-center justify-center gap-2">
        <Seat />
        <Seat />
      </div>
    </div>
  );
}

function Seat() {
  return <span className="size-9 rounded-full border border-dashed border-accent/40" />;
}
