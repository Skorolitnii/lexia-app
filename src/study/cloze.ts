/**
 * Cloze-синтаксис: `{{ответ}}` или `{{ответ::подсказка}}`.
 * В MVP все пропуски прячутся разом (одна карточка).
 */
export interface ClozeSegment {
  text: string
  /** Пропуск: на лице скрыт, на обороте показан. */
  blank: boolean
  hint?: string
}

const CLOZE_RE = /\{\{(.+?)\}\}/g

export function parseCloze(source: string): ClozeSegment[] {
  const segments: ClozeSegment[] = []
  let lastIndex = 0

  for (const match of source.matchAll(CLOZE_RE)) {
    const index = match.index
    if (index > lastIndex) {
      segments.push({ text: source.slice(lastIndex, index), blank: false })
    }
    const [answer, hint] = match[1]!.split('::')
    segments.push({ text: answer!, blank: true, ...(hint ? { hint } : {}) })
    lastIndex = index + match[0].length
  }

  if (lastIndex < source.length) {
    segments.push({ text: source.slice(lastIndex), blank: false })
  }
  return segments
}

/** Текст для озвучки: пропуски заменены ответами. */
export function clozePlainText(source: string): string {
  return parseCloze(source)
    .map((s) => s.text)
    .join('')
}

/** Превью для списка библиотеки: пропуски скрыты за «…», без сырых скобок. */
export function clozePreview(source: string): string {
  return parseCloze(source)
    .map((s) => (s.blank ? '…' : s.text))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}
