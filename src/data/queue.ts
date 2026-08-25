import { State } from 'ts-fsrs'
import type { CardRow, NoteRow } from '@/types'

/**
 * Область изучения: все папки либо конкретный набор.
 * Сентинел `NO_FOLDER` в наборе означает «заметки без папки» (folder_id = null) -
 * так «Без папки» становится обычным выбираемым пунктом и переживает URL.
 */
export type Scope = { kind: 'all' } | { kind: 'folders'; folderIds: string[] }

/** Псевдо-id папки для заметок без папки в `Scope.folderIds`. */
export const NO_FOLDER = 'none'

export interface QueueOptions {
  scope: Scope
  /**
   * Сколько новых карточек ещё можно ввести сегодня: дневной лимит минус
   * уже введённые (`countNewCardsIntroduced`). Именно остаток, а не сам лимит -
   * иначе рестарт сессии каждый раз подтягивал бы новую порцию.
   */
  newCardsLeft: number
  /** Cram: берём все карточки папки вне расписания и не трогаем FSRS. */
  cram?: boolean
  /** Learn берёт новые, review - только подошедшие повторения, all - старое смешение. */
  kind?: 'all' | 'learn' | 'review'
  now?: Date
}

function inScope(note: NoteRow | undefined, scope: Scope): boolean {
  if (!note) return false
  if (scope.kind === 'all') return true
  // Заметка без папки попадает в область, только если явно выбран NO_FOLDER.
  const key = note.folder_id ?? NO_FOLDER
  return scope.folderIds.includes(key)
}

/** Перемешать (Fisher–Yates), не мутируя вход. */
function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/**
 * Собрать очередь на изучение (in-memory, без серверного запроса).
 * Новые карточки ограничиваются лимитом, затем всё перемешивается.
 * `cards`/`notes` уже отфильтрованы по `deleted = false` слоем данных.
 */
export function buildQueue(
  cards: CardRow[],
  notes: NoteRow[],
  {
    scope,
    newCardsLeft,
    cram = false,
    kind = 'all',
    now = new Date(),
  }: QueueOptions,
): CardRow[] {
  const notesById = new Map(notes.map((n) => [n.id, n]))
  const scoped = cards.filter(
    (c) => !c.suspended && inScope(notesById.get(c.note_id), scope),
  )

  // Cram: вся папка вне расписания, порядок случайный.
  if (cram) return shuffle(scoped)

  const due = scoped.filter(
    (c) => c.state !== State.New && new Date(c.due) <= now,
  )
  const fresh = scoped.filter((c) => c.state === State.New)
  if (kind === 'learn')
    return shuffle(fresh).slice(0, Math.max(0, newCardsLeft))
  if (kind === 'review') return shuffle(due)
  return shuffle([
    ...due,
    ...shuffle(fresh).slice(0, Math.max(0, newCardsLeft)),
  ])
}

/**
 * Почему очередь пуста и что за ней стоит - для итогового экрана. Без этих
 * цифр он говорит «возвращайтесь позже», не различая «дневная норма выбрана»
 * (в папке ещё 30 слов, но лимит) и «всё выучено» (брать нечего вовсе).
 */
export interface QueueOutlook {
  /** Новые карточки в области, не попавшие в очередь из-за дневного лимита. */
  newBeyondLimit: number
  /** Когда подойдёт срок ближайшей карточки; null - таких нет вовсе. */
  nextDueAt: Date | null
}

export function queueOutlook(
  cards: CardRow[],
  notes: NoteRow[],
  { scope, newCardsLeft, now = new Date() }: Omit<QueueOptions, 'cram'>,
): QueueOutlook {
  const notesById = new Map(notes.map((n) => [n.id, n]))
  const scoped = cards.filter(
    (c) => !c.suspended && inScope(notesById.get(c.note_id), scope),
  )

  const fresh = scoped.filter((c) => c.state === State.New).length
  // Отрицательный остаток (норму уже перебрали добором) не должен «съедать»
  // резерв: за лимитом всё равно стоят все новые карточки папки.
  const newBeyondLimit = Math.max(0, fresh - Math.max(0, newCardsLeft))

  // Ближайший срок среди тех, что ещё не подошли: именно его показываем как
  // «вернитесь через ...». Просроченные сюда не попадают - они уже в очереди.
  const upcoming = scoped
    .filter((c) => c.state !== State.New && new Date(c.due) > now)
    .map((c) => new Date(c.due).getTime())
  return {
    newBeyondLimit,
    nextDueAt: upcoming.length ? new Date(Math.min(...upcoming)) : null,
  }
}

/** Счётчики для панели сессии. */
export function queueCounts(queue: CardRow[]) {
  const fresh = queue.filter((c) => c.state === State.New).length
  return { total: queue.length, fresh, review: queue.length - fresh }
}
