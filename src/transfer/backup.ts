import type { CardRow, FolderRow, NoteRow, ReviewLogRow, SettingsRow } from '@/types'

/**
 * Полный бэкап (§5): loseless JSON со состоянием FSRS.
 * В отличие от колоды нейросети (`deck.ts`), это НАШ формат - он вывозит
 * карточки, журнал и настройки, чтобы перенос на другое устройство не терял
 * прогресс. Строки кладём как есть: даты уже ISO, конвертация не нужна.
 */

export const BACKUP_VERSION = 1

export interface Backup {
  version: number
  exported_at: string
  folders: FolderRow[]
  notes: NoteRow[]
  cards: CardRow[]
  review_logs: ReviewLogRow[]
  settings: SettingsRow | null
}

/** Содержимое бэкапа без служебных полей - то, что кладём в хранилище. */
export type BackupData = Omit<Backup, 'version' | 'exported_at'>

export class BackupParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupParseError'
  }
}

/**
 * Бэкап включает и soft-deleted строки: восстановление должно вернуть базу
 * ровно в прежний вид, а «удалённое» ещё нужно синку, чтобы не воскресить
 * запись на другом устройстве.
 */
export function buildBackup(data: BackupData): Backup {
  return {
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    ...data,
  }
}

/**
 * Строки без `id` отсекаем здесь, а не в IndexedDB: store заведён с
 * keyPath 'id', и такой put валит всю транзакцию восстановления - пользователь
 * получил бы «Не удалось восстановить данные» без единого намёка на причину.
 */
function asRows<T>(value: unknown, name: string): T[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new BackupParseError(`Поле ${name} должно быть списком`)

  const rows = value.filter((r): r is T => !!r && typeof r === 'object')
  const broken = rows.filter((r) => typeof (r as { id?: unknown }).id !== 'string').length
  if (broken > 0) {
    throw new BackupParseError(`В ${name} ${broken} записей без id - файл повреждён`)
  }
  return rows
}

export function parseBackup(text: string): Backup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BackupParseError('Файл не похож на JSON')
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new BackupParseError('Ожидался объект бэкапа')
  }

  const o = data as Record<string, unknown>

  // Версия из будущего означает поля, которых мы не знаем: молча «восстановить»
  // такой файл значит тихо потерять их часть.
  if (typeof o.version === 'number' && o.version > BACKUP_VERSION) {
    throw new BackupParseError(
      `Бэкап версии ${o.version}, приложение понимает до ${BACKUP_VERSION}`,
    )
  }
  // Файл колоды от нейросети легко перепутать с бэкапом: у него есть notes,
  // но нет карточек - восстановление стёрло бы весь прогресс.
  if (!Array.isArray(o.notes) || !Array.isArray(o.cards)) {
    throw new BackupParseError('Это не бэкап: нет notes и cards (для колоды - «Импорт колоды»)')
  }

  const settings = o.settings && typeof o.settings === 'object' ? (o.settings as SettingsRow) : null

  return {
    version: typeof o.version === 'number' ? o.version : BACKUP_VERSION,
    exported_at: typeof o.exported_at === 'string' ? o.exported_at : new Date().toISOString(),
    folders: asRows<FolderRow>(o.folders, 'folders'),
    notes: asRows<NoteRow>(o.notes, 'notes'),
    cards: asRows<CardRow>(o.cards, 'cards'),
    review_logs: asRows<ReviewLogRow>(o.review_logs, 'review_logs'),
    settings,
  }
}

/** Имя файла бэкапа с датой: lexia-backup-2026-07-22.json. */
export function backupFileName(now = new Date()): string {
  return `lexia-backup-${now.toISOString().slice(0, 10)}.json`
}
