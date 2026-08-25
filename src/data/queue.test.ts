import { describe, expect, it } from 'vitest'
import { State } from 'ts-fsrs'
import type { CardRow, NoteRow } from '@/types'
import {
  buildQueue,
  queueCounts,
  queueOutlook,
  NO_FOLDER,
  type Scope,
} from '@/data/queue'

const NOW = new Date('2026-07-22T12:00:00Z')
const DAY = 86_400_000

function note(id: string, folder_id: string | null): NoteRow {
  return {
    id,
    user_id: 'u',
    folder_id,
    type: 'basic',
    front: id,
    back: null,
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
  }
}

function card(
  id: string,
  note_id: string,
  over: Partial<CardRow> = {},
): CardRow {
  return {
    id,
    user_id: 'u',
    note_id,
    direction: 'forward',
    due: NOW.toISOString(),
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: State.Review,
    last_review: null,
    learning_steps: 0,
    suspended: false,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    deleted: false,
    ...over,
  }
}

const opts = { scope: { kind: 'all' } as const, newCardsLeft: 20, now: NOW }

describe('buildQueue', () => {
  it('берёт карточки со сроком в прошлом и пропускает будущие', () => {
    const notes = [note('n1', null), note('n2', null)]
    const cards = [
      card('due', 'n1', { due: new Date(NOW.getTime() - DAY).toISOString() }),
      card('later', 'n2', { due: new Date(NOW.getTime() + DAY).toISOString() }),
    ]
    expect(buildQueue(cards, notes, opts).map((c) => c.id)).toEqual(['due'])
  })

  it('не берёт приостановленные карточки', () => {
    const cards = [card('c1', 'n1', { suspended: true })]
    expect(buildQueue(cards, [note('n1', null)], opts)).toEqual([])
  })

  it('ограничивает новые остатком дневного лимита', () => {
    const notes = [note('n1', null)]
    const cards = Array.from({ length: 10 }, (_, i) =>
      card(`new${i}`, 'n1', { state: State.New }),
    )
    expect(buildQueue(cards, notes, { ...opts, newCardsLeft: 3 })).toHaveLength(
      3,
    )
  })

  it('исчерпанный лимит не пускает новые, но повторы остаются', () => {
    const notes = [note('n1', null)]
    const cards = [
      card('new', 'n1', { state: State.New }),
      card('due', 'n1', { due: new Date(NOW.getTime() - DAY).toISOString() }),
    ]
    expect(buildQueue(cards, notes, { ...opts, newCardsLeft: 0 })).toHaveLength(
      1,
    )
  })

  it('learn берёт только новые карточки', () => {
    const notes = [note('n1', null), note('n2', null)]
    const cards = [
      card('new', 'n1', { state: State.New }),
      card('due', 'n2', { due: new Date(NOW.getTime() - DAY).toISOString() }),
    ]
    expect(
      buildQueue(cards, notes, { ...opts, kind: 'learn' }).map((c) => c.id),
    ).toEqual(['new'])
  })

  it('review берёт только подошедшие повторения', () => {
    const notes = [note('n1', null), note('n2', null), note('n3', null)]
    const cards = [
      card('new', 'n1', { state: State.New }),
      card('due', 'n2', { due: new Date(NOW.getTime() - DAY).toISOString() }),
      card('later', 'n3', { due: new Date(NOW.getTime() + DAY).toISOString() }),
    ]
    expect(
      buildQueue(cards, notes, { ...opts, kind: 'review' }).map((c) => c.id),
    ).toEqual(['due'])
  })

  it('отрицательный остаток (лимит уменьшили после изучения) не ломает срез', () => {
    const cards = [card('new', 'n1', { state: State.New })]
    expect(
      buildQueue(cards, [note('n1', null)], { ...opts, newCardsLeft: -5 }),
    ).toEqual([])
  })

  it('scope по папкам отсекает чужие заметки', () => {
    const notes = [note('n1', 'f1'), note('n2', 'f2'), note('n3', null)]
    const cards = [card('c1', 'n1'), card('c2', 'n2'), card('c3', 'n3')]
    const queue = buildQueue(cards, notes, {
      ...opts,
      scope: { kind: 'folders', folderIds: ['f1'] },
    })
    expect(queue.map((c) => c.id)).toEqual(['c1'])
  })

  it('scope NO_FOLDER берёт только заметки без папки', () => {
    const notes = [note('n1', 'f1'), note('n2', null), note('n3', null)]
    const cards = [card('c1', 'n1'), card('c2', 'n2'), card('c3', 'n3')]
    const queue = buildQueue(cards, notes, {
      ...opts,
      scope: { kind: 'folders', folderIds: [NO_FOLDER] },
    })
    expect(queue.map((c) => c.id).sort()).toEqual(['c2', 'c3'])
  })

  it('scope с папкой и NO_FOLDER объединяет их', () => {
    const notes = [note('n1', 'f1'), note('n2', 'f2'), note('n3', null)]
    const cards = [card('c1', 'n1'), card('c2', 'n2'), card('c3', 'n3')]
    const queue = buildQueue(cards, notes, {
      ...opts,
      scope: { kind: 'folders', folderIds: ['f1', NO_FOLDER] },
    })
    expect(queue.map((c) => c.id).sort()).toEqual(['c1', 'c3'])
  })

  it('cram берёт всё вне расписания, включая будущее и новые', () => {
    const notes = [note('n1', null)]
    const cards = [
      card('future', 'n1', {
        due: new Date(NOW.getTime() + 100 * DAY).toISOString(),
      }),
      card('new', 'n1', { state: State.New }),
    ]
    const queue = buildQueue(cards, notes, {
      ...opts,
      cram: true,
      newCardsLeft: 0,
    })
    expect(queue).toHaveLength(2)
  })

  it('не мутирует входной массив', () => {
    const cards = [card('a', 'n1'), card('b', 'n1')]
    const snapshot = cards.map((c) => c.id)
    buildQueue(cards, [note('n1', null)], opts)
    expect(cards.map((c) => c.id)).toEqual(snapshot)
  })

  it('карточка без заметки в очередь не попадает', () => {
    expect(buildQueue([card('orphan', 'missing')], [], opts)).toEqual([])
  })
})

