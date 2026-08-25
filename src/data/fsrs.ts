import {
  createEmptyCard,
  fsrs,
  Rating,
  type Card as FsrsCard,
  type Grade,
  type RecordLog,
} from 'ts-fsrs'
import type { CardRow, Direction, NoteRow, ReviewLogRow } from '@/types'

export const scheduler = fsrs({ enable_fuzz: true, enable_short_term: true })

/** Строка карточки → объект ts-fsrs (даты - в Date). */
export function rowToFsrs(row: CardRow): FsrsCard {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
    learning_steps: row.learning_steps,
  }
}

/** Поля состояния FSRS из объекта ts-fsrs → патч строки (даты - в ISO). */
export function fsrsToPatch(c: FsrsCard) {
  return {
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.toISOString() : null,
    learning_steps: c.learning_steps,
  }
}

/** Какие направления нужны заметке по её типу и `reverse` (§3). */
export function directionsFor(n: NoteRow): Direction[] {
  if (n.type === 'cloze') return ['cloze']
  return n.reverse ? ['forward', 'reverse'] : ['forward']
}

/** Карточки для заметки (без user_id - проставляет слой хранилища). */
export function buildCardsForNote(n: NoteRow): Omit<CardRow, 'user_id'>[] {
  const now = new Date().toISOString()
  return directionsFor(n).map((direction) => ({
    id: crypto.randomUUID(),
    note_id: n.id,
    direction,
    ...fsrsToPatch(createEmptyCard()),
    suspended: false,
    created_at: now,
    updated_at: now,
    deleted: false,
  }))
}

/** Применить оценку: вернуть патч карточки и строку журнала (без user_id). */
export function applyReview(card: CardRow, rating: Grade, now = new Date()) {
  const { card: next, log } = scheduler.next(rowToFsrs(card), now, rating)
  const logRow: Omit<ReviewLogRow, 'user_id' | 'created_at'> = {
    id: crypto.randomUUID(),
    card_id: card.id,
    rating: log.rating,
    state: log.state,
    due: log.due.toISOString(),
    stability: log.stability,
    difficulty: log.difficulty,
    elapsed_days: log.elapsed_days,
    last_elapsed_days: log.last_elapsed_days,
    scheduled_days: log.scheduled_days,
    review: log.review.toISOString(),
  }
  return { cardPatch: fsrsToPatch(next), logRow }
}

/** Превью интервалов для всех оценок (для подписей на кнопках). */
export function previewIntervals(card: CardRow, now = new Date()): RecordLog {
  return scheduler.repeat(rowToFsrs(card), now)
}

export { Rating }
