import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Spinner } from '@/components/Loading'
import { isSupabaseConfigured, supabase } from '@/supabase/client'
import { useSession } from '@/supabase/useSession'

const btnCls =
  'flex shrink-0 cursor-pointer items-center gap-2 rounded-[10px] bg-rail px-3.5 py-2 text-[13px] font-bold text-muted-2 disabled:cursor-not-allowed disabled:opacity-50'

/**
 * Блок «Аккаунт» в настройках. Сам вход живёт в `AuthGate` (без сессии сюда не
 * попасть), поэтому здесь только показ вошедшего пользователя и выход.
 */
export function AccountPanel() {
  // Клиент передаём вниз параметром, а не сужаем `supabase` в замыканиях:
  // сужение по `if` внутрь колбэков не переносится, а `!` скрыл бы то самое
  // состояние «не настроено», ради которого проверка и нужна.
  if (!isSupabaseConfigured || !supabase) {
    return (
      <p className="px-4 py-3.5 text-[13px] text-faint">
        Supabase не настроен: нет переменных в <code>.env.local</code> (см.{' '}
        <code>.env.example</code>).
      </p>
    )
  }
  return <Account client={supabase} />
}

function Account({ client }: { client: SupabaseClient }) {
  const { session, loading } = useSession()

  if (loading) {
    return (
      <p className="flex items-center gap-2 px-4 py-3.5 text-[13px] text-faint">
        <Spinner size={14} />
        Проверяю сессию…
      </p>
    )
  }
  // Без сессии AccountPanel не рендерится (AuthGate перехватывает раньше).
  if (!session) return null

  return <SignedIn client={client} email={session.user.email ?? ''} />
}

function SignedIn({ client, email }: { client: SupabaseClient; email: string }) {
  const [busy, setBusy] = useState(false)

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <div className="truncate text-[14.5px] font-semibold text-ink">{email}</div>
        <div className="mt-0.5 text-[12.5px] text-faint-2">Вход выполнен</div>
      </div>
      <button
        type="button"
        className={btnCls}
        onClick={() => {
          setBusy(true)
          void client.auth.signOut()
        }}
        disabled={busy}
      >
        {busy && <Spinner size={13} />}
        {busy ? 'Выхожу…' : 'Выйти'}
      </button>
    </div>
  )
}
