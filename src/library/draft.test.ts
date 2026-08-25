import { describe, expect, it } from 'vitest'
import type { NoteRow } from '@/types'
import {
  cardsForDraft,
  dictionaryFields,
  draftFromNote,
  emptyDraft,
  lookupKey,
  type NoteDraft,
} from '@/library/draft'

const note = (over: Partial<NoteRow> = {}): NoteRow => ({
  id: 'n1',
  user_id: 'u',
  folder_id: null,
  type: 'basic',
  front: 'otter',
  back: 'выдра',
  transcription: '/ˈɒt.ə/',
  audio_url: 'https://x/otter-uk.mp3',
  image_url: null,
  details: null,
  examples: [],
  reverse: false,
  tags: [],
  created_at: '2026-07-22T00:00:00.000Z',
  updated_at: '2026-07-22T00:00:00.000Z',
  deleted: false,
  ...over,
})

const withFront = (draft: NoteDraft, front: string): NoteDraft => ({ ...draft, front })

describe('lookupKey', () => {
  it('нормализует регистр и пробелы', () => {
    expect(lookupKey('  Otter ')).toBe('otter')
    expect(lookupKey('OTTER')).toBe('otter')
  })
})

describe('dictionaryFields', () => {
  it('отдаёт транскрипцию и аудио, пока слово не менялось', () => {
    const draft = draftFromNote(note())
    expect(dictionaryFields(draft)).toEqual({
      transcription: '/ˈɒt.ə/',
      audio_url: 'https://x/otter-uk.mp3',
    })
  })

  it('регистр и пробелы вокруг слова не считаются сменой слова', () => {
    const draft = withFront(draftFromNote(note()), '  Otter  ')
    expect(dictionaryFields(draft).transcription).toBe('/ˈɒt.ə/')
  })

  // Баг пользователя: ввод кириллицы показывал транскрипцию прежнего слова.
  it('кириллица вместо слова сбрасывает данные словаря', () => {
    const draft = withFront(draftFromNote(note()), 'выдра')
    expect(dictionaryFields(draft)).toEqual({ transcription: null, audio_url: null })
  })

  // Замечание ревью: слово дописали до фразы - лукап выключается, ответа нет.
  it('слово, дописанное до фразы, теряет данные словаря', () => {
    const draft = withFront(draftFromNote(note()), 'otter cracked a shell')
    expect(dictionaryFields(draft)).toEqual({ transcription: null, audio_url: null })
  })

  it('смена слова на другое сбрасывает данные, даже если словарь ещё не ответил', () => {
    const draft = withFront(draftFromNote(note()), 'hedgehog')
    expect(dictionaryFields(draft)).toEqual({ transcription: null, audio_url: null })
  })

  it('пустое поле сбрасывает данные', () => {
    const draft = withFront(draftFromNote(note()), '')
    expect(dictionaryFields(draft)).toEqual({ transcription: null, audio_url: null })
  })

  it('cloze-заметка не тащит транскрипцию прежнего слова', () => {
    const draft: NoteDraft = {
      ...draftFromNote(note()),
      type: 'cloze',
      front: 'A {{hedgehog::ёж}} sleeps.',
    }
    expect(dictionaryFields(draft)).toEqual({ transcription: null, audio_url: null })
  })

  it('новый черновик - данных словаря нет', () => {
    expect(dictionaryFields(emptyDraft(null))).toEqual({
      transcription: null,
      audio_url: null,
    })
  })
})

describe('draftFromNote', () => {
  it('привязывает сохранённые значения к сохранённому слову', () => {
    // Иначе транскрипция мигала бы в пустоту до ответа словаря при открытии.
    expect(draftFromNote(note()).lookupFor).toBe('otter')
  })

  // Баг: черновик не нёс теги, и правка заметки затирала их в []. Импорт
  // нейросети кладёт теги - редактирование не должно их терять.
  it('переносит теги заметки в черновик', () => {
    expect(draftFromNote(note({ tags: ['animals', 'water'] })).tags).toEqual(['animals', 'water'])
  })
})

describe('cardsForDraft', () => {
  it('считает карточки по типу и reverse (§3)', () => {
    const base = emptyDraft(null)
    expect(cardsForDraft(base)).toBe(1)
    expect(cardsForDraft({ ...base, reverse: true })).toBe(2)
    expect(cardsForDraft({ ...base, type: 'cloze' })).toBe(1)
    // У cloze обратной не бывает, даже если флаг случайно взведён.
    expect(cardsForDraft({ ...base, type: 'cloze', reverse: true })).toBe(1)
  })
})
