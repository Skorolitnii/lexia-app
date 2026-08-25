import type { Direction } from '@/types'
import { clozePlainText } from '@/study/cloze'

/**
 * Что озвучить автоплеем для текущего состояния карточки - или `null`, если
 * ничего. Правила (§6):
 *
 * - `forward` - EN-слово на лице: играем на ЛИЦЕ (revealed=false).
 * - `reverse` - лицо русское (озвучивать нечего), EN-слово появляется на ОБОРОТЕ:
 *   играем его на обороте (revealed=true).
 * - `cloze` - лицо это предложение с пропусками; озвучка целиком выдала бы
 *   скрытые слова, поэтому играем только на ОБОРОТЕ (revealed=true), уже без
 *   секрета, предложение целиком (`clozePlainText`).
 *
 * И у forward, и у reverse озвучивается EN-слово из `note.front`, просто на
 * разных сторонах. `front` - `note.front` (EN-слово либо cloze-предложение с
 * разметкой).
 */
export function autoplayText({
  autoplay,
  direction,
  front,
  revealed,
}: {
  autoplay: boolean
  direction: Direction | undefined
  front: string
  revealed: boolean
}): string | null {
  if (!autoplay) return null
  if (direction === 'forward') return revealed ? null : front
  if (direction === 'reverse') return revealed ? front : null
  if (direction === 'cloze') return revealed ? clozePlainText(front) : null
  return null
}
