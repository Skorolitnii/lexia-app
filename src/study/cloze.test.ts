import { describe, expect, it } from 'vitest'
import { clozePlainText, clozePreview, parseCloze } from '@/study/cloze'

describe('parseCloze', () => {
  it('разбивает предложение на текст и пропуск', () => {
    expect(parseCloze('The fox is a {{cunning}} animal.')).toEqual([
      { text: 'The fox is a ', blank: false },
      { text: 'cunning', blank: true },
      { text: ' animal.', blank: false },
    ])
  })

  it('читает подсказку после ::', () => {
    const [blank] = parseCloze('{{cunning::хитрый}}')
    expect(blank).toEqual({ text: 'cunning', blank: true, hint: 'хитрый' })
  })

  it('пустая подсказка не становится полем hint', () => {
    expect(parseCloze('{{cunning::}}')[0]).toEqual({
      text: 'cunning',
      blank: true,
    })
  })

  it('поддерживает несколько пропусков', () => {
    const segments = parseCloze('{{a}} and {{b}}')
    expect(segments.filter((s) => s.blank).map((s) => s.text)).toEqual(['a', 'b'])
  })

  it('пропуск в начале и в конце строки не теряется', () => {
    expect(parseCloze('{{a}} tail')[0]!.blank).toBe(true)
    expect(parseCloze('head {{b}}').at(-1)).toEqual({ text: 'b', blank: true })
  })

  it('текст без пропусков - один сегмент', () => {
    expect(parseCloze('no blanks here')).toEqual([{ text: 'no blanks here', blank: false }])
  })

  it('одинарные скобки пропуском не считаются', () => {
    expect(parseCloze('{single}').every((s) => !s.blank)).toBe(true)
  })
})

describe('clozePlainText', () => {
  it('подставляет ответы - этот текст уходит в озвучку', () => {
    expect(clozePlainText('The fox is a {{cunning::хитрый}} animal.')).toBe(
      'The fox is a cunning animal.',
    )
  })
})

describe('clozePreview', () => {
  it('прячет пропуски за многоточием, без сырых скобок', () => {
    expect(clozePreview('The fox is a {{cunning::хитрый}} animal.')).toBe('The fox is a … animal.')
  })
})
