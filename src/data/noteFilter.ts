import type { NoteRow } from '@/types'
import type { NotePageQuery } from '@/data/repo'

/**
 * Подходит ли заметка под фильтры страницы. Одна и та же логика нужна списку
 * (`listNotesPage`) и счётчикам - держим её в одном месте, чтобы серверная и
 * локальная реализации фильтровали одинаково.
 *
 * `folderId` фильтруется вызывающим (в IDB - до сортировки, на сервере - `eq`),
 * здесь только поиск и тип.
 */
export function matchesNoteQuery(
  note: NoteRow,
  q: Pick<NotePageQuery, 'search' | 'type'>,
): boolean {
  if (q.type !== 'all' && note.type !== q.type) return false
  const search = q.search.trim().toLowerCase()
  if (search) {
    const inFront = note.front.toLowerCase().includes(search)
    const inBack = (note.back ?? '').toLowerCase().includes(search)
    if (!inFront && !inBack) return false
  }
  return true
}

/** Сортировка списка заметок - по `front`, A→Я (как в прежнем `useLibrary`). */
export function compareNotesByFront(a: NoteRow, b: NoteRow): number {
  return a.front.localeCompare(b.front, 'en')
}
