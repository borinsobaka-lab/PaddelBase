import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/**
 * Примитивы интерфейса.
 *
 * Глубина держится заливками, а не тенями и не рамками: серый холст → белая
 * карточка → серая плитка внутри карточки. Три ступени, каждая на пару
 * процентов светлоты, и этого достаточно, чтобы структура читалась.
 *
 * Тень осталась ровно у двух элементов — кнопки создания и шторки, — которые
 * буквально висят над произвольным содержимым. Это не вторая стратегия: всё,
 * что лежит в потоке документа, теней не имеет вовсе.
 */

export type Tone = 'default' | 'action' | 'warn' | 'accent';

const TONES: Record<Tone, string> = {
  default: 'bg-surface',
  // «Твой ход» — цвет мяча. Единственная насыщенная точка на корте и
  // единственное место в интерфейсе, где она уместна.
  action: 'bg-ball-soft',
  warn: 'bg-warn-soft',
  accent: 'bg-accent-soft',
};

export function Card({
  children,
  tone = 'default',
  className = '',
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={`bleed rounded-card p-4 ${TONES[tone]} ${className}`}>{children}</div>
  );
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: 'primary' | 'ghost' | 'quiet' }) {
  // 56 px, а не минимальные 44: главное действие экрана должно читаться как
  // главное ещё до того, как прочитана надпись на нём.
  const base =
    'pressable inline-flex min-h-14 w-full items-center justify-center rounded-control px-5 text-title font-semibold disabled:pointer-events-none disabled:opacity-40';

  const styles = {
    primary: 'bg-accent text-accent-ink hover:bg-accent/90',
    ghost: 'bg-sunken text-text hover:bg-border',
    quiet: 'text-text-secondary hover:bg-sunken',
  }[variant];

  return <button className={`${base} ${styles} ${className}`} {...props} />;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-body font-medium">{label}</span>
      {children}
      {hint ? <span className="text-small text-muted">{hint}</span> : null}
    </label>
  );
}

/**
 * Поле ввода утоплено относительно поверхности: более тёмная заливка сама
 * говорит «сюда вводят».
 *
 * Но опознаётся поле границей, а не заливкой: sunken к surface — это 1.16 : 1,
 * чего не хватает никому, включая зрячих на солнце. Поэтому граница здесь
 * border-strong, держащая 3 : 1, а плейсхолдер — muted, а не faint: подсказка
 * внутри поля остаётся текстом и обязана читаться на 4.5 : 1.
 */
export function TextInput(props: ComponentProps<'input'>) {
  return (
    <input
      className="min-h-11 w-full rounded-control border border-border-strong bg-sunken px-3 text-body outline-none transition-colors placeholder:text-muted focus:border-accent focus:bg-surface"
      {...props}
    />
  );
}

/** Многострочный ввод. Утоплен так же, как TextInput: правило одно на все поля. */
export function Textarea(props: ComponentProps<'textarea'>) {
  return (
    <textarea
      className="w-full rounded-control border border-border-strong bg-sunken p-3 text-body outline-none transition-colors placeholder:text-muted focus:border-accent focus:bg-surface"
      {...props}
    />
  );
}

/**
 * Выпадающий список.
 *
 * Нативный `select` стилизуется плохо, но заменять его самодельным меню ради
 * стрелки — плохая сделка: колесо выбора на телефоне удобнее любого нашего
 * списка. Поэтому убирается только системная стрелка, а поведение остаётся
 * платформенным.
 */
