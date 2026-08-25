import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { IdbRepository } from '@/data/idb'
import { RepoContext } from '@/data/RepoContext'
import { seedIfEmpty } from '@/data/seed'
import { SupabaseRepository } from '@/data/supabase-repo'
import type { Repository } from '@/data/repo'
import { supabase } from '@/supabase/client'
import { useSession } from '@/supabase/useSession'

/**
 * Одно открытие+засев локальной базы на всё приложение. Промис-синглтон
 * защищает от гонки при двойном монтировании эффекта в StrictMode (иначе
 * засев выполнится дважды).
 */
let repoPromise: Promise<Repository> | null = null
function getLocalRepo(): Promise<Repository> {
  repoPromise ??= IdbRepository.open().then(async (r) => {
    await seedIfEmpty(r)
    return r
  })
  return repoPromise
}

export function RepoProvider({ children }: { children: ReactNode }) {
  const { session, loading: sessionLoading } = useSession()
  const [localRepo, setLocalRepo] = useState<Repository | null>(null)
  const [error, setError] = useState<Error | null>(null)

  // Есть сессия - работаем с сервером, нет - с локальной базой. Смотрим на
  // user.id, а не на объект сессии: он пересоздаётся при каждом обновлении
  // токена, и репозиторий пересобирался бы каждый час на ровном месте.
  const signedIn = session !== null && supabase !== null

  // Серверный репозиторий создаётся прямо в рендере: это дешёвый объект без
  // открытия соединения, и гнать его через состояние значило бы лишний проход
  // рендера ради ничего. Локальная база так не умеет - её открытие асинхронно.
  const serverRepo = useMemo(
    () => (signedIn && supabase ? new SupabaseRepository(supabase) : null),
    [signedIn],
  )

  useEffect(() => {
    // Пока сессия не проверена - ждём: иначе на старте мелькнёт локальная база,
    // UI успеет её прочитать, и после входа данные сменятся под руками.
    // Вошли - локальная база не нужна вовсе, не открываем её.
    if (sessionLoading || signedIn) return

    let active = true
    getLocalRepo().then(
      (r) => {
        if (active) setLocalRepo(r)
      },
      (e: unknown) => {
        // Промис-синглтон закэшировал бы отказ навсегда - сбрасываем,
        // чтобы перезагрузка страницы могла попробовать снова.
        repoPromise = null
        if (active) setError(e instanceof Error ? e : new Error(String(e)))
      },
    )
    return () => {
      active = false
    }
  }, [sessionLoading, signedIn])

  // `signedIn` и `serverRepo` заводятся из одного условия: если вошли, серверный
  // репозиторий уже не null, и до локального дело не доходит.
  const repo = serverRepo ?? localRepo

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-bold text-ink">Не удалось открыть локальную базу</p>
        <p className="text-sm text-faint">{error.message}</p>
        <p className="text-sm text-faint">
          Закройте другие вкладки приложения и перезагрузите страницу.
        </p>
      </div>
    )
  }

  if (!repo) return null
  return <RepoContext value={repo}>{children}</RepoContext>
}
