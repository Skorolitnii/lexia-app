import { describe, expect, it } from 'vitest'
import { Rating, State } from 'ts-fsrs'
import type { CardRow, ReviewLogRow } from '@/types'
import {
  computeActivity,
  computeBestStreak,
  computeMaturity,
  computeRatings,
  computeRetention,
  computeStats,
  computeStreak,
  localDay,
} from '@/stats/compute'

const NOW = new Date('2026-07-22T12:00:00')

/** Лог повторения в локальный день `day` (время внутри дня не важно). */
const log = (day: string, over: Partial<ReviewLogRow> = {}): ReviewLogRow => ({
  id: `l-${day}-${Math.random()}`,
  user_id: 'u',
  card_id: 'c1',
  rating: Rating.Good,
  state: State.Review,
  due: `${day}T10:00:00.000Z`,
  stability: 5,
  difficulty: 5,
  elapsed_days: 1,
  last_elapsed_days: 1,
  scheduled_days: 3,
  review: `${day}T12:00:00`,
  created_at: `${day}T12:00:00.000Z`,
  ...over,
})

const card = (over: Partial<CardRow> = {}): CardRow => ({
  id: `c-${Math.random()}`,
  user_id: 'u',
  note_id: 'n1',
  direction: 'forward',
  due: '2026-07-20T10:00:00.000Z',
  stability: 5,
  difficulty: 5,
  elapsed_days: 1,
  scheduled_days: 3,
  reps: 2,
  lapses: 0,
  state: State.Review,
  last_review: '2026-07-19T10:00:00.000Z',
  learning_steps: 0,
  suspended: false,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-19T10:00:00.000Z',
  deleted: false,
  ...over,
})

describe('localDay', () => {
  it('берёт ЛОКАЛЬНУЮ дату, а не UTC', () => {
    // Вечерний повтор: в UTC уже следующие сутки, но для стрика это сегодня.
    expect(localDay(new Date('2026-07-22T23:30:00'))).toBe('2026-07-22')
  })
})

describe('computeStreak', () => {
  it('считает дни подряд назад от сегодня', () => {
    const days = new Set(['2026-07-22', '2026-07-21', '2026-07-20'])
    expect(computeStreak(days, NOW)).toBe(3)
  })

  // Главное свойство: серия не должна сгорать по утрам, до занятия.
  it('не рвётся, если сегодня ещё не занимались', () => {
    const days = new Set(['2026-07-21', '2026-07-20'])
    expect(computeStreak(days, NOW)).toBe(2)
  })

  it('рвётся, если пропущен и вчерашний день', () => {
    expect(computeStreak(new Set(['2026-07-20']), NOW)).toBe(0)
    expect(computeStreak(new Set(), NOW)).toBe(0)
  })
})

describe('computeBestStreak', () => {
  it('находит самую длинную серию, а не последнюю', () => {
    const days = new Set([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04', // 4 подряд
      '2026-07-20',
      '2026-07-21', // 2 подряд
    ])
    expect(computeBestStreak(days)).toBe(4)
  })

  it('серия через границу месяца не рвётся', () => {
    expect(computeBestStreak(new Set(['2026-06-29', '2026-06-30', '2026-07-01'])).valueOf()).toBe(3)
  })

  it('пусто - ноль', () => {
    expect(computeBestStreak(new Set())).toBe(0)
  })
})

describe('computeActivity', () => {
  it('отдаёт непрерывный ряд дней, включая пустые', () => {
    const activity = computeActivity([log('2026-07-22')], 7, NOW)
    expect(activity).toHaveLength(7)
    expect(activity[0]?.date).toBe('2026-07-16')
    expect(activity[6]?.date).toBe('2026-07-22')
    expect(activity[5]?.reviews).toBe(0)
  })

  // log.state - состояние ДО оценки, поэтому серия Again по новой карточке
  // даёт несколько строк с State.New, но новое слово всё равно одно.
  it('новую карточку считает один раз, сколько бы раз её ни завалили', () => {
    const logs = [
      log('2026-07-22', { card_id: 'c1', state: State.New, rating: Rating.Again }),
      log('2026-07-22', { card_id: 'c1', state: State.New, rating: Rating.Again }),
      log('2026-07-22', { card_id: 'c1', state: State.New, rating: Rating.Good }),
    ]
    const today = computeActivity(logs, 7, NOW).at(-1)!
    expect(today.newCards).toBe(1)
    expect(today.reviews).toBe(0)
  })

  it('повторы знакомых карточек считает все', () => {
    const logs = [
      log('2026-07-22', { card_id: 'c1', state: State.Review }),
      log('2026-07-22', { card_id: 'c1', state: State.Relearning }),
    ]
    expect(computeActivity(logs, 7, NOW).at(-1)!.reviews).toBe(2)
  })

  it('логи старше окна не попадают в ряд', () => {
    expect(computeActivity([log('2026-01-01')], 7, NOW).every((d) => d.reviews === 0)).toBe(true)
  })
})

