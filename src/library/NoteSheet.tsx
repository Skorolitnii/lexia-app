import { useEffect, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { backdropVariants, dialogVariants, sheetVariants } from '@/components/motion'
import { useMediaQuery } from '@/components/useMediaQuery'

/**
 * Модальный слой формы. Мобайл - лист на весь экран (выезжает снизу), десктоп -
 * окно по центру. Esc закрывает; фон кликабелен только на десктопе (на мобайле
 * его не видно).
 *
 * Вход/выход анимирует `motion`. Родитель обязан обернуть `<NoteSheet>` в
 * `<AnimatePresence>` - иначе выход не проиграется (компонент размонтируется
 * мгновенно).
 */
export function NoteSheet({
  onClose,
  children,
  /** Ширина окна на десктопе: превью импорта - таблица, ему нужно шире формы. */
  wide = false,
  /**
   * Высота по контенту (десктоп). По умолчанию окно занимает 86vh - верно для
   * длинных форм со скроллом; коротким (редактор папки) это даёт пустоту, им
   * нужен `fitContent`: высота по содержимому, но не выше 86vh.
   */
  fitContent = false,
}: {
  onClose: () => void
  children: ReactNode
  wide?: boolean
  fitContent?: boolean
}) {
  const desktop = useMediaQuery('(min-width: 1024px)')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex lg:items-center lg:justify-center lg:p-8">
      <motion.button
        type="button"
        aria-label="Закрыть"
        tabIndex={-1}
        onClick={onClose}
        variants={backdropVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="absolute inset-0 hidden cursor-default bg-ink/25 lg:block"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        // Лист снизу на мобайле, окно с масштабом на десктопе - брейкпоинт
        // выбирает набор вариантов (у них разная геометрия входа).
        variants={desktop ? dialogVariants : sheetVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className={`relative flex h-full max-h-full w-full min-h-0 flex-col overflow-hidden bg-surface lg:rounded-card lg:shadow-panel ${fitContent ? 'lg:h-auto lg:max-h-[86vh]' : 'lg:h-[86vh]'} ${wide ? 'lg:w-[860px]' : 'lg:w-[560px]'}`}
      >
        {children}
      </motion.div>
    </div>
  )
}
