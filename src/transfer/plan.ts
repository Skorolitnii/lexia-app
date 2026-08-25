import type { NoteRow } from '@/types'
import { duplicateKey, type DeckNote } from '@/transfer/deck'

/**
 * План импорта: что именно будет создано, что пропущено и почему.
 * Отдельно от UI, чтобы превью и запись считались по одним правилам -
 * иначе «Импортировать 23» и реальные 24 записи разъезжаются.
 *
 * Считается ЦЕЛИКОМ из разобранного файла, без единого запроса: слово,
 * перевод, тип и дубликаты видны и без словаря. Транскрипцию дотягивает
 * сервер при импорте (`import-deck`) - в превью её больше нет, и ради неё
 * колода не ходит в Datamuse полусотней запросов.
 */

export interface PlanRow {
  note: DeckNote
  /** Дубликат: такое же слово уже есть в целевой папке (§4) - пропускаем. */
  duplicate: boolean
  /** Пользователь убрал строку из импорта (можно вернуть). */
  excluded: boolean
}

export interface ImportPlan {
  rows: PlanRow[]
  /** Сколько заметок будет реально создано. */
  willImport: number
  duplicates: number
}

/**
 * Дубликатом считаем совпадение front внутри ЦЕЛЕВОЙ папки (§4), а не по всей
 * базе: одно слово в разных папках - это разные колоды, не задвоение.
 *
 * Дубликаты внутри самого файла тоже ловятся: первая заметка «занимает» ключ,
 * следующая с тем же словом уже видит его в наборе.
 */
export function buildPlan(
  notes: DeckNote[],
  existing: NoteRow[],
  folderId: string | null,
  /** Индексы строк, убранных пользователем из импорта. */
  excluded: ReadonlySet<number> = new Set(),
): ImportPlan {
  const taken = new Set(
    existing.filter((n) => n.folder_id === folderId).map((n) => duplicateKey(n.front)),
  )

  const rows: PlanRow[] = notes.map((note, i) => {
    const key = duplicateKey(note.front)
    const duplicate = taken.has(key)
    // Исключённая строка не «занимает» ключ: вернув её, пользователь не должен
    // внезапно увидеть её же дубликатом ниже по списку.
    if (!duplicate && !excluded.has(i)) taken.add(key)
    return { note, duplicate, excluded: excluded.has(i) }
  })

  // Импортируем строку, если она не дубликат и не убрана вручную.
  const importable = (r: PlanRow) => !r.duplicate && !r.excluded

  return {
    rows,
    willImport: rows.filter(importable).length,
    duplicates: rows.filter((r) => r.duplicate).length,
  }
}
