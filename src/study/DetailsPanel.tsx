import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import { motion } from 'motion/react'
import { CloseIcon, InfoIcon } from '@/components/icons'
import { backdropVariants } from '@/components/motion'

/**
 * Панель `details` (Markdown: грамматика, нюансы, синонимы) - открывается поверх
 * оборота карточки по тапу на info-чип. Контент приходит извне (нейросеть),
 * поэтому рендерится через `rehypeSanitize` (§7): HTML-инъекции вырезаются.
 *
 * Родитель оборачивает в `<AnimatePresence>` ради выхода.
 */
/** Подпись info-панели. Общая с кнопкой на карточке, чтобы не разъезжались. */
export const DETAILS_LABEL = 'Грамматика и нюансы'

export function DetailsPanel({ markdown, onClose }: { markdown: string; onClose: () => void }) {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col rounded-card-lg bg-card lg:rounded-[26px]"
      variants={backdropVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-line-soft px-6 py-4 lg:px-8">
        <span className="flex items-center gap-2 text-[13px] font-extrabold tracking-[0.05em] text-label uppercase">
          <InfoIcon className="size-4" />
          {DETAILS_LABEL}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть панель"
          className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-track text-faint hover:text-ink"
        >
          <CloseIcon className="size-4" />
        </button>
      </div>

      <div className="markdown-body min-h-0 flex-1 overflow-y-auto px-6 py-5 lg:px-8">
        <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{markdown}</ReactMarkdown>
      </div>
    </motion.div>
  )
}
