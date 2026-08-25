import { describe, expect, it } from 'vitest'
import { isSingleWord, lookupTerm, parseWords, topSenses } from '@/dictionary/api'

describe('lookupTerm', () => {
  it('возвращает само слово в нижнем регистре', () => {
    expect(lookupTerm('otter')).toBe('otter')
    expect(lookupTerm('  Resilient ')).toBe('resilient')
  })

  it('срезает ведущую частицу «to» у глаголов', () => {
    // Словарь не знает «to stir», но знает «stir».
    expect(lookupTerm('to stir')).toBe('stir')
    expect(lookupTerm('To Run')).toBe('run')
    expect(lookupTerm('to  make')).toBe('make')
  })

  it('«to» без остатка-слова остаётся собой (предлог)', () => {
    expect(lookupTerm('to')).toBe('to')
  })

  it('«to» + фраза - не лукап (после среза остаётся фраза)', () => {
    expect(lookupTerm('to take off')).toBe(null)
  })

  it('не трогает слова, лишь начинающиеся на to', () => {
    expect(lookupTerm('token')).toBe('token')
    expect(lookupTerm('together')).toBe('together')
  })

  it('null для того, что словарь не знает', () => {
    expect(lookupTerm('two words')).toBe(null)
    expect(lookupTerm('')).toBe(null)
    expect(lookupTerm('выдра')).toBe(null)
    expect(lookupTerm('123')).toBe(null)
  })
})

describe('isSingleWord', () => {
  it('пропускает отдельные слова, в том числе с дефисом и апострофом', () => {
    expect(isSingleWord('otter')).toBe(true)
    expect(isSingleWord('  resilient ')).toBe(true)
    expect(isSingleWord('well-known')).toBe(true)
    expect(isSingleWord("don't")).toBe(true)
    expect(isSingleWord('to stir')).toBe(true)
  })

  it('пропускает латиницу с диакритикой - словарь их знает', () => {
    expect(isSingleWord('café')).toBe(true)
    expect(isSingleWord('naïve')).toBe(true)
    expect(isSingleWord('résumé')).toBe(true)
  })

  it('отсекает то, что словарь всё равно не знает', () => {
    expect(isSingleWord('two words')).toBe(false)
    expect(isSingleWord('')).toBe(false)
    expect(isSingleWord('   ')).toBe(false)
    expect(isSingleWord('The fox is a {{cunning}} animal.')).toBe(false)
    expect(isSingleWord('123')).toBe(false)
  })

  it('кириллица - не английское слово, запрос холостой', () => {
    expect(isSingleWord('выдра')).toBe(false)
    expect(isSingleWord('ёж')).toBe(false)
    // Смешанное написание тоже мимо.
    expect(isSingleWord('otterвыдра')).toBe(false)
  })
})

describe('parseWords', () => {
  it('берёт IPA из тега ipa_pron и оборачивает в косые (случай otter)', () => {
    const result = parseWords([
      { word: 'otter', tags: ['n', 'pron:AA1 T ER0 ', 'ipa_pron:ˈɑtɝ'], defs: [] },
    ])
    expect(result.transcription).toBe('/ˈɑtɝ/')
    // Аудио тут не приходит вовсе - его даёт OneLook по отдельному URL.
    expect(result.audioUrl).toBeNull()
  })

  it('ARPAbet-транскрипция игнорируется - нужен именно IPA', () => {
    const result = parseWords([{ word: 'otter', tags: ['pron:AA1 T ER0 '] }])
    expect(result.transcription).toBeNull()
  })

  it('разбирает определения с префиксом части речи', () => {
    const result = parseWords([
      {
        word: 'box',
        tags: ['n', 'v', 'ipa_pron:bˈɑks'],
        defs: ['n\tA cuboid container.', 'v\tTo fight with the fists.'],
      },
    ])
    expect(result.senses).toEqual([
      { partOfSpeech: 'noun', definition: 'A cuboid container.' },
      { partOfSpeech: 'verb', definition: 'To fight with the fists.' },
    ])
    // `definition`/`partOfSpeech` - первое значение (импорт не меняется).
    expect(result.definition).toBe('A cuboid container.')
    expect(result.partOfSpeech).toBe('noun')
  })

  it('незнакомый тег части речи остаётся как есть, а без префикса - null', () => {
    const result = parseWords([{ defs: ['prep\tTowards.', 'Без части речи.'] }])
    expect(result.senses).toEqual([
      { partOfSpeech: 'prep', definition: 'Towards.' },
      { partOfSpeech: null, definition: 'Без части речи.' },
    ])
  })

  it('пустое определение отбрасывается - различать нечего', () => {
    expect(parseWords([{ defs: ['n\t   ', ''] }]).senses).toEqual([])
  })

  it('пустой ответ не роняет разбор', () => {
    const empty = {
      transcription: null,
      audioUrl: null,
      partOfSpeech: null,
      definition: null,
      senses: [],
    }
    expect(parseWords([])).toEqual(empty)
    expect(parseWords([{}])).toEqual(empty)
  })
})

describe('topSenses', () => {
  const sense = (partOfSpeech: string, definition: string) => ({ partOfSpeech, definition })

  it('оставляет по два значения на часть речи', () => {
    const result = topSenses([
      sense('noun', 'n1'),
      sense('noun', 'n2'),
      sense('noun', 'n3'),
      sense('verb', 'v1'),
      sense('verb', 'v2'),
      sense('verb', 'v3'),
    ])
    expect(result.map((s) => s.definition)).toEqual(['n1', 'n2', 'v1', 'v2'])
  })

  it('достаёт глагол, даже когда он далеко в хвосте (случай box)', () => {
    // У box 48 существительных подряд, и только потом «боксировать»:
    // простая обрезка списка потеряла бы глагол вовсе.
    const senses = [
      ...Array.from({ length: 48 }, (_, i) => sense('noun', `n${i}`)),
      sense('verb', 'To fight with fists.'),
    ]
    const result = topSenses(senses)
    expect(result).toHaveLength(3)
    expect(result.at(-1)?.definition).toBe('To fight with fists.')
  })

  it('короткий список не трогает', () => {
    const senses = [sense('noun', 'n1'), sense('verb', 'v1')]
    expect(topSenses(senses)).toEqual(senses)
  })

  it('значения без части речи считаются одной группой', () => {
    const result = topSenses([
      { partOfSpeech: null, definition: 'a' },
      { partOfSpeech: null, definition: 'b' },
      { partOfSpeech: null, definition: 'c' },
    ])
    expect(result.map((s) => s.definition)).toEqual(['a', 'b'])
  })
})
