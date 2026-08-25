import { useEffect, useRef } from 'react'
import type { NoteItem } from '@/library/useLibrary'
import { NoteRowsSkeleton } from '@/library/LibrarySkeleton'
import { TypeBadge } from '@/components/TypeBadge'
import { clozePreview } from '@/study/cloze'
import { formatDue } from '@/study/format'

/**
 * Ближайший прокручиваемый предок элемента - `root` для IntersectionObserver.
 * `null` (окно), если такого нет: тогда наблюдаем относительно вьюпорта.
 */
function scrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement
  while (node) {
    const oy = getComputedStyle(node).overflowY
    if (oy === 'auto' || oy === 'scroll') return node
    node = node.parentElement
  }
  return null
}

const TONE: Record<'new' | 'due' | 'later', string> = {
  new: 'bg-brand-soft text-brand-ink',
  due: 'bg-again-soft text-again',
  later: 'text-hint',
}

/** Бейдж срока. Для «позже» - без плашки, просто приглушённый текст. */
function DueBadge({ item, now }: { item: NoteItem; now: Date }) {
  const { text, tone } = formatDue(item.due, item.isNew, now)
  if (tone === 'later') {
    return <span className="text-[13px] font-semibold text-faint-2">{text}</span>
  }
  return (
    <span className={`rounded-pill px-2.5 py-1 text-[12px] font-bold ${TONE[tone]}`}>{text}</span>
  )
}

export function NoteList({
  notes,
  now,
  onOpen,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: {
  notes: NoteItem[]
  now: Date
  onOpen: (item: NoteItem) => void
  /** Есть ли ещё страницы (для сентинела бесконечного скролла). */
  hasMore?: boolean
  loadingMore?: boolean
  /** Подгрузить следующую страницу - вызывается при появлении сентинела. */
  onLoadMore?: () => void
}) {
  // Сентинел внизу списка: как только он попадает в область прокрутки,
  // подгружаем следующую страницу. rootMargin запускает загрузку заранее,
  // до того как пользователь упрётся в самый низ.
  //
  // `root` - ближайший прокручиваемый предок, а не окно: список скроллится
  // внутри div'а (`overflow-y-auto` в LibraryPage), и с `root: null` (окно)
  // сентинел за нижней границей контейнера не считался бы «в зоне видимости».
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore || !onLoadMore) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore()
      },
      { root: scrollParent(el), rootMargin: '400px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, onLoadMore, notes.length])

  if (notes.length === 0) {
    return <p className="py-10 text-center text-[14px] text-faint">Ничего не найдено</p>
  }

  return (
    <>
      {/* Шапка таблицы - только десктоп */}
      <div className="hidden items-center gap-4 border-b border-line px-3.5 pb-2.5 text-[11px] font-extrabold tracking-[0.06em] text-label uppercase lg:flex">
        <div className="w-[190px]">Слово</div>
        <div className="flex-1">Перевод</div>
        <div className="w-[90px]">Тип</div>
        <div className="w-[70px] text-right">Срок</div>
      </div>

      <div className="flex flex-col">
        {notes.map((item) => (
          <button
            key={item.note.id}
            type="button"
            onClick={() => onOpen(item)}
            aria-label={`Открыть ${
              item.note.type === 'cloze' ? clozePreview(item.note.front) : item.note.front
            }`}
            className="flex cursor-pointer items-center gap-3 border-b border-line-faint px-1.5 py-3 text-left hover:bg-rail/60 lg:gap-4 lg:px-3.5 lg:py-3"
          >
            {/* Мобайл: слово над переводом. Десктоп: колонки. */}
            <div className="min-w-0 flex-1 lg:w-[190px] lg:flex-none">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-[16px] font-bold text-ink">
                  {item.note.type === 'cloze' ? clozePreview(item.note.front) : item.note.front}
                </span>
                {item.note.reverse && (
                  <span className="font-mono text-[12px] font-semibold text-label lg:hidden">
                    ⇄
                  </span>
                )}
              </div>
              {/* Транскрипция - отдельной строкой под словом (десктоп): длинное
                  слово больше не выталкивает её в столбик. truncate по ширине колонки. */}
              {item.note.transcription && (
                <div className="hidden truncate font-mono text-[12.5px] text-muted-2 lg:block">
                  {item.note.transcription}
                </div>
              )}
              <div className="truncate text-[14px] text-faint-2 lg:hidden">{item.note.back}</div>
            </div>

            <div className="hidden flex-1 truncate text-[15px] text-muted lg:block">
              {item.note.back}
            </div>
            <div className="hidden w-[90px] lg:block">
              <TypeBadge type={item.note.type} reverse={item.note.reverse} />
            </div>

            <div className="shrink-0 lg:w-[70px] lg:text-right">
              <DueBadge item={item} now={now} />
            </div>
          </button>
        ))}
      </div>

      {/* Сентинел + индикатор подгрузки бесконечного скролла. Держим сентинел
          в DOM всегда, пока есть ещё страницы: пустой div высотой в пиксель,
          за которым следит IntersectionObserver. */}
      {hasMore && (
        <div ref={sentinelRef}>
          {/* Догрузка продолжает тот же список - показываем строки-плейсхолдеры,
              а не подпись по центру: список визуально растёт дальше вниз, и
              приехавшие заметки встают ровно на их место. */}
          {loadingMore ? <NoteRowsSkeleton rows={3} header={false} /> : <div className="py-6" />}
        </div>
      )}
    </>
  )
}
