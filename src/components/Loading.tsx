import type { CSSProperties } from 'react'

/**
 * Примитивы состояния загрузки. Два, и выбор между ними - не про размер экрана,
 * а про то, чего мы ждём:
 *
 * - `Skeleton` - форма будущего контента известна (списки, плитки статистики).
 *   Держит layout, поэтому данные приезжают без скачка.
 * - `Spinner` - идёт операция, форма результата неизвестна или показывать её
 *   заранее было бы обманом (проверка сессии, карточка изучения, кнопки).
 *
 * Анимация и reduced-motion-фолбэки живут в `index.css` (`.skeleton`/`.spinner`).
 */

/**
 * Прямоугольный плейсхолдер. Размеры задаёт вызывающий через className;
 * `style` - для процентных ширин, которые считаются на месте (строки разной
 * длины выглядят как текст, а не как таблица).
 */
export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden />
}

/**
 * Крутящееся кольцо. `currentColor` - цвет наследуется от родителя, поэтому
 * одна компонента работает и на белом фоне, и внутри залитой brand-кнопки.
 */
export function Spinner({
  size = 18,
  className = '',
}: {
  /** Толщина обводки масштабируется от размера, но не тоньше 2px. */
  size?: number
  className?: string
}) {
  return (
    <span
      className={`spinner inline-block shrink-0 ${className}`}
      style={{ width: size, height: size, borderWidth: Math.max(2, Math.round(size / 9)) }}
      aria-hidden
    />
  )
}

/**
 * Полноэкранная загрузка спиннером с подписью. Подпись обязательна: голое
 * кольцо не говорит, чего именно мы ждём, а `role="status"` озвучивает её
 * скринридеру (сам спиннер `aria-hidden`).
 */
export function LoadingScreen({ label }: { label: string }) {
  return (
    <div
      className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3"
      role="status"
    >
      <Spinner size={26} className="text-brand" />
      <p className="text-[13.5px] font-medium text-faint">{label}</p>
    </div>
  )
}
