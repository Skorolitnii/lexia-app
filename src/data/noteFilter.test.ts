import { describe, expect, it } from 'vitest'
import type { NoteRow } from '@/types'
import { compareNotesByFront, matchesNoteQuery } from '@/data/noteFilter'

const note = (over: Partial<NoteRow> = {}): NoteRow => ({
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
  created_at: '',
  updated_at: '',
  deleted: false,
  ...over,
})

const base = { search: '', type: 'all' } as const

describe('matchesNoteQuery', () => {
  it('пустые фильтры пропускают любую заметку', () => {
    expect(matchesNoteQuery(note(), base)).toBe(true)
  })

  it('тип отсекает несовпадающие', () => {
    expect(matchesNoteQuery(note({ type: 'basic' }), { ...base, type: 'cloze' })).toBe(false)
    expect(matchesNoteQuery(note({ type: 'cloze' }), { ...base, type: 'cloze' })).toBe(true)
  })

  it('поиск ищет в front без учёта регистра', () => {
    expect(matchesNoteQuery(note({ front: 'Otter' }), { ...base, search: 'ott' })).toBe(true)
    expect(matchesNoteQuery(note({ front: 'Otter' }), { ...base, search: 'OTT' })).toBe(true)
  })

  it('поиск ищет и в back (перевод)', () => {
    expect(matchesNoteQuery(note({ back: 'выдра' }), { ...base, search: 'выд' })).toBe(true)
  })

  it('поиск не находит - заметка отсеивается', () => {
    expect(
      matchesNoteQuery(note({ front: 'otter', back: 'выдра' }), { ...base, search: 'fox' }),
    ).toBe(false)
  })

  it('back = null не роняет поиск', () => {
    expect(matchesNoteQuery(note({ front: 'otter', back: null }), { ...base, search: 'fox' })).toBe(
      false,
    )
    expect(matchesNoteQuery(note({ front: 'otter', back: null }), { ...base, search: 'ott' })).toBe(
      true,
    )
  })

  it('фильтры комбинируются по И', () => {
    const n = note({ type: 'basic', front: 'otter' })
    expect(matchesNoteQuery(n, { search: 'ott', type: 'basic' })).toBe(true)
    expect(matchesNoteQuery(n, { search: 'fox', type: 'basic' })).toBe(false)
  })
})

describe('compareNotesByFront', () => {
  it('сортирует по front по алфавиту', () => {
    const rows = [note({ front: 'otter' }), note({ front: 'ant' }), note({ front: 'bee' })]
    expect(rows.sort(compareNotesByFront).map((r) => r.front)).toEqual(['ant', 'bee', 'otter'])
  })
})
