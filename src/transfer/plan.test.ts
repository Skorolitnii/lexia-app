import { describe, expect, it } from 'vitest'
import type { NoteRow } from '@/types'
import type { DeckNote } from '@/transfer/deck'
import { buildPlan } from '@/transfer/plan'

const entry = (front: string, over: Partial<DeckNote> = {}): DeckNote => ({
  type: 'basic',
  front,
  back: 'перевод',
  details: null,
  examples: [],
  reverse: false,
  tags: [],
  ...over,
})

const existing = (front: string, folder_id: string | null): NoteRow =>
  ({ id: front, front, folder_id, deleted: false }) as NoteRow

describe('buildPlan - дубликаты', () => {
  it('слово, уже лежащее в целевой папке, помечается дубликатом', () => {
    const plan = buildPlan([entry('otter'), entry('camouflage')], [existing('otter', 'f1')], 'f1')

    expect(plan.rows[0]?.duplicate).toBe(true)
    expect(plan.rows[1]?.duplicate).toBe(false)
    expect(plan.duplicates).toBe(1)
    expect(plan.willImport).toBe(1)
  })

  it('то же слово в ДРУГОЙ папке дубликатом не считается (§4)', () => {
    const plan = buildPlan([entry('otter')], [existing('otter', 'f2')], 'f1')
    expect(plan.duplicates).toBe(0)
  })

  it('регистр и пробелы не спасают от дубликата', () => {
    const plan = buildPlan([entry('  Otter ')], [existing('otter', 'f1')], 'f1')
    expect(plan.rows[0]?.duplicate).toBe(true)
  })

  // Файл от нейросети вполне может содержать одно слово дважды.
  it('дубликат внутри самого файла ловится', () => {
    const plan = buildPlan([entry('otter'), entry('otter')], [], 'f1')
    expect(plan.rows.map((r) => r.duplicate)).toEqual([false, true])
    expect(plan.willImport).toBe(1)
  })

  it('импорт в «без папки» сверяется с заметками без папки', () => {
    const plan = buildPlan([entry('otter')], [existing('otter', null)], null)
    expect(plan.duplicates).toBe(1)
  })
})

describe('buildPlan - счётчики', () => {
  it('«импортируем» не считает дубликаты', () => {
    const plan = buildPlan(
      [
        entry('otter'),
        entry('take off'),
        // Дубликат не импортируется, значит и в счётчик не попадает.
        entry('herd'),
      ],
      [existing('herd', 'f1')],
      'f1',
    )

    expect(plan.willImport).toBe(2)
    expect(plan.duplicates).toBe(1)
  })

  /**
   * Превью строится ЦЕЛИКОМ из файла: словарь при импорте больше не
   * опрашивается (транскрипции дотягивает сервер). План не должен зависеть ни
   * от чего, кроме самой колоды и уже существующих заметок.
   */
  it('cloze и фразы попадают в план наравне со словами', () => {
    const plan = buildPlan(
      [
        entry('otter'),
        entry('take off'),
        entry('The fox is a {{cunning}} animal.', { type: 'cloze' }),
      ],
      [],
      null,
    )
    expect(plan.willImport).toBe(3)
  })
})

describe('buildPlan - исключённые вручную', () => {
  it('исключённая строка не идёт в импорт и в счётчики', () => {
    const plan = buildPlan([entry('otter'), entry('camouflage')], [], 'f1', new Set([0]))

    expect(plan.rows[0]?.excluded).toBe(true)
    expect(plan.willImport).toBe(1)
  })

  it('вернув исключённую строку, не получаем её же дубликатом ниже', () => {
    // Две одинаковые строки: первая исключена - значит НЕ занимает ключ, и
    // вторая остаётся обычной импортируемой (а не «дубликат внутри файла»).
    const plan = buildPlan([entry('otter'), entry('otter')], [], 'f1', new Set([0]))

    expect(plan.rows[0]?.excluded).toBe(true)
    expect(plan.rows[1]?.duplicate).toBe(false)
    expect(plan.willImport).toBe(1)
  })
})