describe('computeMaturity', () => {
  it('делит по состоянию и интервалу', () => {
    const cards = [
      card({ state: State.New }),
      card({ state: State.Learning, scheduled_days: 0 }),
      card({ state: State.Review, scheduled_days: 5 }),
      card({ state: State.Review, scheduled_days: 21 }), // ровно порог - зрелая
      card({ state: State.Review, scheduled_days: 90 }),
    ]
    expect(computeMaturity(cards)).toEqual({ new: 1, learning: 2, mature: 2, total: 5 })
  })
})

describe('computeRatings', () => {
  it('считает доли от числа оценок', () => {
    const logs = [
      log('2026-07-22', { rating: Rating.Again }),
      log('2026-07-22', { rating: Rating.Good }),
      log('2026-07-22', { rating: Rating.Good }),
      log('2026-07-22', { rating: Rating.Easy }),
    ]
    const shares = computeRatings(logs)
    expect(shares.map((s) => s.count)).toEqual([1, 0, 2, 1])
    expect(shares.map((s) => s.percent)).toEqual([25, 0, 50, 25])
  })

  it('пустой журнал не даёт NaN', () => {
    expect(computeRatings([]).every((s) => s.percent === 0)).toBe(true)
  })
})

describe('computeRetention', () => {
  // Первые показы почти всегда не-Again: включив их, мы бы мерили не память,
  // а темп добавления новых слов.
  it('считает только повторы, игнорируя первые показы', () => {
    const logs = [
      log('2026-07-22', { state: State.New, rating: Rating.Good }),
      log('2026-07-22', { state: State.New, rating: Rating.Good }),
      log('2026-07-22', { state: State.Review, rating: Rating.Again }),
      log('2026-07-22', { state: State.Review, rating: Rating.Good }),
    ]
    expect(computeRetention(logs)).toBe(50)
  })

  it('без повторов - null, а не 0%', () => {
    expect(computeRetention([])).toBeNull()
    expect(computeRetention([log('2026-07-22', { state: State.New })])).toBeNull()
  })
})

describe('computeStats', () => {
  it('собирает сводку по журналу и карточкам', () => {
    const stats = computeStats({
      cards: [
        card({ due: '2026-07-20T10:00:00.000Z' }), // просрочена
        card({ due: '2026-08-30T10:00:00.000Z' }), // впереди
        card({ state: State.New, due: '2026-07-01T10:00:00.000Z' }), // новая не в счёт
      ],
      logs: [log('2026-07-22'), log('2026-07-21'), log('2026-07-10')],
      noteCount: 12,
      noteCreatedAt: ['2026-07-21T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
      now: NOW,
    })

    expect(stats.dueToday).toBe(1)
    expect(stats.streak).toBe(2)
    expect(stats.studiedToday).toBe(true)
    expect(stats.reviewsToday).toBe(1)
    expect(stats.totalNotes).toBe(12)
    expect(stats.addedThisWeek).toBe(1)
    expect(stats.activity).toHaveLength(30)
  })

  // Новая карточка «к повтору» не относится: её вводит дневной лимит, а не срок.
  it('новые карточки не попадают в «к повтору», даже с прошедшим due', () => {
    const stats = computeStats({
      cards: [card({ state: State.New, due: '2020-01-01T00:00:00.000Z' })],
      logs: [],
      noteCount: 1,
      noteCreatedAt: [],
      now: NOW,
    })
    expect(stats.dueToday).toBe(0)
    expect(stats.dueMinutes).toBe(0)
    expect(stats.retention).toBeNull()
  })

  it('отложенные (suspended) карточки не попадают в «к повтору»', () => {
    const stats = computeStats({
      cards: [card({ suspended: true, due: '2026-07-01T00:00:00.000Z' })],
      logs: [],
      noteCount: 1,
      noteCreatedAt: [],
      now: NOW,
    })
    expect(stats.dueToday).toBe(0)
  })
})
