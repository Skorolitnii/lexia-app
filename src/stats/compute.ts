import { Rating, State } from 'ts-fsrs'
import type { CardRow, ReviewLogRow } from '@/types'

/**
 * Чистые вычисления статистики (§8 этап 8) по журналу и карточкам.
 * Никакого IO: страница получает строки из репозитория и зовёт `computeStats`.
 *
 * Все дни - ЛОКАЛЬНЫЕ, не UTC. Стрик считается по календарю пользователя:
 * повтор в 23:30 MSK - это сегодня, хотя в UTC уже завтра, и UTC-нарезка
 * рвала бы серию у вечерних занятий.
 */

/** Карточка «зрелая», когда интервал дорос до трёх недель - порог из Anki. */
export const MATURE_DAYS = 21

/** Средняя длительность одного повтора для прикидки «≈ N мин». */
const SECONDS_PER_REVIEW = 8

export interface DayActivity {
  /** Локальная дата, YYYY-MM-DD - годится и как ключ, и как подпись. */
  date: string
  /** Повторы уже знакомых карточек. */
  reviews: number
  /** Впервые показанные карточки в этот день. */
  newCards: number
}

export interface Maturity {
  new: number
  learning: number
  mature: number
  total: number
}

export interface RatingShare {
  rating: Rating.Again | Rating.Hard | Rating.Good | Rating.Easy
  count: number
  /** Доля в процентах, целые. Сумма может не дать ровно 100 из-за округления. */
  percent: number
}

export interface Stats {
  streak: number
  bestStreak: number
  /** Был ли хоть один повтор сегодня - от этого зависит подпись стрика. */
  studiedToday: boolean
  dueToday: number
  /** Прикидка времени на сегодняшнюю очередь, минуты (минимум 1, если есть что учить). */
  dueMinutes: number
  totalNotes: number
  /** Прирост слов за последние 7 дней. */
  addedThisWeek: number
  reviewsToday: number
  activity: DayActivity[]
  maturity: Maturity
  ratings: RatingShare[]
  /** Доля неотрицательных оценок за 90 дней, проценты; null - данных ещё нет. */
  retention: number | null
}

