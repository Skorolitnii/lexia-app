/**
 * Цвета папок в OKLCH (§дизайн: цвета в OKLCH, не hex). Светлота и насыщенность
 * фиксированы, различается только оттенок (hue) - так любой цвет, выбранный
 * ползунком, остаётся согласован с «тёплой» темой и пресетами.
 *
 * Значение кладётся прямо в `folder.color` и в `style.background`.
 * `null` - цвет по умолчанию (брендовый), выбор «без цвета».
 */
export const FOLDER_L = 0.64
export const FOLDER_C = 0.14

/** Оттенки быстрых пресетов (в градусах). Порядок - как в палитре. */
export const FOLDER_HUES = [158, 245, 300, 20, 60, 200, 340] as const

/** Серый - особый: у него насыщенность почти нулевая, вне hue-шкалы. */
export const FOLDER_GRAY = 'oklch(0.6 0.02 260)'

/** Цвет по оттенку при фиксированных L/C. */
export function hueColor(hue: number): string {
  return `oklch(${FOLDER_L} ${FOLDER_C} ${hue})`
}

/** Пресеты палитры: цветные оттенки + серый в конце. */
export const FOLDER_COLORS = [...FOLDER_HUES.map(hueColor), FOLDER_GRAY] as const

/** Цвет папки по умолчанию (брендовый зелёный) - первый оттенок палитры. */
export const DEFAULT_FOLDER_COLOR = hueColor(FOLDER_HUES[0])

/** Цвет метки папки: заданный или брендовый по умолчанию. */
export function folderDotColor(color: string | null): string {
  return color ?? DEFAULT_FOLDER_COLOR
}

/**
 * Достаёт оттенок из oklch-строки, чтобы поставить ползунок в позицию
 * сохранённого цвета. Третье число в `oklch(L C H)` - hue. Серый (и всё,
 * что не разобралось) даёт null: у него оттенка по сути нет.
 */
export function hueOf(color: string | null): number | null {
  if (!color) return null
  const m = color.match(/oklch\(\s*[\d.]+\s+([\d.]+)\s+([\d.]+)/)
  if (!m) return null
  const chroma = parseFloat(m[1])
  const hue = parseFloat(m[2])
  // Малая насыщенность - это серый/нейтральный, оттенок не показываем.
  return chroma < 0.05 ? null : hue
}
