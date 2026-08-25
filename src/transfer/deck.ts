import type { Example } from '@/types'
import { lookupTerm } from '@/dictionary/api'
import { parseCloze } from '@/study/cloze'

/**
 * Разбор файла колоды от нейросети (§4).
 *
 * Файл приходит извне и написан не нами, поэтому разбор параноидальный:
 * ни одно поле не считается присутствующим. Импортёр терпим (§4) - заметку
 * без `back`/`details` берём, а вот без `front` брать нечего, это брак.
 */

/** Заметка из файла, уже проверенная. */
export interface DeckNote {
  type: 'basic' | 'cloze'
  front: string
  back: string | null
  details: string | null
  examples: Example[]
  reverse: boolean
  tags: string[]
}

/** Строка брака: что именно не так и в какой позиции файла. */
export interface DeckIssue {
  index: number
  reason: string
}

export interface Deck {
  folder: string | null
  notes: DeckNote[]
  /** Заметки, которые не удалось разобрать: показываем, но не импортируем. */
  issues: DeckIssue[]
}

/** Файл нечитаем целиком (не JSON, не тот формат) - импортировать нечего. */
export class DeckParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DeckParseError'
  }
}

const asString = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null

function asExamples(v: unknown): Example[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((raw) => {
    if (typeof raw === 'string') {
      const text = asString(raw)
      return text ? [{ text }] : []
    }
    if (!raw || typeof raw !== 'object') return []
    const text = asString((raw as { text?: unknown }).text)
    if (!text) return []
    const translation = asString((raw as { translation?: unknown }).translation)
    return [translation ? { text, translation } : { text }]
  })
}

function asTags(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.flatMap((t) => (asString(t) ? [asString(t)!] : [])))]
}

/**
 * Разобрать одну заметку. Возвращает причину брака вместо заметки -
 * молча пропускать нельзя: пользователь должен видеть, что потерялось.
 */
function parseNote(raw: unknown): DeckNote | string {
  if (!raw || typeof raw !== 'object') return 'не объект'

  const o = raw as Record<string, unknown>
  const front = asString(o.front)
  if (!front) return 'нет поля front'

  // Тип по умолчанию basic (§4). Незнакомое значение - брак, а не «сойдёт
  // за basic»: cloze с опечаткой в типе потерял бы пропуски.
  const rawType = asString(o.type) ?? 'basic'
  if (rawType !== 'basic' && rawType !== 'cloze') return `неизвестный тип «${rawType}»`

  // Cloze без пропусков - карточка, у которой нечего спрашивать.
  // `parseCloze` возвращает и обычный текст, поэтому ищем именно blank-сегмент.
  if (rawType === 'cloze' && !parseCloze(front).some((s) => s.blank)) {
    return 'cloze без пропусков {{...}}'
  }

  return {
    type: rawType,
    front,
    back: asString(o.back),
    details: asString(o.details),
    examples: asExamples(o.examples),
    // У cloze обратной не бывает (§3), чем бы файл ни клялся.
    reverse: rawType === 'cloze' ? false : o.reverse === true,
    tags: asTags(o.tags),
  }
}

export function parseDeck(text: string): Deck {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new DeckParseError('Файл не похож на JSON')
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new DeckParseError('Ожидался объект с полем notes')
  }

  const o = data as Record<string, unknown>
  if (!Array.isArray(o.notes)) throw new DeckParseError('В файле нет списка notes')

  const notes: DeckNote[] = []
  const issues: DeckIssue[] = []
  o.notes.forEach((raw, index) => {
    const parsed = parseNote(raw)
    if (typeof parsed === 'string') issues.push({ index, reason: parsed })
    else notes.push(parsed)
  })

  return { folder: asString(o.folder), notes, issues }
}

/** Ключ, по которому ищем дубликаты: то же слово в той же папке (§4). */
export function duplicateKey(front: string): string {
  return front.trim().toLowerCase()
}

/**
 * Пойдёт ли за этой заметкой словарный лукап (§4: только отдельные слова).
 * cloze лукапу не подлежит; для basic решает `lookupTerm` (в т.ч. «to stir»).
 */
export function needsLookup(note: DeckNote): boolean {
  return note.type === 'basic' && lookupTerm(note.front) !== null
}
