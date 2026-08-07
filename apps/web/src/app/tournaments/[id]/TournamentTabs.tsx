'use client';

import type {
  ParticipantView,
  RoundView,
  StandingsRow,
  TournamentDetails,
} from '@paddelbase/core';
import { formatLevel } from '@paddelbase/rating';
import { useActionState, useState } from 'react';

import { Badge, LevelChip } from '@/components/Badges';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  InfoNote,
  SectionHeader,
  Select,
  TextInput,
} from '@/components/ui';
import { TOURNAMENT_FORMAT_NAMES, formatDateTime, formatDuration } from '@/lib/format';

import {
  closeRoundAction,
  finish,
  join,
  leaveAction,
  registerTeamAction,
  saveScore,
  start,
  type TournamentActionState,
} from './actions';

type Tab = 'info' | 'participants' | 'rounds' | 'standings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'info', label: 'Инфо' },
  { id: 'participants', label: 'Участники' },
  { id: 'rounds', label: 'Раунды' },
  { id: 'standings', label: 'Таблица' },
];

export interface TournamentViewProps {
  tournament: TournamentDetails;
  participants: ParticipantView[];
  rounds: RoundView[];
  standings: StandingsRow[];
  ratingChanges: { userId: string; name: string; levelBefore: number; levelAfter: number; delta: number }[];
  viewerId: string;
  candidates: { id: string; name: string; level: number }[];
}

function Notice({ state }: { state: TournamentActionState }) {
  if (state.error) return <ErrorNote>{state.error}</ErrorNote>;
  if (state.notice) return <InfoNote>{state.notice}</InfoNote>;
  return null;
}

