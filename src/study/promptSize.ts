/**
 * Кегль лица карточки под длину текста. Лицо - единственное место с огромным
 * фиксированным размером (42/62px), и для reverse-карточки им выводится русский
 * перевод произвольной длины: «протестующий, участник акции протеста» в 62px
 * занимал всю карточку.
 *
 * Ступени, а не порог «после N символов сразу мелко»: скачок между соседними
 * длинами заметен, плавное уменьшение - нет.
 */
const STEPS: { maxChars: number; maxWord: number; cls: string }[] = [
  { maxChars: 10, maxWord: 10, cls: 'text-[42px] lg:text-[62px]' },
  { maxChars: 16, maxWord: 13, cls: 'text-[34px] lg:text-[48px]' },
  { maxChars: 26, maxWord: 16, cls: 'text-[26px] lg:text-[36px]' },
  { maxChars: Infinity, maxWord: Infinity, cls: 'text-[21px] lg:text-[28px]' },
]

/**
 * Ступень выбирается по обоим ограничениям сразу: длинное слово не переносится
 * и распирает карточку по ширине сильнее, чем несколько коротких той же
 * суммарной длины, поэтому у него лимит строже.
 */
export function promptSizeCls(text: string): string {
  const trimmed = text.trim()
  const longestWord = trimmed.split(/\s+/).reduce((max, w) => Math.max(max, w.length), 0)
  return STEPS.find((s) => trimmed.length <= s.maxChars && longestWord <= s.maxWord)!.cls
}