export function Select({ className = '', ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        className={`min-h-11 w-full appearance-none rounded-control border border-border-strong bg-sunken py-2 pl-3 pr-10 text-body outline-none transition-colors focus:border-accent focus:bg-surface ${className}`}
        {...props}
      />
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
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

/**
 * Переключатель из нескольких вариантов в одну строку.
 *
 * Дорожка утоплена, выбранный вариант приподнят — то же правило глубины, что и
 * во всём остальном приложении. Выбор читается по высоте, а не по цвету:
 * зелёный нужен там, где он что-то значит, а не на каждом втором переключателе
 * формы.
 */
export function Segmented({
  children,
  columns = 2,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4;
}) {
  const cols = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' }[columns];
  return <div className={`grid ${cols} gap-1 rounded-control bg-sunken p-1`}>{children}</div>;
}

export function SegmentedOption({
  label,
  compact = false,
  ...props
}: ComponentProps<'input'> & { label: ReactNode; compact?: boolean }) {
  return (
    <label
      className={`pressable flex min-h-11 cursor-pointer items-center justify-center rounded-chip px-1 text-center font-medium text-text-secondary transition-colors has-checked:bg-surface has-checked:font-semibold has-checked:text-text ${
        compact ? 'text-small' : 'text-body'
      }`}
    >
      <input type="radio" className="sr-only" {...props} />
      {label}
    </label>
  );
}

/**
 * Вариант ответа во всю ширину — для длинных формулировок, которые не влезают
 * в переключатель. Радиокнопка остаётся видимой: в списке из шести пунктов
 * подсветка выбранного без самой точки читается хуже.
 */
export function ChoiceRow({
  label,
  type = 'radio',
  ...props
}: ComponentProps<'input'> & { label: ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-control bg-sunken p-3 text-body transition-colors has-checked:bg-accent-soft has-checked:ring-2 has-checked:ring-accent">
      <input
        type={type}
        className="mt-px size-4 shrink-0 accent-[var(--color-accent)]"
        {...props}
      />
      <span className="min-w-0">{label}</span>
    </label>
  );
}

/** Строка-флажок: сам флажок и подпись — одна цель нажатия высотой 44 px. */
export function CheckRow({
  label,
  hint,
  ...props
}: ComponentProps<'input'> & { label: ReactNode; hint?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1.5 text-body">
      <input
        type="checkbox"
        className="size-[18px] shrink-0 accent-[var(--color-accent)]"
        {...props}
      />
      <span className="min-w-0">
        <span className="block leading-snug">{label}</span>
        {hint ? <span className="mt-0.5 block text-small text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

/**
 * Круглый значок с глифом.
 *
 * Опознавательный элемент этой стилистики: сплошной синий круг с белым
 * штрихом внутри. Он маркирует раздел, а не действие, поэтому сам по себе
 * никогда не бывает целью нажатия — нажимается плитка или строка целиком.
 */
export function IconBadge({
  children,
  tone = 'accent',
  size = 'md',
}: {
  children: ReactNode;
  tone?: 'accent' | 'sunken' | 'ball';
  size?: 'sm' | 'md';
}) {
  const tones = {
    accent: 'bg-accent text-accent-ink',
    sunken: 'bg-sunken text-text-secondary',
    ball: 'bg-ball text-ball-ink',
  }[tone];
  const box = size === 'sm' ? 'size-9' : 'size-11';

  return (
    <span
      aria-hidden
      className={`flex ${box} shrink-0 items-center justify-center rounded-full ${tones}`}
    >
      {children}
    </span>
  );
}

/** Сообщение об ошибке говорит, что произошло и что делать (ТЗ §9). */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-body text-danger">
      {children}
    </p>
  );
}

/** Спокойное подтверждение: действие прошло, ничего делать не нужно. */
export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-control bg-accent-soft px-3 py-2 text-small text-accent">{children}</p>
  );
}

/**
 * Верхняя плашка экрана.
 *
 * Белое начинается от самого верха: серая полоса над заголовком превращала бы
 * серый обратно в фон приложения, а он здесь — только разрыв между блоками.
 * Верхние углы прямые по той же причине, и отступ сверху учитывает вырез.
 *
 * Сюда же переехала стрелка назад. Раньше она была отдельной круглой целью на
 * сером — то есть ещё одним блоком до первого блока.
 */
export function TopBar({
  children,
  subtitle,
  back,
  action,
}: {
  children: ReactNode;
  subtitle?: string;
  /** Куда ведёт стрелка назад. Без неё стрелки нет. */
  back?: string;
  /** Действие справа от заголовка. */
  action?: ReactNode;
}) {
  return (
    <header className="bleed rounded-card bg-surface px-4 pb-4 pt-[calc(20px+env(safe-area-inset-top))]">
      {back ? (
        <Link
          href={back}
          aria-label="Назад"
          className="pressable -ml-2 mb-1 inline-flex size-11 items-center justify-center rounded-full text-text-secondary hover:bg-sunken"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
      ) : null}

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-h1 font-extrabold">{children}</h1>
          {subtitle ? (
            <p className="mt-1 max-w-[42ch] text-small text-text-secondary">{subtitle}</p>
          ) : null}
        </div>
        {action}
      </div>
    </header>
  );
}

/**
 * Белый хвост экрана: последняя плашка продолжается до нижнего края.
 * Ставится последним элементом внутри `.screen`.
 */
export function ScreenTail() {
  return <div className="screen-tail" aria-hidden />;
}


/**
 * Прилипшая снизу панель отправки.
 *
 * Формы здесь длинные — анкета на десять вопросов, создание турнира. Гонять
 * игрока к низу страницы ради единственной кнопки незачем, поэтому кнопка
 * едет вместе с ним. Растушёвка сверху нужна, чтобы контент уходил под панель
 * не обрубленным краем.
 */
export function StickyBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-sticky -mx-4 mt-1 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 top-0 -z-1 bg-linear-to-t from-canvas from-70% to-transparent"
      />
      {children}
    </div>
  );
}

