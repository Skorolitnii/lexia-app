import { Skeleton, Spinner } from '@/components/Loading'
import { initialsFromEmail } from '@/components/initials'
import { useOnline } from '@/components/useOnline'
import { useSession } from '@/supabase/useSession'

/**
 * Низ сайдбара: кто вошёл и где живут данные. Заменяет прежний `SyncIndicator`
 * в десктопном рейле (макет «Пустой экран v2»), но говорит ровно то же самое -
 * состояние хранилища, а не мнимую фоновую синхронизацию (её нет, см. handoff).
 *
 * Без Supabase (локальный dev-режим) сессии не бывает: показываем это честно,
 * а не выдумываем аккаунт.
 */
export function AccountBadge() {
  const { session, loading } = useSession()
  const online = useOnline()

  const email = session?.user.email ?? null

  const status = loading
    ? 'Проверка входа…'
    : email
      ? online
        ? 'Синхронизировано'
        : 'Нет сети'
      : 'Только на этом устройстве'

  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5">
      {/* Залитый brand-кружок - признак живого аккаунта (макет 3c). Без входа
          он был бы ложным сигналом, поэтому там нейтральная песочная плашка. */}
      <div
        className={[
          'flex size-[30px] shrink-0 items-center justify-center rounded-full text-[12.5px] font-extrabold',
          email ? 'bg-brand text-avatar-ink' : 'bg-track text-hint',
        ].join(' ')}
        aria-hidden
      >
        {loading ? <Spinner size={14} /> : email ? initialsFromEmail(email) : '-'}
      </div>
      <div className="min-w-0">
        {/* Пока сессия проверяется, имени ещё нет - но и «Без входа» здесь было
            бы враньём: вошли мы или нет, как раз выясняется. Показываем
            плейсхолдер, а не утверждение, которое через миг может смениться. */}
        <div className="truncate text-[13px] font-bold text-nav-ink">
          {loading ? <Skeleton className="h-3 w-[104px] rounded-[4px]" /> : (email ?? 'Без входа')}
        </div>
        <div className="truncate text-[11.5px] text-faint">{status}</div>
      </div>
    </div>
  )
}
