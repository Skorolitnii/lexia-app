import { describe, expect, it } from 'vitest'
import { Rating, State } from 'ts-fsrs'
import type { CardRow, NoteRow } from '@/types'
import { applyReview, buildCardsForNote, directionsFor, fsrsToPatch, rowToFsrs } from '@/data/fsrs'

const NOW = new Date('2026-07-22T12:00:00Z')

function note(over: Partial<NoteRow> = {}): NoteRow {
  return {
    id: 'n1',
    user_id: 'u',
    folder_id: null,
    type: 'basic',
    front: 'otter',
    back: 'выдра',
    transcription: null,
    audio_url: null,
    image_url: null,
    details: null,
    examples: [],
    reverse: false,
    tags: [],
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    deleted: false,
    ...over,
  }
}

describe('directionsFor', () => {
  it('basic без обратной - только forward', () => {
    expect(directionsFor(note())).toEqual(['forward'])
  })

  it('basic с обратной - forward и reverse', () => {
    expect(directionsFor(note({ reverse: true }))).toEqual(['forward', 'reverse'])
  })

  it('у cloze обратной не бывает (§3)', () => {
    expect(directionsFor(note({ type: 'cloze', reverse: true }))).toEqual(['cloze'])
  })
})

describe('buildCardsForNote', () => {
  it('порождает карточку на каждое направление, все - новые', () => {
    const cards = buildCardsForNote(note({ reverse: true }))
    expect(cards.map((c) => c.direction)).toEqual(['forward', 'reverse'])
    expect(cards.every((c) => c.state === State.New)).toBe(true)
    expect(cards.every((c) => c.note_id === 'n1' && !c.deleted)).toBe(true)
  })

  it('у карточек разные id', () => {
    const [a, b] = buildCardsForNote(note({ reverse: true }))
    expect(a!.id).not.toBe(b!.id)
  })
})

describe('мост строка ↔ ts-fsrs', () => {
  it('rowToFsrs отдаёт Date, а не строку (§3 - иначе молча ломаются интервалы)', () => {
    const [row] = buildCardsForNote(note())
    const fsrsCard = rowToFsrs({ ...row!, user_id: 'u' })
    expect(fsrsCard.due).toBeInstanceOf(Date)
    expect(fsrsCard.last_review).toBeUndefined()
  })

  it('round-trip строка → ts-fsrs → строка сохраняет значения', () => {
    const [built] = buildCardsForNote(note())
    const row: CardRow = { ...built!, user_id: 'u' }
    const patch = fsrsToPatch(rowToFsrs(row))
    expect(patch.due).toBe(row.due)
    expect(patch.stability).toBe(row.stability)
    expect(patch.state).toBe(row.state)
    expect(patch.last_review).toBeNull()
  })

  it('fsrsToPatch отдаёт ISO-строки, пригодные для хранилища', () => {
    const row: CardRow = { ...buildCardsForNote(note())[0]!, user_id: 'u' }
    const { cardPatch } = applyReview(row, Rating.Good, NOW)
    expect(typeof cardPatch.due).toBe('string')
    expect(new Date(cardPatch.due).toISOString()).toBe(cardPatch.due)
    expect(cardPatch.last_review).toBe(NOW.toISOString())
  })
})

describe('applyReview', () => {
  const freshRow = (): CardRow => ({
    ...buildCardsForNote(note())[0]!,
    user_id: 'u',
  })

  it('Good продвигает новую карточку и наращивает reps', () => {
    const row = freshRow()
    const { cardPatch } = applyReview(row, Rating.Good, NOW)
    expect(cardPatch.state).not.toBe(State.New)
    expect(cardPatch.reps).toBe(1)
    expect(new Date(cardPatch.due).getTime()).toBeGreaterThan(NOW.getTime())
  })

  it('журнал ссылается на карточку и хранит состояние ДО оценки', () => {
    const row = freshRow()
    const { logRow } = applyReview(row, Rating.Good, NOW)
    // На этом свойстве держится дневной счётчик новых карточек.
    expect(logRow.state).toBe(State.New)
    expect(logRow.card_id).toBe(row.id)
    expect(logRow.rating).toBe(Rating.Good)
    expect(logRow.review).toBe(NOW.toISOString())
  })

  it('Again на выученной карточке увеличивает lapses', () => {
    const row = freshRow()
    const learned: CardRow = { ...row, ...applyReview(row, Rating.Easy, NOW).cardPatch }
    const later = new Date(NOW.getTime() + 30 * 86_400_000)
    const { cardPatch } = applyReview(learned, Rating.Again, later)
    expect(cardPatch.lapses).toBe(1)
  })

  it('Easy откладывает дальше, чем Hard', () => {
    const row = freshRow()
    const hard = applyReview(row, Rating.Hard, NOW).cardPatch
    const easy = applyReview(row, Rating.Easy, NOW).cardPatch
    expect(new Date(easy.due).getTime()).toBeGreaterThan(new Date(hard.due).getTime())
  })

  it('не мутирует исходную строку', () => {
    const row = freshRow()
    const before = { ...row }
    applyReview(row, Rating.Good, NOW)
    expect(row).toEqual(before)
  })
})
