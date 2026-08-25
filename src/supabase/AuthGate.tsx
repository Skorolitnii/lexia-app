import { useEffect, useState, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { LoadingScreen, Spinner } from '@/components/Loading'
import { isSupabaseConfigured, supabase } from '@/supabase/client'
import { authErrorMessage, looksLikeEmail, otpErrorMessage } from '@/supabase/email'
import { useSession } from '@/supabase/useSession'

/**
 * Гейт аутентификации: без сессии всё приложение недоступно, показываем
 * полноэкранный вход. Обёрнут вокруг `RepoProvider`/`App` в `main.tsx`, чтобы
 * до входа не открывался ни репозиторий, ни маршруты.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useSession()

  // Без Supabase приложение работает на локальной базе (dev без `.env.local`) -
  // гейтить нечем и незачем, пускаем внутрь как раньше.
  if (!isSupabaseConfigured || !supabase) return <>{children}</>

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface">
        <LoadingScreen label="Проверяю сессию…" />
      </div>
    )
  }

  if (session) return <>{children}</>

  return <SignInScreen client={supabase} />
}

/** Знак «Стопка» - тот же, что в сайдбаре и favicon. */
function BrandMark() {
  return (
    <svg viewBox="0 0 64 64" className="size-14" aria-hidden="true">
      <g transform="rotate(-8 32 32)">
        <rect
          x="16"
          y="11"
          width="30"
          height="42"
          rx="7"
          strokeWidth={2.5}
          className="fill-card stroke-brand-strong"
        />
      </g>
      <g transform="rotate(7 34 34)">
        <rect x="20" y="13" width="30" height="42" rx="7" className="fill-brand" />
        <rect x="27" y="37" width="12" height="4" rx="2" fill="#fff" opacity=".55" />
        <rect x="27" y="44" width="17" height="4" rx="2" fill="#fff" />
      </g>
    </svg>
  )
}

/** Конверт слева в поле email; красится через `.login-field:focus-within`. */
function MailIcon() {
  return (
    <svg
      className="login-icon pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-icon-idle"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </svg>
  )
}

/** Замок у подписи «пароль не нужен»; инлайн-глиф перед текстом. */
function LockIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mr-1.5 inline-block align-[-2px]"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

/**
 * Медальон «письмо отправлено»: круг с конвертом и зелёный бейдж-галочка
 * снизу-справа. Только для sent-состояния, поэтому локально.
 */
function SentBadge() {
  return (
    <div className="relative mb-[18px] size-[60px]" aria-hidden="true">
      <div className="flex size-[60px] items-center justify-center rounded-full bg-brand-wash text-brand-strong">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 7-10 6L2 7" />
        </svg>
      </div>
      <div className="absolute -right-[3px] -bottom-[3px] flex size-6 items-center justify-center rounded-full border-[3px] border-white bg-brand text-white">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
    </div>
  )
}

/** Стрелка «‹» у ссылки «Изменить адрес». */
function ChevronLeftIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

/**
 * Email отдельной строкой: выделен, но не «кнопка». Единственная разрешённая
 * точка переноса - перед `@` (`<wbr>`): локальная часть и домен по отдельности
 * неразрывны, поэтому адрес либо целиком в строку, либо аккуратно ломается по
 * `@` - без разрыва посреди слова и без осиротевшего `.ru`. `break-words` на
 * контейнере - крайний фолбэк, если сама часть шире карточки.
 */
function Email({ address, className }: { address: string; className?: string }) {
  const at = address.lastIndexOf('@')
  const local = at === -1 ? address : address.slice(0, at)
  const domain = at === -1 ? '' : address.slice(at)
  return (
    <div className={className}>
      {/* Локальная часть предпочтительно рвётся по `@` (см. `<wbr>` ниже), но
          `break-all` разрешает разрыв и внутри - иначе адрес длиннее карточки
          вылез бы за край. Домен неразрывен: `.ru` не должен осиротеть. */}
      <span className="break-all">{local}</span>
      {domain && (
        <>
          <wbr />
          <span className="whitespace-nowrap">{domain}</span>
        </>
      )}
    </div>
  )
}

const RESEND_COOLDOWN = 30 // сек; совпадает с ограничением Supabase на письма
// Длина токена из письма. Задаётся на стороне Supabase (Authentication →
// Providers → Email → Email OTP Length) - здесь только зеркало той настройки:
// разойдутся - поле обрежет код, и войти станет нельзя.
const CODE_LENGTH = 6

/**
 * Ввод кода из письма. Одно настоящее поле (не шесть отдельных): на мобильных
 * шесть инпутов ломают автоподстановку и пляшут с фокусом, а `one-time-code`
 * на одном поле iOS понимает и предлагает код из письма прямо над клавиатурой.
 * Ячейки под полем - визуальные, поле лежит поверх них прозрачным слоем.
 */
function CodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
}: {
  value: string
  onChange: (v: string) => void
  onComplete: (v: string) => void
  disabled: boolean
  invalid: boolean
}) {
  const cells = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? '')

  // Чистим ввод от всего, кроме цифр: вставка из письма часто приходит с
  // пробелами или переносом, а «123 456» не должно ломать автосабмит.
  const handle = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, CODE_LENGTH)
    onChange(digits)
    if (digits.length === CODE_LENGTH) onComplete(digits)
  }

  return (
    <div className="relative w-full">
      <input
        id="lx-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={CODE_LENGTH}
        value={value}
        disabled={disabled}
        onChange={(e) => handle(e.target.value)}
        aria-label="Код из письма"
        aria-invalid={invalid}
        // Поле прозрачное и лежит поверх ячеек: видимые цифры рисуют ячейки,
        // а каретку и выделение прячем, чтобы не двоилось с ними.
        className="absolute inset-0 z-10 w-full cursor-text bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent"
      />
      <div className="flex justify-between gap-2" aria-hidden="true">
        {cells.map((char, i) => {
          // Подсвечиваем ячейку, в которую сейчас пойдёт цифра; когда код
          // набран полностью - последнюю, иначе рамка гаснет на готовом коде.
          const active =
            !disabled &&
            (i === value.length || (value.length === CODE_LENGTH && i === CODE_LENGTH - 1))
          return (
            <div
              key={i}
              className={`flex h-[54px] flex-1 items-center justify-center rounded-field border-[1.5px] bg-surface font-mono text-[22px] font-bold text-ink transition-colors ${
                invalid ? 'border-again' : active ? 'border-brand' : 'border-line'
              }`}
            >
              {char}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SignInScreen({ client }: { client: SupabaseClient }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [code, setCode] = useState('')
  const [codeInvalid, setCodeInvalid] = useState(false)

  const trimmedEmail = email.trim()

  // Тик кулдауна: эффект пересоздаёт интервал только когда cooldown ПЕРЕХОДИТ
  // в ноль/из нуля (зависимость - булев `cooldown === 0`), а не каждую секунду.
  // Тики внутри интервала сами уменьшают счётчик через setCooldown.
  useEffect(() => {
    if (cooldown === 0) return
    const t = setInterval(() => {
      setCooldown((c) => (c <= 1 ? 0 : c - 1))
    }, 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cooldown === 0])

  // Отправка/переотправка кода на конкретный адрес. sendCode валидирует ввод
  // из формы; resend бьёт по уже подтверждённому sentTo, поэтому вынесено сюда.
  // `emailRedirectTo` намеренно НЕ передаём: возврат по ссылке уводил бы из
  // установленной PWA в браузер, а это разные хранилища - сессия оставалась бы
  // в браузере, и на домашнем экране вход не срабатывал. Код такого разрыва не
  // создаёт: сессия появляется прямо там, где его ввели.
  const requestCode = async (address: string) => {
    setBusy(true)
    setStatus(null)
    const { error } = await client.auth.signInWithOtp({ email: address })
    setBusy(false)
    if (error) {
      setStatus(authErrorMessage(error))
      return false
    }
    setCooldown(RESEND_COOLDOWN)
    return true
  }

  const sendCode = async () => {
    if (!looksLikeEmail(trimmedEmail)) {
      setInvalid(true)
      setStatus(null)
      return
    }
    setInvalid(false)
    if (await requestCode(trimmedEmail)) setSentTo(trimmedEmail)
  }

  // Проверка кода. Успех не трогает состояние экрана: `onAuthStateChange` в
  // `useSession` поднимет сессию, и AuthGate сам сменит экран на приложение.
  const verifyCode = async (token: string) => {
    if (!sentTo || busy) return
    setBusy(true)
    setStatus(null)
    setCodeInvalid(false)
    const { error } = await client.auth.verifyOtp({ email: sentTo, token, type: 'email' })
    setBusy(false)
    if (error) {
      setCodeInvalid(true)
      setStatus(otpErrorMessage(error))
      // Чистим поле: иначе поверх неверного кода нельзя набрать новый, не
      // стирая его вручную, - на телефоне это особенно раздражает.
      setCode('')
    }
  }

  const resend = () => {
    if (busy || cooldown > 0 || !sentTo) return
    setCode('')
    setCodeInvalid(false)
    void requestCode(sentTo)
  }

  const changeEmail = () => {
    setSentTo(null)
    setStatus(null)
    setCooldown(0)
    setCode('')
    setCodeInvalid(false)
  }

  const canSubmit = !busy && trimmedEmail !== ''

  return (
    <div className="flex h-full flex-col items-center justify-center bg-login-bg px-6 py-10">
      <div className="flex w-full max-w-[440px] flex-col items-center">
        <div className="mb-3.5 flex items-center gap-1">
          <BrandMark />
          <div className="text-[30px] font-extrabold tracking-[-0.01em] text-ink">Lexia</div>
        </div>
        <div className="mb-[30px] text-[16px] font-semibold text-muted">
          {sentTo ? 'Остался один шаг' : 'Войдите, чтобы продолжить'}
        </div>

        {sentTo ? (
          <div className="flex w-full flex-col items-center rounded-card bg-card px-[30px] py-[34px] text-center shadow-login-card">
            <SentBadge />
            <div className="text-[20px] font-extrabold text-ink">Проверьте почту</div>
            <div className="mt-2 text-[14.5px] text-label">Код для входа отправлен на</div>
            <Email address={sentTo} className="mt-1 text-[16px] font-bold text-ink" />

            <form
              className="w-full"
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                if (code.length === CODE_LENGTH) void verifyCode(code)
              }}
            >
              <label
                htmlFor="lx-code"
                className="mt-5 mb-2.5 block text-[13px] font-medium text-label"
              >
                Введите {CODE_LENGTH} цифр из письма
              </label>
              <CodeInput
                value={code}
                onChange={(v) => {
                  setCode(v)
                  if (codeInvalid) {
                    setCodeInvalid(false)
                    setStatus(null)
                  }
                }}
                onComplete={(v) => void verifyCode(v)}
                disabled={busy}
                invalid={codeInvalid}
              />

              {/* Ошибка живёт вплотную к ячейкам, а не в подвале карточки:
                  относится к ним, и читать её надо до кнопки. */}
              {status && (
                <div
                  role="alert"
                  className={`mt-2.5 text-[12.5px] font-semibold ${codeInvalid ? 'text-again' : 'text-brand-ink'}`}
                >
                  {status}
                </div>
              )}

              {/* Кнопка - подстраховка для случая, когда автосабмит не сработал
                  (например, код дописали в середину уже набранного). */}
              <button
                type="submit"
                disabled={busy || code.length !== CODE_LENGTH}
                className="mt-4 w-full cursor-pointer rounded-field bg-brand py-[15px] text-[15.5px] font-bold text-white shadow-brand transition-[background,box-shadow] disabled:cursor-not-allowed disabled:bg-brand-muted disabled:shadow-none"
              >
                {busy ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner size={16} />
                    Проверяю…
                  </span>
                ) : (
                  'Войти'
                )}
              </button>
            </form>

            <div className="mt-5 mb-4 h-px w-full bg-line" />

            {/* Resend - outline-стиль; в кулдаун серый и заблокирован. */}
            <button
              type="button"
              onClick={resend}
              disabled={busy || cooldown > 0}
              className="w-full cursor-pointer rounded-field border-[1.5px] border-brand bg-card py-[15px] text-[15px] font-bold text-brand-ink transition-[color,border-color] disabled:cursor-not-allowed disabled:border-line disabled:text-hint"
            >
              {cooldown > 0 ? (
                <>
                  {/* Число в моно-слоте фикс. ширины (mm:ss, IBM Plex Mono):
                      при 30→9 ширина не меняется, фраза не центрируется заново,
                      поэтому текст не дёргается каждую секунду. */}
                  Отправить снова через{' '}
                  <span className="inline-block w-[3ch] text-center font-mono tabular-nums">
                    {Math.floor(cooldown / 60)}:{String(cooldown % 60).padStart(2, '0')}
                  </span>
                </>
              ) : busy ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner size={15} />
                  Отправляю…
                </span>
              ) : (
                'Отправить письмо снова'
              )}
            </button>

            <button
              type="button"
              onClick={changeEmail}
              className="mt-[18px] inline-flex cursor-pointer items-center gap-1.5 text-[13.5px] font-semibold text-label"
            >
              <ChevronLeftIcon />
              Изменить адрес
            </button>
          </div>
        ) : (
          <form
            className="w-full rounded-card bg-card px-[30px] py-8 shadow-login-card"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              void sendCode()
            }}
          >
            <label htmlFor="lx-email" className="mb-[9px] block text-[14px] font-bold text-ink-2">
              Email
            </label>
            <div
              className={`login-field relative rounded-field bg-surface ${invalid ? '!border-again' : ''}`}
            >
              <MailIcon />
              <input
                id="lx-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (invalid) setInvalid(false)
                }}
                aria-invalid={invalid}
                aria-describedby={invalid ? 'email-error' : undefined}
                placeholder="you@example.com"
                className="w-full bg-transparent py-3.5 pr-3.5 pl-[46px] text-[15px] font-semibold text-ink outline-none placeholder:text-hint"
              />
            </div>
            {invalid && (
              <div
                id="email-error"
                role="alert"
                className="mt-2 text-[12.5px] font-semibold text-again"
              >
                Похоже, в адресе опечатка
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-5 w-full cursor-pointer rounded-field bg-brand py-[15px] text-[15.5px] font-bold text-white shadow-brand transition-[background,box-shadow] disabled:cursor-not-allowed disabled:bg-brand-muted disabled:shadow-none"
            >
              {busy ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner size={16} />
                  Отправляю…
                </span>
              ) : (
                'Получить код для входа'
              )}
            </button>

            <p className="mx-auto mt-4 max-w-[14rem] text-center text-[13px] font-medium text-label lg:max-w-none">
              <LockIcon />
              Пароль не нужен - вход по коду из письма
            </p>

            {status && (
              <div className="mt-3 text-center text-[12.5px] font-semibold text-brand-ink">
                {status}
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
