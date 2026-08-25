import { describe, expect, it } from 'vitest'
import { parseDeck } from '@/transfer/deck'
import { STARTER_DECK_JSON, STARTER_DECK_SIZE, STARTER_DECK_TITLE } from '@/transfer/starterDeck'

/**
 * Стартовая колода - контент, а не код, и сломать её легко молча: опечатка в
 * cloze или пустой `back` дадут «issue» на импорте, а не ошибку сборки. Поэтому
 * гоняем её через тот же `parseDeck`, что и файл пользователя.
 */
describe('стартовая колода', () => {
  const deck = parseDeck(STARTER_DECK_JSON)

  it('разбирается без брака', () => {
    expect(deck.issues).toEqual([])
    expect(deck.folder).toBe(STARTER_DECK_TITLE)
  })

  it('обещанный размер совпадает с реальным', () => {
    // Цифра показана на пустом экране - расхождение было бы враньём в UI.
    expect(deck.notes).toHaveLength(STARTER_DECK_SIZE)
  })

  it('у каждой заметки есть перевод и уникальное слово', () => {
    for (const note of deck.notes) {
      expect(note.back, note.front).toBeTruthy()
    }
    const fronts = deck.notes.map((n) => n.front.toLowerCase())
    expect(new Set(fronts).size).toBe(fronts.length)
  })

  it('cloze-заметки содержат разбираемый пропуск', () => {
    const cloze = deck.notes.filter((n) => n.type === 'cloze')
    expect(cloze.length).toBeGreaterThan(0)
    for (const note of cloze) {
      expect(note.front, note.front).toMatch(/\{\{.+\}\}/)
    }
  })
})