/** Локальный день в виде YYYY-MM-DD. `toISOString` тут нельзя - он даёт UTC. */
export function localDay(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function shiftDays(date: Date, days: number): Date {
  const out = new Date(date)
  out.setDate(out.getDate() + days)
  return out
}

/**
 * Серия: сколько дней подряд были повторы, считая назад от сегодня.
 *
 * Если сегодня ещё не занимались, отсчёт начинается со вчера - иначе стрик
 * обнулялся бы каждое утро и «сгорал» ещё до того, как пользователь сел учить.
 */
export function computeStreak(days: Set<string>, now: Date): number {
  if (days.size === 0) return 0

  let cursor = days.has(localDay(now)) ? new Date(now) : shiftDays(now, -1)
  if (!days.has(localDay(cursor))) return 0

  let streak = 0
  while (days.has(localDay(cursor))) {
    streak++
    cursor = shiftDays(cursor, -1)
  }
  return streak
}

/** Самая длинная серия за всю историю. */
export function computeBestStreak(days: Set<string>): number {
  // Сравнение строк YYYY-MM-DD совпадает с хронологическим порядком.
  const sorted = [...days].sort()
  let best = 0
  let run = 0
  let prev: string | null = null

  for (const day of sorted) {
    // Разрыв определяем по календарю, а не вычитанием миллисекунд: сутки
    // не всегда 24 часа (переход на летнее время), и арифметика бы врала.
    const expected = prev ? localDay(shiftDays(new Date(`${prev}T12:00:00`), 1)) : null
    run = expected === day ? run + 1 : 1
    best = Math.max(best, run)
    prev = day
  }
  return best
}

/**
 * Активность по дням: последние `days` календарных суток, включая пустые.
 * Дырки нужны явно - без них график сжимался бы и врал о регулярности.
 */
export function computeActivity(logs: ReviewLogRow[], days: number, now: Date): DayActivity[] {
  const byDay = new Map<string, DayActivity>()
  for (let i = days - 1; i >= 0; i--) {
    const date = localDay(shiftDays(now, -i))
    byDay.set(date, { date, reviews: 0, newCards: 0 })
  }

  // Первый показ карточки считаем один раз за день: `log.state === New` -
  // состояние ДО оценки, и серия Again даёт несколько таких строк подряд.
  const seenNew = new Set<string>()

  for (const log of logs) {
    const day = byDay.get(localDay(new Date(log.review)))
    if (!day) continue

    const firstShow = log.state === State.New
    if (firstShow && !seenNew.has(log.card_id)) {
      seenNew.add(log.card_id)
      day.newCards++
    } else if (!firstShow) {
      day.reviews++
    }
  }
  return [...byDay.values()]
}

/** Зрелость колоды по состоянию и интервалу карточек. */
export function computeMaturity(cards: CardRow[]): Maturity {
  let fresh = 0
  let learning = 0
  let mature = 0

  for (const card of cards) {
    if (card.state === State.New) fresh++
    else if (card.scheduled_days >= MATURE_DAYS) mature++
    else learning++
  }
  return { new: fresh, learning, mature, total: cards.length }
}

const RATINGS = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const

/** Распределение оценок за период. Проценты - от числа оценок, не от карточек. */
export function computeRatings(logs: ReviewLogRow[]): RatingShare[] {
  const counts = new Map<number, number>(RATINGS.map((r) => [r, 0]))
  for (const log of logs) {
    if (counts.has(log.rating)) counts.set(log.rating, counts.get(log.rating)! + 1)
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0)

  return RATINGS.map((rating) => {
    const count = counts.get(rating)!
    return { rating, count, percent: total === 0 ? 0 : Math.round((count / total) * 100) }
  })
}

/**
 * Ретеншн: доля ответов, где карточка была вспомнена (всё, кроме Again).
 *
 * Считаем только по ПОВТОРАМ уже знакомых карточек: у новой карточки нет
 * что «удерживать», и первые показы (почти всегда не-Again) задирали бы
 * процент тем сильнее, чем активнее пользователь добавляет слова.
 */
export function computeRetention(logs: ReviewLogRow[]): number | null {
  const reviews = logs.filter((l) => l.state !== State.New)
  if (reviews.length === 0) return null
  const recalled = reviews.filter((l) => l.rating !== Rating.Again).length
  return Math.round((recalled / reviews.length) * 100)
}

export interface StatsInput {
  cards: CardRow[]
  logs: ReviewLogRow[]
  /** Живые заметки - для «Всего слов» (карточек у слова может быть две). */
  noteCount: number
  /** Даты создания живых заметок, ISO - для прироста за неделю. */
  noteCreatedAt: string[]
  now?: Date
}

export function computeStats({
  cards,
  logs,
  noteCount,
  noteCreatedAt,
  now = new Date(),
}: StatsInput): Stats {
  const days = new Set(logs.map((l) => localDay(new Date(l.review))))
  const today = localDay(now)

  const dueToday = cards.filter(
    (c) => !c.suspended && c.state !== State.New && new Date(c.due).getTime() <= now.getTime(),
  ).length

  const weekAgo = shiftDays(now, -7).getTime()
  const since = (from: Date) => logs.filter((l) => new Date(l.review).getTime() >= from.getTime())

  return {
    streak: computeStreak(days, now),
    bestStreak: computeBestStreak(days),
    studiedToday: days.has(today),
    dueToday,
    dueMinutes: dueToday === 0 ? 0 : Math.max(1, Math.round((dueToday * SECONDS_PER_REVIEW) / 60)),
    totalNotes: noteCount,
    addedThisWeek: noteCreatedAt.filter((iso) => new Date(iso).getTime() >= weekAgo).length,
    reviewsToday: logs.filter((l) => localDay(new Date(l.review)) === today).length,
    activity: computeActivity(logs, 30, now),
    maturity: computeMaturity(cards),
    ratings: computeRatings(since(shiftDays(now, -7))),
    retention: computeRetention(since(shiftDays(now, -90))),
  }
}
