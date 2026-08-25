import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRepo } from '@/data/useRepo'
import { computeStats, type Stats } from '@/stats/compute'
import type { CardRow, FolderRow, NoteRow, ReviewLogRow } from '@/types'

interface Snapshot {
  notes: NoteRow[]
  cards: CardRow[]
  logs: ReviewLogRow[]
  /** Папки нужны онбордингу пустого экрана - селект в форме заметки. */
  folders: FolderRow[]
  /** Момент загрузки - точка отсчёта. Фиксируется вне render, чтобы
   *  «сегодня» и «к повтору» не разъезжались между перерисовками. */
  loadedAt: number
}

/**
 * Статистика по журналу и карточкам.
 *
 * Данные читаются на монтирование. Этого достаточно: `<Routes>` размонтирует
 * страницу при уходе с маршрута, поэтому возврат после сессии изучения даёт
 * свежие цифры (проверено). Известный предел - вкладка, оставленная открытой
 * через полночь: «сегодня» останется вчерашним до перезагрузки.
 *
 * `reload` нужен онбордингу: колода записывается прямо на этом экране (модалки
 * или стартовая колода), и без перечитывания статистика осталась бы пустой,
 * хотя слова уже есть.
 */
export function useStats(): {
  loading: boolean
  stats: Stats | null
  folders: FolderRow[]
  error: boolean
  reload: () => void
} {
  const repo = useRepo()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((n) => n + 1), [])

  useEffect(() => {
    let active = true
    Promise.all([repo.listNotes(), repo.listCards(), repo.listReviewLogs(), repo.listFolders()])
      .then(([notes, cards, logs, folders]) => {
        if (active) setSnapshot({ notes, cards, logs, folders, loadedAt: Date.now() })
      })
      // Без catch отказ хранилища оставил бы страницу навсегда в загрузке
      // и дал unhandled rejection.
      .catch(() => {
        if (active) setError(true)
      })
    return () => {
      active = false
    }
  }, [repo, reloadKey])

  const stats = useMemo(() => {
    if (!snapshot) return null
    return computeStats({
      cards: snapshot.cards,
      logs: snapshot.logs,
      noteCount: snapshot.notes.length,
      noteCreatedAt: snapshot.notes.map((n) => n.created_at),
      now: new Date(snapshot.loadedAt),
    })
  }, [snapshot])

  // При `reload` снапшот намеренно остаётся прежним до прихода данных: экран
  // не схлопывается в скелетон, а просто обновляет цифры на месте.
  return {
    loading: snapshot === null && !error,
    stats,
    folders: snapshot?.folders ?? [],
    error,
    reload,
  }
}
