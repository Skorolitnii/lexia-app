import { describe, expect, it } from 'vitest'
import { State } from 'ts-fsrs'
import type { CardRow, NoteRow } from '@/types'
import { BackupParseError, backupFileName, buildBackup, parseBackup } from '@/transfer/backup'

const note = (over: Partial<NoteRow> = {}): NoteRow => ({
  id: 'n1',
  user_id: 'u',
  folder_id: 'f1',
  type: 'basic',
  front: 'otter',
  back: 'выдра',
  transcription: '/ˈɒt.ə/',
  audio_url: null,
  image_url: null,
  details: null,
  examples: [{ text: 'An otter.' }],
  reverse: true,
  tags: ['animals'],
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-02T00:00:00.000Z',
  deleted: false,
  ...over,
})

const card = (over: Partial<CardRow> = {}): CardRow => ({
  id: 'c1',
  user_id: 'u',
  note_id: 'n1',
  direction: 'forward',
  due: '2026-08-01T10:00:00.000Z',
  stability: 12.34,
  difficulty: 5.67,
  elapsed_days: 3,
  scheduled_days: 10,
  reps: 4,
  lapses: 1,
  state: State.Review,
  last_review: '2026-07-22T10:00:00.000Z',
  learning_steps: 0,
  suspended: false,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-22T10:00:00.000Z',
  deleted: false,
  ...over,
})

const data = {
  folders: [],
  notes: [note()],
  cards: [card()],
  review_logs: [],
  settings: null,
}

describe('бэкап - круговой рейс', () => {
  it('состояние FSRS переживает экспорт и разбор без потерь (§5 loseless)', () => {
    const parsed = parseBackup(JSON.stringify(buildBackup(data)))

    // Главное свойство бэкапа: карточка вернулась побитово той же.
    expect(parsed.cards[0]).toEqual(card())
    expect(parsed.notes[0]).toEqual(note())
  })

  it('soft-deleted строки тоже выгружаются: иначе синк воскресит их', () => {
    const parsed = parseBackup(
      JSON.stringify(buildBackup({ ...data, notes: [note({ deleted: true })] })),
    )
    expect(parsed.notes[0]?.deleted).toBe(true)
  })

  it('проставляет версию и дату выгрузки', () => {
    const backup = buildBackup(data)
    expect(backup.version).toBe(1)
    expect(Date.parse(backup.exported_at)).not.toBeNaN()
  })
})

describe('parseBackup - защита от чужого файла', () => {
  it('не-JSON и не-объект отвергаются', () => {
    expect(() => parseBackup('не json')).toThrow(BackupParseError)
    expect(() => parseBackup('[]')).toThrow(BackupParseError)
  })

  // Ключевая защита: колода от нейросети похожа на бэкап полем notes,
  // но карточек в ней нет - «восстановление» стёрло бы весь прогресс.
  it('колода нейросети не принимается за бэкап', () => {
    const deck = JSON.stringify({ version: 1, folder: 'Animals', notes: [{ front: 'otter' }] })
    expect(() => parseBackup(deck)).toThrow(/не бэкап/)
  })

  it('версия из будущего отвергается, а не «восстанавливается» частично', () => {
    const future = JSON.stringify({ ...buildBackup(data), version: 99 })
    expect(() => parseBackup(future)).toThrow(/версии 99/)
  })

  it('отсутствующие необязательные списки становятся пустыми', () => {
    const parsed = parseBackup(JSON.stringify({ version: 1, notes: [], cards: [] }))
    expect(parsed.folders).toEqual([])
    expect(parsed.review_logs).toEqual([])
    expect(parsed.settings).toBeNull()
  })

  it('список не тем типом - внятная ошибка', () => {
    const bad = JSON.stringify({ version: 1, notes: [], cards: [], folders: 'нет' })
    expect(() => parseBackup(bad)).toThrow(/folders/)
  })

  // Иначе put в store с keyPath 'id' валит транзакцию восстановления,
  // и пользователь видит «Не удалось восстановить» без причины.
  it('строки без id отвергаются с указанием таблицы', () => {
    const bad = JSON.stringify({ version: 1, notes: [note(), { front: 'без id' }], cards: [] })
    expect(() => parseBackup(bad)).toThrow(/notes .* без id/)
  })

  it('settings без id проходит: он ключуется по user_id', () => {
    const settings = { user_id: 'u', new_cards_per_day: 20 }
    const parsed = parseBackup(JSON.stringify({ version: 1, notes: [], cards: [], settings }))
    expect(parsed.settings).toEqual(settings)
  })
})

describe('backupFileName', () => {
  it('содержит дату', () => {
    expect(backupFileName(new Date('2026-07-22T15:00:00.000Z'))).toBe(
      'lexia-backup-2026-07-22.json',
    )
  })
})
