'use client';

import { useActionState } from 'react';

import { Button, ErrorNote, Field, PageTitle, TextInput } from '@/components/ui';

import { signIn, type LoginState } from './actions';

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(signIn, {});

  return (
    <main>
      <PageTitle subtitle="Матчи, турниры и рейтинг для игроков в падел в Грузии">
        PaddelBase
      </PageTitle>

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

      <p className="mt-6 text-xs text-muted">
        Пока идёт тестирование, вход делается по имени и ничего не защищает: кто угодно может
        представиться кем угодно. Настоящая авторизация появится перед запуском.
      </p>
    </main>
  );
}