/**
 * Плашка — смысловой блок целиком.
 *
 * Заголовок живёт ВНУТРИ плашки, а не над ней. Это и есть основной приём
 * этой стилистики: экран собран из белых скруглённых блоков, разделённых
 * серыми разрывами, и разрыв отделяет один смысл от другого. Заголовок,
 * вынесенный на серый фон, разрывает блок пополам: подпись оказывается по
 * одну сторону границы, а то, что она называет, — по другую.
 *
 * Отсюда же и цвет содержимого: внутри белой плашки строки и карточки
 * серые. Белое на белом пришлось бы отделять тенью или рамкой, а глубина
 * здесь держится только заливками.
 */
export function Panel({
  title,
  action,
  children,
  tone = 'default',
  className = '',
}: {
  title?: ReactNode;
  /** Ссылка «дальше» справа от заголовка. */
  action?: ReactNode;
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <section className={`bleed rounded-card p-4 ${TONES[tone]} ${className}`}>
      {title ? (
        <header className="mb-3 flex min-h-8 items-center justify-between gap-3">
          <h2 className="text-h2 font-bold">{title}</h2>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/**
 * Заголовок секции с необязательной ссылкой «дальше».
 *
 * Подпись слева и действие справа на одной базовой линии: на 390 px это
 * единственный способ дать секции продолжение, не отнимая у неё строку.
 */
export function SectionHeader({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3">
      <h2 className="text-h2 font-bold">{children}</h2>
      {action}
    </div>
  );
}

/**
 * Ссылка «дальше» в заголовке секции.
 *
 * Отрицательные поля возвращают строке визуальную высоту текста, оставляя
 * области нажатия полные 44 px: текстовая ссылка в 20 px — самая частая
 * причина промахов на телефоне.
 */
export function MoreLink({ children }: { children: ReactNode }) {
  return (
    <span className="-my-3 -mr-2 flex min-h-11 items-center px-2 text-body font-medium text-accent">
      {children}
    </span>
  );
}

/**
 * Пустое состояние: зовёт к действию, а не извиняется (ТЗ §9).
 *
 * Пустой экран — самое частое первое впечатление, и строчка серого текста
 * оставляет игрока без единой подсказки, что делать дальше.
 */
export function EmptyState({
  title,
  hint,
  action,
  variant = 'card',
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  /**
   * card — для главного пустого состояния экрана: рамка, подсказка, кнопка.
   * quiet — для второстепенных лент: одна строка.
   *
   * Разница нужна не ради красоты. Три одинаковые пунктирные рамки подряд
   * весят одинаково, и игрок не понимает, с чего начать; тихая строка рядом
   * с полноценным призывом сразу показывает, что важнее.
   */
  variant?: 'card' | 'quiet';
}) {
  if (variant === 'quiet') {
    return (
      <p className="text-small text-muted">
        {title}
        {hint ? <span className="block text-small text-faint">{hint}</span> : null}
      </p>
    );
  }

  return (
    <div className="rounded-card border border-dashed border-border-strong px-4 py-7 text-center">
      <p className="text-body font-medium">{title}</p>
      {hint ? <p className="mx-auto mt-1 max-w-[34ch] text-small text-muted">{hint}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
