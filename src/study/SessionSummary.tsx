import { motion } from 'motion/react'
import { CheckIcon } from '@/components/icons'
import { softSpring } from '@/components/motion'
import { formatDuration, formatInterval, plural } from '@/study/format'
import type { QueueOutlook } from '@/data/queue'

interface SummaryStats {
  reviewed: number
  correct: number
  newLearned: number
  elapsedMs: number
}

function Tile({
  value,
  label,
  accent = false,
}: {
  value: string
  label: string
  accent?: boolean
}) {
  return (
    <div className="flex-1 rounded-2xl border border-line-soft bg-card-soft p-4">
      <div
        className={`text-[28px] font-extrabold lg:text-[34px] ${accent ? 'text-brand-strong' : 'text-ink'}`}
      >
        {value}
      </div>
      <div className="text-xs font-semibold text-faint-2 lg:text-[12.5px]">{label}</div>
    </div>
  )
}

/** Сколько новых добираем за одно нажатие «Учить дальше». */
const MORE_STEP = 10

export function SessionSummary({
  stats,
  folderName,
  outlook,
  onHome,
  onStudyMore,
  onCram,
}: {
  stats: SummaryStats
  folderName: string | null
  outlook: QueueOutlook
  onHome: () => void
  /** Добрать новых сверх дневной нормы. */
  onStudyMore: (n: number) => void
  /** Прогон без расписания - когда нового не осталось, но повторить хочется. */
  onCram: () => void
}) {
  const accuracy = stats.reviewed > 0 ? Math.round((stats.correct / stats.reviewed) * 100) : 100
  const nothingToDo = stats.reviewed === 0
  const now = new Date()

  // За очередью ещё стоят новые слова - значит упёрлись в дневную норму, а не
  // выучили всё. Раньше оба случая давали одно «возвращайтесь позже», и кнопка
  // «Учить дальше» в первом из них молча ничего не делала.
  const cappedByLimit = outlook.newBeyondLimit > 0
  const more = Math.min(MORE_STEP, outlook.newBeyondLimit)

  const waitHint = outlook.nextDueAt
    ? `Ближайшее повторение через ${formatInterval(outlook.nextDueAt, now)}.`
    : null

  return (
    <div className="flex flex-1 items-center justify-center p-5">
      <motion.div
        className="w-full max-w-[560px] rounded-[26px] bg-card p-8 text-center shadow-summary lg:p-11"
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={softSpring}
      >
        <div className="mx-auto mb-5 flex size-[84px] items-center justify-center rounded-full bg-brand-soft">
          <motion.span
            className="flex size-[54px] items-center justify-center rounded-full bg-brand text-white"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ ...softSpring, delay: 0.12 }}
          >
            <CheckIcon className="size-7" />
          </motion.span>
        </div>

        <h2 className="text-[22px] font-extrabold text-ink lg:text-[28px]">
          {nothingToDo ? 'На сегодня всё' : 'Отличная сессия!'}
        </h2>
        <p className="mt-2 text-[15px] text-faint">
          {nothingToDo
            ? cappedByLimit
              ? `Дневная норма новых слов выбрана. В этой папке ждут ещё ${outlook.newBeyondLimit} ${plural(outlook.newBeyondLimit, 'слово', 'слова', 'слов')}.`
              : (waitHint ?? 'Карточек к повторению нет - возвращайтесь позже.')
            : [
                folderName,
                `${stats.reviewed} ${plural(stats.reviewed, 'карточка', 'карточки', 'карточек')}`,
                formatDuration(stats.elapsedMs),
              ]
                .filter(Boolean)
                .join(' · ')}
        </p>

        {/* Срок ближайшего повторения - вторая строка, когда первую занял
            рассказ про норму. */}
        {nothingToDo && cappedByLimit && waitHint && (
          <p className="mt-1 text-[13.5px] text-faint-2">{waitHint}</p>
        )}

        {!nothingToDo && (
          <div className="mt-7 flex gap-3">
            <Tile value={String(stats.reviewed)} label="повторов" />
            <Tile value={`${accuracy}%`} label="верных" accent />
            <Tile value={String(stats.newLearned)} label="новых слов" />
          </div>
        )}

        <div className="mt-7 flex gap-3">
          <button
            type="button"
            onClick={onHome}
            className="flex-1 cursor-pointer rounded-[14px] bg-rail px-4 py-3.5 text-[15px] font-bold text-muted-2"
          >
            На главную
          </button>
          {/* Кнопка обязана что-то делать. Есть новые за лимитом - добираем
              порцию; нет - предлагаем прогон без расписания. Прежняя «Учить
              дальше» звала пересобрать очередь, которая упиралась в ту же
              норму, и экран не менялся. */}
          <button
            type="button"
            onClick={() => (cappedByLimit ? onStudyMore(more) : onCram())}
            className="flex-[1.4] cursor-pointer rounded-[14px] bg-brand px-4 py-3.5 text-[15px] font-extrabold text-white shadow-fab"
          >
            {cappedByLimit ? `Ещё ${more} ${plural(more, 'слово', 'слова', 'слов')}` : 'Повторить'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
