import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/supabase/client'

export interface SessionState {
  /** `null` - не вошли. Пока идёт первая проверка, здесь тоже `null`. */
  session: Session | null
  /** Первая проверка сессии не завершена: токен читается из хранилища асинхронно. */
  loading: boolean
}

/**
 * Текущая сессия Supabase.
 *
 * `onAuthStateChange` вызывается и сразу после подписки (текущим состоянием),
 * поэтому отдельный `getSession()` не нужен - иначе получилось бы два
 * источника правды и гонка между ними на старте.
 */
export function useSession(): SessionState {
  const [session, setSession] = useState<Session | null>(null)
  // Без клиента грузить нечего - сразу «проверено, не вошли».
  const [loading, setLoading] = useState(supabase !== null)

  useEffect(() => {
    if (!supabase) return

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setLoading(false)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return { session, loading }
}
