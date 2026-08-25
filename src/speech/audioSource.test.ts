import { describe, expect, it } from 'vitest'
import { cardSpeakSource } from '@/speech/audioSource'
import type { NoteRow } from '@/types'

const CLOZE = 'The fox is a {{cunning::хитрый}} animal.'
const CLOZE_PLAIN = 'The fox is a cunning animal.'

function note(over: Partial<NoteRow> = {}): NoteRow {
  return {
    id: 'n1',
    user_id: 'u1',
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
    created_at: '2026-08-10T00:00:00.000Z',
    updated_at: '2026-08-10T00:00:00.000Z',
    deleted: false,
    ...over,
  }
}

describe('cardSpeakSource', () => {
  it('слово уходит в облако - живых записей больше нет', () => {
    expect(cardSpeakSource(note(), 'forward')).toEqual({
      url: null,
      text: 'otter',
      cloud: true,
    })
  })

  it('фраза озвучивается тем же путём, что и слово', () => {
    expect(cardSpeakSource(note({ front: 'take off' }), 'forward')).toEqual({
      url: null,
      text: 'take off',
      cloud: true,
    })
  })

  it('cloze озвучивает предложение без разметки пропусков', () => {
    const src = cardSpeakSource(note({ type: 'cloze', front: CLOZE }), 'cloze')
    expect(src.text).toBe(CLOZE_PLAIN)
    expect(src.cloud).toBe(true)
  })

  it('reverse играет то же EN-слово (оно и на обороте - front)', () => {
    expect(cardSpeakSource(note(), 'reverse').text).toBe('otter')
  })

  /**
   * Регрессия (2026-08-19): автоплей звал `play({ url, text })`, теряя флаг
   * `cloud`, и карточка сама открывалась роботом, хотя тап по кнопке на ней же
   * играл голосом Azure. Источник надо передавать целиком - `cloud` должен
   * стоять у всего, что идёт в озвучку.
   */
  it('cloud стоит у любого направления - автоплей не должен уходить в робота', () => {
    for (const src of [
      cardSpeakSource(note(), 'forward'),
      cardSpeakSource(note(), 'reverse'),
      cardSpeakSource(note({ type: 'cloze', front: CLOZE }), 'cloze'),
    ]) {
      expect(src.cloud).toBe(true)
    }
  })

  // Регрессия: автоплей читал `note.audio_url`, а кнопка строила ссылку сама -
  // одна карточка звучала двумя разными голосами. Источник от поля не зависит.
  it('не зависит от note.audio_url - источник один и тот же для всех путей', () => {
    const withStale = note({ audio_url: 'https://old/stale.mp3' })
    expect(cardSpeakSource(withStale, 'forward')).toEqual(cardSpeakSource(note(), 'forward'))
  })
})