describe('queueCounts', () => {
  it('делит очередь на новые и повторы', () => {
    const queue = [
      card('a', 'n1', { state: State.New }),
      card('b', 'n1'),
      card('c', 'n1'),
    ]
    expect(queueCounts(queue)).toEqual({ total: 3, fresh: 1, review: 2 })
  })
})

describe('queueOutlook', () => {
  const opts = { scope: { kind: 'all' } as const, now: NOW }

  it('считает новые за лимитом', () => {
    const notes = [note('n1', null), note('n2', null), note('n3', null)]
    const cards = [
      card('c1', 'n1', { state: State.New }),
      card('c2', 'n2', { state: State.New }),
      card('c3', 'n3', { state: State.New }),
    ]
    // Лимит пускает одну - за ним остаются две.
    expect(
      queueOutlook(cards, notes, { ...opts, newCardsLeft: 1 }).newBeyondLimit,
    ).toBe(2)
  })

  it('резерв пуст, когда лимит покрывает все новые', () => {
    const notes = [note('n1', null)]
    const cards = [card('c1', 'n1', { state: State.New })]
    expect(
      queueOutlook(cards, notes, { ...opts, newCardsLeft: 20 }).newBeyondLimit,
    ).toBe(0)
  })

  it('перебор нормы добором не уводит резерв в минус', () => {
    const notes = [note('n1', null)]
    const cards = [card('c1', 'n1', { state: State.New })]
    // newCardsLeft < 0: норму уже перебрали. Резерв - это всё ещё одна карточка.
    expect(
      queueOutlook(cards, notes, { ...opts, newCardsLeft: -5 }).newBeyondLimit,
    ).toBe(1)
  })

  it('находит ближайший будущий срок', () => {
    const notes = [note('n1', null), note('n2', null)]
    const cards = [
      card('c1', 'n1', {
        state: State.Review,
        due: new Date(NOW.getTime() + 3 * DAY).toISOString(),
      }),
      card('c2', 'n2', {
        state: State.Review,
        due: new Date(NOW.getTime() + DAY).toISOString(),
      }),
    ]
    expect(
      queueOutlook(cards, notes, { ...opts, newCardsLeft: 0 }).nextDueAt,
    ).toEqual(new Date(NOW.getTime() + DAY))
  })

  it('игнорирует просроченные - они уже в очереди', () => {
    const notes = [note('n1', null)]
    const cards = [
      card('c1', 'n1', {
        state: State.Review,
        due: new Date(NOW.getTime() - DAY).toISOString(),
      }),
    ]
    expect(
      queueOutlook(cards, notes, { ...opts, newCardsLeft: 0 }).nextDueAt,
    ).toBeNull()
  })

  it('не смотрит за пределы области', () => {
    const notes = [note('n1', 'f1'), note('n2', 'f2')]
    const cards = [
      card('c1', 'n1', { state: State.New }),
      card('c2', 'n2', { state: State.New }),
    ]
    const scope: Scope = { kind: 'folders', folderIds: ['f1'] }
    expect(
      queueOutlook(cards, notes, { scope, newCardsLeft: 0, now: NOW })
        .newBeyondLimit,
    ).toBe(1)
  })
})
