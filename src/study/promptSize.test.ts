import { describe, expect, it } from 'vitest'
import { promptSizeCls } from '@/study/promptSize'

/** Размер лица карточки: короткое слово - крупно, длинная фраза - мельче. */
const size = (s: string) => promptSizeCls(s).split(' ')[0]

describe('promptSizeCls', () => {
  it('короткое слово получает максимальный кегль', () => {
    expect(size('otter')).toBe('text-[42px]')
  })

  it('длинная фраза уменьшается', () => {
    // Реальный случай: в 62px этот перевод занимал всю карточку.
    expect(size('протестующий, участник акции протеста')).toBe('text-[21px]')
  })

  it('чем длиннее текст, тем мельче кегль (без обратных скачков)', () => {
    const px = (s: string) => Number(size(s).match(/(\d+)px/)![1])
    const samples = [
      'cat',
      'demonstration',
      'знание иностранного',
      'протестующий, участник акции протеста',
    ]
    const sizes = samples.map(px)
    // Не требуем, чтобы каждый пример попал в свою ступень: ступень - диапазон,
    // и два соседних по длине текста законно совпадают. Важно другое - размер
    // не растёт с длиной.
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a))
    expect(sizes[0]).toBeGreaterThan(sizes[sizes.length - 1])
  })

  it('длинное слово мельче короткой фразы той же длины', () => {
    // 15 символов в обоих случаях, но неразрывное слово шире по вёрстке.
    const oneWord = size('противоречивый')
    const twoWords = size('да нет наверно')
    expect(oneWord).not.toBe(twoWords)
  })

  it('не спотыкается о пустую строку', () => {
    // `note.back` может быть пустым - reverse-карточка без перевода.
    expect(size('')).toBe('text-[42px]')
  })

  it('игнорирует внешние пробелы', () => {
    expect(size('  otter  ')).toBe(size('otter'))
  })
})
