import { describe, expect, it } from 'vitest'
import { formatDue, formatInterval, plural } from '@/study/format'

const NOW = new Date('2026-07-22T12:00:00Z')
const after = (ms: number) => new Date(NOW.getTime() + ms)

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('formatInterval', () => {
  it('форматирует минуты, часы, дни, месяцы и годы', () => {
    // Math.round: 30 сек округляется до «1м», «<1м» - это уже меньше 30 сек.
    expect(formatInterval(after(10 * 1000), NOW)).toBe('<1м')
    expect(formatInterval(after(30 * 1000), NOW)).toBe('1м')
    expect(formatInterval(after(25 * MIN), NOW)).toBe('25м')
    expect(formatInterval(after(4 * HOUR), NOW)).toBe('4ч')
    expect(formatInterval(after(4 * DAY), NOW)).toBe('4д')
    expect(formatInterval(after(60 * DAY), NOW)).toBe('2мес')
    expect(formatInterval(after(400 * DAY), NOW)).toBe('1г')
  })
})

describe('formatDue', () => {
  it('новая карточка важнее срока', () => {
    expect(formatDue(after(10 * DAY), true, NOW)).toEqual({
      text: 'новое',
      tone: 'new',
    })
  })

  it('без карточек - прочерк', () => {
    expect(formatDue(null, false, NOW)).toEqual({ text: '-', tone: 'later' })
  })

  it('просроченное и текущее - «сегодня»', () => {
    expect(formatDue(after(-5 * DAY), false, NOW).tone).toBe('due')
    expect(formatDue(NOW, false, NOW)).toEqual({ text: 'сегодня', tone: 'due' })
  })

  it('округляет как formatInterval: 25 часов - это 1д, а не 2д', () => {
    expect(formatDue(after(25 * HOUR), false, NOW).text).toBe('1д')
  })

  it('никогда не показывает «0д» для срока в ближайшие часы', () => {
    expect(formatDue(after(1 * HOUR), false, NOW).text).toBe('1д')
  })

  it('месяцы и годы', () => {
    expect(formatDue(after(60 * DAY), false, NOW).text).toBe('2мес')
    expect(formatDue(after(400 * DAY), false, NOW).text).toBe('1г')
  })
})

describe('plural', () => {
  const card = (n: number) => plural(n, 'карточка', 'карточки', 'карточек')

  it('склоняет по русским правилам', () => {
    expect(card(1)).toBe('карточка')
    expect(card(2)).toBe('карточки')
    expect(card(5)).toBe('карточек')
    expect(card(21)).toBe('карточка')
  })

  it('11–14 - исключение, несмотря на последнюю цифру', () => {
    expect(card(11)).toBe('карточек')
    expect(card(12)).toBe('карточек')
    expect(card(14)).toBe('карточек')
    expect(card(111)).toBe('карточек')
  })
})
