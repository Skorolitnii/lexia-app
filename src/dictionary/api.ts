/**
 * Datamuse API (§4): дотягиваем транскрипцию и определения.
 * Перевода этот словарь не даёт - `back` остаётся ручным полем.
 * Примеров употребления Datamuse не отдаёт вовсе - они заполняются вручную
 * либо приходят из файла нейросети (там они с переводом, то есть полезнее).
 *
 * Озвучка со словарём не связана вовсе: её целиком делает облачный синтез
 * (`src/speech/cloudTts.ts`).
 */

/**
 * Сырой ответ Datamuse: одно слово со списком `tags` и определений.
 * Транскрипция лежит в теге `ipa_pron:...` (флаг `ipa=1`), часть речи -
 * односимвольным тегом (`n`, `v`, `adj`), определения - строками вида
 * «n\tтекст определения».
 */
interface RawWord {
  word?: string
  tags?: string[]
  defs?: string[]
}

/**
 * Одно значение слова: часть речи и определение. У многозначных слов
 * (box - коробка / удар / самшит) таких значений несколько - форма даёт
 * выбрать нужное, а не берёт молча первое.
 */
export interface Sense {
  partOfSpeech: string | null
  definition: string
}

/** То, что форма может подставить в поля заметки. */
export interface Lookup {
  transcription: string | null
  audioUrl: string | null
  partOfSpeech: string | null
  definition: string | null
  /** Значения в порядке словаря; пусто, если определений нет. */
  senses: Sense[]
}

/**
 * Словарный лукап осмыслен только для отдельных слов (§4): для фраз и cloze
 * его пропускаем. Дефис и апостроф - часть слова (well-known, don't).
 *
 * Латиница с диакритикой проходит: café, naïve, résumé словарь знает.
 * Кириллица и цифры отсекаются: это заведомо не английское слово, запрос
 * был бы холостым.
 */
const LATIN_WORD = /^[\p{Script=Latin}][\p{Script=Latin}\p{Mn}'-]*$/u

/** Ведущая инфинитивная частица «to » (глаголы в колодах: to stir, to run). */
const INFINITIVE_TO = /^to\s+/i

/**
 * Слово, по которому реально идём в словарь, или `null`, если лукап не нужен.
 *
 * Словарь ищет по самому слову: «to stir» не находится, а «stir» - да,
 * поэтому ведущее «to » срезаем (частая запись глаголов в колодах). Само `front`
 * при этом не трогаем - в заметке остаётся «to stir». Возвращаем нижний регистр:
 * лукап регистронезависим, а ключ кэша не должен двоиться на Stir/stir.
 */
export function lookupTerm(front: string): string | null {
  const word = front.trim().replace(INFINITIVE_TO, '')
  return word.length > 0 && LATIN_WORD.test(word) ? word.toLowerCase() : null
}

/** Годится ли `front` для словарного лукапа (см. `lookupTerm`). */
export function isSingleWord(front: string): boolean {
  return lookupTerm(front) !== null
}

/** Полные названия частей речи: Datamuse отдаёт их односимвольным тегом. */
const PART_OF_SPEECH: Record<string, string> = {
  n: 'noun',
  v: 'verb',
  adj: 'adjective',
  adv: 'adverb',
  u: 'unknown',
}

/**
 * Определение приходит строкой «n\tтекст». Часть речи отделена табом; у
 * некоторых определений префикса нет - тогда часть речи неизвестна.
 */
function parseDef(def: string): Sense | null {
  const tab = def.indexOf('\t')
  const [tag, text] = tab === -1 ? [null, def] : [def.slice(0, tab), def.slice(tab + 1)]
  const definition = text.trim()
  if (!definition) return null
  return {
    partOfSpeech: tag ? (PART_OF_SPEECH[tag] ?? tag) : null,
    definition,
  }
}

/**
 * Разбор ответа Datamuse. `words` содержит ровно одно слово (`max=1`), но
 * может быть пустым - слова нет в словаре.
 *
 * Аудио здесь всегда `null`: озвучку делает облачный синтез по тексту, и
 * словарь к ней отношения не имеет.
 */
export function parseWords(words: RawWord[]): Lookup {
  const tags = words[0]?.tags ?? []
  const ipa = tags.find((t) => t.startsWith('ipa_pron:'))?.slice('ipa_pron:'.length)
  const senses = (words[0]?.defs ?? []).flatMap((d) => parseDef(d) ?? [])

  return {
    // Datamuse отдаёт IPA без косых скобок - добавляем, как принято в словарях
    // и как приходило из прежнего источника.
    transcription: ipa ? `/${ipa}/` : null,
    audioUrl: null,
    partOfSpeech: senses[0]?.partOfSpeech ?? null,
    definition: senses[0]?.definition ?? null,
    senses,
  }
}

/** Сколько значений на часть речи показываем до раскрытия полного списка. */
const TOP_PER_POS = 2

/**
 * Самые ходовые значения: по `TOP_PER_POS` на часть речи, в порядке словаря.
 *
 * Datamuse отдаёт полный список Wiktionary - у `box` их 60, у `run` 122, и
 * скролл на пол-экрана мешает выбрать нужное. Частотные значения идут первыми,
 * поэтому берём начало списка, но по каждой части речи отдельно: у `box`
 * глагол «боксировать» стоит 48-м, и простая обрезка потеряла бы его вовсе.
 */
export function topSenses(senses: Sense[]): Sense[] {
  const used = new Map<string, number>()
  return senses.filter((s) => {
    const key = s.partOfSpeech ?? ''
    const seen = used.get(key) ?? 0
    if (seen >= TOP_PER_POS) return false
    used.set(key, seen + 1)
    return true
  })
}

/** Слово не найдено - это нормальный исход, а не ошибка (§7). */
export class WordNotFound extends Error {
  constructor(word: string) {
    super(`«${word}» не найдено в словаре`)
    this.name = 'WordNotFound'
  }
}

const ENDPOINT = 'https://api.datamuse.com/words'

/**
 * `sp` - точное совпадение по написанию, `md=dpr` - определения, часть речи и
 * произношение, `max=1` - нужное слово одно. Флаг `r` обязателен: без него
 * транскрипции нет вовсе, а `ipa=1` лишь меняет её формат с ARPAbet на IPA
 * (проверено на живом ответе).
 */
export async function lookupWord(word: string, signal?: AbortSignal): Promise<Lookup> {
  const query = new URLSearchParams({
    sp: word.trim(),
    md: 'dpr',
    ipa: '1',
    max: '1',
  })
  const res = await fetch(`${ENDPOINT}?${query}`, { signal })
  if (!res.ok) throw new Error(`Словарь ответил ${res.status}`)
  const data: unknown = await res.json()
  // 404 у Datamuse не бывает: неизвестное слово - это пустой массив.
  if (!Array.isArray(data) || data.length === 0) throw new WordNotFound(word)
  return parseWords(data as RawWord[])
}