export function TournamentTabs(props: TournamentViewProps) {
  const { tournament } = props;
  // По умолчанию открываем то, что сейчас важнее: до старта — состав,
  // во время турнира — текущий раунд, после — итоговая таблица.
  const [tab, setTab] = useState<Tab>(
    tournament.status === 'COMPLETED'
      ? 'standings'
      : tournament.status === 'IN_PROGRESS'
        ? 'rounds'
        : 'info',
  );

  return (
    <>
      <nav className="sticky top-0 z-10 -mx-4 bg-canvas/92 px-4 py-2 backdrop-blur">
        <div className="flex gap-1 rounded-control bg-sunken p-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? 'true' : undefined}
              className={`pressable min-h-11 flex-1 rounded-chip text-sm font-medium transition-colors ${
                tab === item.id ? 'bg-surface text-text shadow-raise' : 'text-text-secondary'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {tab === 'info' ? <InfoTab {...props} /> : null}
      {tab === 'participants' ? <ParticipantsTab {...props} /> : null}
      {tab === 'rounds' ? <RoundsTab {...props} /> : null}
      {tab === 'standings' ? <StandingsTab {...props} /> : null}
    </>
  );
}

function InfoTab({ tournament, participants, viewerId }: TournamentViewProps) {
  const [joinState, joinAction, joining] = useActionState<TournamentActionState, FormData>(join, {});
  const [leaveState, leaveActionFn, leaving] = useActionState<TournamentActionState, FormData>(
    leaveAction,
    {},
  );
  const [startState, startActionFn, starting] = useActionState<TournamentActionState, FormData>(
    start,
    {},
  );

  const isOrganizer = tournament.organizerId === viewerId;
  const isParticipant = participants.some((person) => person.userId === viewerId);
  const registrationOpen = tournament.status === 'REGISTRATION';
  const entrants = tournament.isTeam ? tournament.teamsCount : tournament.participantsCount;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <dl className="flex flex-col gap-2 text-sm">
          <Row label="Формат">{TOURNAMENT_FORMAT_NAMES[tournament.format]}</Row>
          <Row label="Начало">{formatDateTime(tournament.startsAt)}</Row>
          <Row label="Длительность">{formatDuration(tournament.durationMin)}</Row>
          <Row label="Корт">
            {tournament.courtName}, {tournament.courtCity}
          </Row>
          <Row label="Кортов в игре">{tournament.courtsCount}</Row>
          <Row label="Очков в раунде">{tournament.pointsPerRound}</Row>
          <Row label="Раундов">{tournament.roundsCount}</Row>
          <Row label={tournament.isTeam ? 'Команд' : 'Участников'}>
            {entrants} из {tournament.maxParticipants}
          </Row>
          {tournament.feeAmount ? <Row label="Взнос">{tournament.feeAmount} ₾</Row> : null}
          <Row label="Организатор">{tournament.organizerName}</Row>
        </dl>

        {tournament.description ? (
          <p className="mt-4 whitespace-pre-wrap border-t border-border pt-4 text-sm">
            {tournament.description}
          </p>
        ) : null}
      </Card>

      {registrationOpen && !tournament.isTeam ? (
        <div className="flex flex-col gap-3">
          <Notice state={joinState} />
          <Notice state={leaveState} />

          {isParticipant ? (
            <form action={leaveActionFn}>
              <input type="hidden" name="tournamentId" value={tournament.id} />
              <Button type="submit" variant="quiet" disabled={leaving}>
                Сняться с турнира
              </Button>
            </form>
          ) : (
            <form action={joinAction}>
              <input type="hidden" name="tournamentId" value={tournament.id} />
              <Button type="submit" disabled={joining}>
                {joining ? 'Записываем…' : 'Записаться'}
              </Button>
            </form>
          )}
        </div>
      ) : null}

      {registrationOpen && tournament.isTeam && !isParticipant ? (
        <p className="text-sm text-text-secondary">
          В командный турнир записываются парой. Форма заявки — на вкладке «Участники».
        </p>
      ) : null}

      {isOrganizer && (tournament.status === 'REGISTRATION' || tournament.status === 'READY') ? (
        <Card tone="action" className="flex flex-col gap-3">
          <Notice state={startState} />
          <p className="text-sm text-text-secondary">
            После старта состав закрывается, а уровни участников фиксируются: весь турнир считается
            от них, а не от уровней, меняющихся по ходу.
          </p>
          <form action={startActionFn}>
            <input type="hidden" name="tournamentId" value={tournament.id} />
            <Button type="submit" disabled={starting || entrants < 4}>
              {starting ? 'Запускаем…' : 'Начать турнир'}
            </Button>
          </form>
          {entrants < 4 ? (
            <p className="text-xs text-warn">
              Нужно минимум 4 {tournament.isTeam ? 'команды' : 'участника'}.
            </p>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

function ParticipantsTab({ tournament, participants, viewerId, candidates }: TournamentViewProps) {
  const [state, formAction, pending] = useActionState<TournamentActionState, FormData>(
    registerTeamAction,
    {},
  );

  const isParticipant = participants.some((person) => person.userId === viewerId);
  const canRegisterTeam =
    tournament.isTeam && tournament.status === 'REGISTRATION' && !isParticipant;

  const teams = new Map<string, ParticipantView[]>();
  for (const person of participants) {
    if (!person.teamId) continue;
    teams.set(person.teamId, [...(teams.get(person.teamId) ?? []), person]);
  }

  return (
    <div className="flex flex-col gap-4">
      {canRegisterTeam ? (
        <Card className="flex flex-col gap-3">
          <p className="text-[17px] font-semibold leading-tight">Заявить команду</p>
          <p className="text-sm text-text-secondary">
            В командном турнире регистрируется пара целиком: выберите партнёра, с которым будете
            играть весь турнир.
          </p>
          <Notice state={state} />

          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="tournamentId" value={tournament.id} />
            <Select name="partnerId" required defaultValue="">
              <option value="">Выберите партнёра</option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name} · {formatLevel(candidate.level)}
                </option>
              ))}
            </Select>
            <TextInput
              type="text"
              name="teamName"
              maxLength={40}
              placeholder="Название команды (необязательно)"
            />
            <Button type="submit" disabled={pending}>
              {pending ? 'Заявляем…' : 'Заявить команду'}
            </Button>
          </form>
        </Card>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionHeader>
          {tournament.isTeam ? `Команды · ${teams.size}` : `Участники · ${participants.length}`}
        </SectionHeader>

        {participants.length === 0 ? (
          <EmptyState
            title="Пока никто не записался"
            hint="Поделитесь ссылкой на турнир — записаться можно с этого экрана."
          />
        ) : tournament.isTeam ? (
          <div className="flex flex-col gap-2">
            {[...teams.entries()].map(([teamId, members]) => (
              <Card key={teamId}>
                <p className="text-[15px] font-semibold">
                  {members[0]?.teamName ?? members.map((m) => m.name.split(' ')[0]).join(' и ')}
                </p>
                <ul className="mt-2 flex flex-col">
                  {members.map((member) => (
                    <li
                      key={member.userId}
                      className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm last:border-0 last:pb-0"
                    >
                      <span className="min-w-0 truncate text-text-secondary">{member.name}</span>
                      <LevelChip level={member.level} />
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <ul className="flex flex-col">
              {participants.map((person) => (
                <li
                  key={person.userId}
                  className="flex items-center justify-between gap-3 border-b border-border py-2.5 text-sm first:pt-0 last:border-0 last:pb-0"
                >
                  <span className="min-w-0 truncate">
                    {person.name}
                    {person.reliability < 0.6 ? (
                      <span className="ml-2 text-xs text-muted">калибруется</span>
                    ) : null}
                  </span>
                  <LevelChip level={person.level} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}

function RoundsTab({ tournament, rounds, viewerId }: TournamentViewProps) {
  const isOrganizer = tournament.organizerId === viewerId;

  if (rounds.length === 0) {
    return (
      <EmptyState
        title="Сетка ещё не составлена"
        hint="Она соберётся автоматически после старта — организатор запускает турнир на вкладке «Инфо»."
      />
    );
  }

  // Текущий раунд — первый незакрытый. Именно с ним работает организатор, и
  // именно его хочет видеть игрок: остальные либо уже сыграны, либо ещё нет.
  const activeRound =
    rounds.find((round) => round.status !== 'COMPLETED')?.roundNumber ??
    rounds[rounds.length - 1]?.roundNumber;

  return (
    <div className="flex flex-col gap-3">
      {rounds.map((round) => (
        <RoundCard
          key={round.id}
          round={round}
          tournament={tournament}
          isOrganizer={isOrganizer}
          open={round.roundNumber === activeRound}
        />
      ))}
    </div>
  );
}

/**
 * Раунд.
 *
 * Раскрыт только текущий. Американо на восьмерых — это семь раундов по два
 * корта: развёрнутые разом, они дают четыре тысячи пикселей одинаковых форм,
 * где отличается лишь номер, а работать организатору всё равно есть над чем
 * ровно в одном из них. Остальные складываются в строку со счётом.
 */
function RoundCard({
  round,
  tournament,
  isOrganizer,
  open,
}: {
  round: RoundView;
  tournament: TournamentDetails;
  isOrganizer: boolean;
  open: boolean;
}) {
  const [scoreState, scoreAction, savingScore] = useActionState<TournamentActionState, FormData>(
    saveScore,
    {},
  );
  const [closeState, closeAction, closing] = useActionState<TournamentActionState, FormData>(
    closeRoundAction,
    {},
  );

  const complete = round.matches.every((match) => match.scoreA !== null);
  const closed = round.status === 'COMPLETED';

  const scored = round.matches.filter((match) => match.scoreA !== null).length;

  return (
    <Card className="!p-0">
      <details open={open} className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
          <h2 className="flex-1 text-[17px] font-semibold leading-tight">
            Раунд {round.roundNumber}
          </h2>
          {closed ? (
            <Badge>закрыт</Badge>
          ) : scored === round.matches.length ? (
            <Badge tone="accent">счёт введён</Badge>
          ) : (
            <span className="tabular text-[13px] text-muted">
              счёт {scored} / {round.matches.length}
            </span>
          )}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="shrink-0 text-faint transition-transform group-open:rotate-180"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>

        <div className="flex flex-col gap-3 border-t border-border p-4">
      <Notice state={scoreState} />
      <Notice state={closeState} />

      <ul className="flex flex-col gap-3">
        {round.matches.map((match) => (
          <li key={match.id} className="rounded-control bg-sunken p-3">
            <p className="label">Корт {match.courtNumber}</p>

            {/* Вид табло: каждая пара на своей строке со своим счётом. Имена в
                паделе длинные, и в одну строку «А + Б — В + Г» они переносятся
                так, что непонятно, кто с кем. */}
            {isOrganizer && !closed ? (
              <form action={scoreAction} className="mt-2 flex flex-col gap-2">
                <input type="hidden" name="tournamentId" value={tournament.id} />
                <input type="hidden" name="matchId" value={match.id} />

                <ScoreRow
                  label={match.teamAName ?? match.teamA.join(' + ')}
                  name="scoreA"
                  defaultValue={match.scoreA}
                  max={tournament.pointsPerRound}
                />
                <ScoreRow
                  label={match.teamBName ?? match.teamB.join(' + ')}
                  name="scoreB"
                  defaultValue={match.scoreB}
                  max={tournament.pointsPerRound}
                />

                <Button type="submit" variant="ghost" disabled={savingScore} className="mt-1">
                  {savingScore ? 'Сохраняем…' : 'Сохранить счёт'}
                </Button>
              </form>
            ) : (
              <div className="mt-2 flex flex-col gap-1.5">
                <ScoreLine
                  label={match.teamAName ?? match.teamA.join(' + ')}
                  score={match.scoreA}
                  winner={match.scoreA !== null && match.scoreB !== null && match.scoreA > match.scoreB}
                />
                <ScoreLine
                  label={match.teamBName ?? match.teamB.join(' + ')}
                  score={match.scoreB}
                  winner={match.scoreA !== null && match.scoreB !== null && match.scoreB > match.scoreA}
                />
              </div>
            )}
          </li>
        ))}
      </ul>

      {round.resting.length > 0 ? (
        <p className="text-xs text-muted">
          Отдыхают: {round.resting.join(', ')}
          {tournament.restCompensation > 0
            ? ` · получают ${Math.round(tournament.pointsPerRound * tournament.restCompensation)} очков`
            : ''}
        </p>
      ) : null}

      {isOrganizer && !closed ? (
        <form action={closeAction}>
          <input type="hidden" name="tournamentId" value={tournament.id} />
          <input type="hidden" name="roundNumber" value={round.roundNumber} />
          <Button type="submit" variant={complete ? 'primary' : 'ghost'} disabled={closing || !complete}>
            {closing ? 'Закрываем…' : complete ? 'Закрыть раунд' : 'Введите счёт на всех кортах'}
          </Button>
        </form>
      ) : null}
        </div>
      </details>
    </Card>
  );
}

function ScoreRow({
  label,
  name,
  defaultValue,
  max,
}: {
  label: string;
  name: string;
  defaultValue: number | null;
  max: number;
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="flex-1 text-sm">{label}</span>
      <input
        type="number"
        name={name}
        min={0}
        max={max}
        defaultValue={defaultValue ?? ''}
        inputMode="numeric"
        aria-label={`Очки: ${label}`}
        className="tabular min-h-11 w-16 shrink-0 rounded-control border border-border bg-surface text-center text-base font-semibold outline-none transition-colors focus:border-accent"
      />
    </label>
  );
}

function ScoreLine({
  label,
  score,
  winner,
}: {
  label: string;
  score: number | null;
  winner: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className={`flex-1 text-sm ${winner ? 'font-semibold' : 'text-text-secondary'}`}>
        {label}
      </span>
      <span
        className={`tabular w-10 shrink-0 text-right text-base ${
          winner ? 'font-semibold' : 'text-muted'
        }`}
      >
        {score ?? '—'}
      </span>
    </div>
  );
}

function StandingsTab({ tournament, standings, ratingChanges, viewerId }: TournamentViewProps) {
  const [state, formAction, pending] = useActionState<TournamentActionState, FormData>(finish, {});
  const isOrganizer = tournament.organizerId === viewerId;
  const allRoundsClosed = tournament.closedRounds >= tournament.roundsCount;

  return (
    <div className="flex flex-col gap-4">
      {standings.length === 0 ? (
        <EmptyState
          title="Таблица появится после первого раунда"
          hint="Очки считаются автоматически, как только организатор закроет раунд."
        />
      ) : (
        <Card className="!p-0">
          <ol className="flex flex-col">
            {standings.map((row, index) => {
              const place = row.finalPlace ?? index + 1;
              const me = row.id === viewerId;

              return (
                <li
                  key={row.id}
                  className={`flex items-center gap-3 border-b border-border px-3.5 py-3 text-sm last:border-0 ${
                    me ? 'bg-accent-soft' : ''
                  }`}
                >
                  {/* Призовая тройка выделена весом, а не медалью: цвет здесь
                      уже занят отметкой «это вы». */}
                  <span
                    className={`tabular w-6 shrink-0 text-center ${
                      place <= 3 ? 'text-base font-semibold' : 'text-muted'
                    }`}
                  >
                    {place}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${me ? 'font-semibold' : ''}`}>{row.name}</span>
                    {row.members.length > 0 ? (
                      <span className="block truncate text-xs text-muted">
                        {row.members.join(' и ')}
                      </span>
                    ) : null}
                  </span>
                  <span className="tabular shrink-0 text-right">
                    <span className="text-base font-semibold">{row.points}</span>
                    <span className="ml-2 w-9 text-xs text-muted">
                      {row.pointsDiff >= 0 ? '+' : ''}
                      {row.pointsDiff}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      <p className="text-xs text-muted">
        Очки игрока за раунд равны очкам его пары. При равенстве выше тот, у кого лучше разница.
      </p>

      {ratingChanges.length > 0 ? (
        <Card>
          <p className="label">Изменение уровня</p>
          <ul className="mt-2 flex flex-col text-sm">
            {ratingChanges.map((change) => (
              <li
                key={change.userId}
                className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0 last:pb-0"
              >
                <span className="min-w-0 truncate">{change.name}</span>
                <span className="tabular flex shrink-0 items-center gap-2">
                  <span className="text-muted">{formatLevel(change.levelBefore)}</span>
                  <span aria-hidden className="text-faint">
                    →
                  </span>
                  <span className="font-semibold">{formatLevel(change.levelAfter)}</span>
                  <span
                    className={`w-14 text-right font-medium ${
                      change.delta >= 0 ? 'text-accent' : 'text-danger'
                    }`}
                  >
                    {change.delta >= 0 ? '+' : ''}
                    {change.delta.toFixed(3)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Весь турнир засчитан как одно рейтинговое событие: каждый раунд посчитан от уровней на
            старте, дельты сложены и применены разом.
          </p>
        </Card>
      ) : null}

      {isOrganizer && tournament.status === 'IN_PROGRESS' ? (
        <Card tone="action" className="flex flex-col gap-3">
          <Notice state={state} />
          <form action={formAction}>
            <input type="hidden" name="tournamentId" value={tournament.id} />
            <Button
              type="submit"
              variant={allRoundsClosed ? 'primary' : 'ghost'}
              disabled={pending || !allRoundsClosed}
            >
              {pending
                ? 'Завершаем…'
                : allRoundsClosed
                  ? 'Завершить турнир'
                  : `Закрыто ${tournament.closedRounds} из ${tournament.roundsCount} раундов`}
            </Button>
          </form>
          {tournament.isRated ? (
            <p className="text-xs text-muted">
              После завершения рейтинг участников обновится и пересчёту не подлежит.
            </p>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0">
      <dt className="shrink-0 text-text-secondary">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}
