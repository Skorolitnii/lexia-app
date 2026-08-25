import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FOLDER_COLOR,
  FOLDER_COLORS,
  FOLDER_HUES,
  hueColor,
  hueOf,
} from '@/library/folderColors'

describe('hueColor', () => {
  it('строит oklch с фиксированными L/C', () => {
    expect(hueColor(158)).toBe('oklch(0.64 0.14 158)')
  })
})

describe('hueOf', () => {
  it('достаёт оттенок из oklch-строки', () => {
    expect(hueOf('oklch(0.64 0.14 245)')).toBe(245)
  })

  it('переживает дробные значения', () => {
    expect(hueOf('oklch(0.64 0.14 20.5)')).toBe(20.5)
  })

  // Ползунок должен вставать в позицию сохранённого пресета.
  it('разбирает собственные пресеты обратно в их оттенок', () => {
    for (const h of FOLDER_HUES) {
      expect(hueOf(hueColor(h))).toBe(h)
    }
  })

  it('серый (малая насыщенность) даёт null - оттенка у него нет', () => {
    expect(hueOf('oklch(0.6 0.02 260)')).toBeNull()
  })

  it('null и мусор дают null', () => {
    expect(hueOf(null)).toBeNull()
    expect(hueOf('rebeccapurple')).toBeNull()
  })
})

describe('палитра', () => {
  it('пресеты начинаются с брендового цвета', () => {
    expect(FOLDER_COLORS[0]).toBe(DEFAULT_FOLDER_COLOR)
  })
})
