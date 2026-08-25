import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { FolderRow } from '@/types'
import { CheckIcon, CloseIcon } from '@/components/icons'
import { backdropVariants, sheetVariants } from '@/components/motion'
import { fieldCls } from '@/components/formStyles'
import { folderDotColor } from '@/library/folderColors'
import { DESKTOP_QUERY, useMediaQuery } from '@/components/useMediaQuery'

/**
 * Выбор папки для заметки (макет «Новое слово v3»). Папок бывают десятки,
 * поэтому вместо нативного селекта - комбобокс с поиском: на десктопе
 * выпадающий список под полем, на мобайле лист снизу.
 *
 * Новую папку здесь не заводим: «строка поиска = имя новой папки» оказалась
 * неочевидной. Кнопка внизу списка отдаёт наружу запрос на полноценное окно
 * папки (имя + цвет) - то же самое, что открывается из Библиотеки.
 */
export function FolderPicker({
  folders,
  folderId,
  onPick,
  onCreate,
}: {
  folders: FolderRow[]
  folderId: string | null
  /** Выбрана существующая папка. */
  onPick: (id: string) => void
  /** Открыть окно создания папки; аргумент - набранное в поиске имя (заготовка). */
  onCreate: (suggestedName: string) => void
}) {
  const desktop = useMediaQuery(DESKTOP_QUERY)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = folders.find((f) => f.id === folderId) ?? null
  // Папка обязательна, поэтому пустое состояние - это призыв выбрать.
  const label = selected?.name ?? 'Выберите папку'
  const dot = selected ? folderDotColor(selected.color) : folderDotColor(null)

  const q = query.trim().toLowerCase()
  const matches = folders.filter((f) => f.name.toLowerCase().includes(q))

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  const pick = (id: string) => {
    onPick(id)
    close()
  }

  // Создание отдаём наружу - в полноценное окно папки (имя + цвет). Список
  // при этом закрываем: окно откроется поверх формы слова, и оставшаяся под
  // ним выпадашка мешала бы вернуться к выбору.
  const create = () => {
    close()
    onCreate(query.trim())
  }

  // Клик мимо и Esc закрывают список. Esc гасим здесь же, чтобы он не долетел
  // до `NoteSheet` и не закрыл заодно всю форму (первым закрывается верхний слой).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    document.addEventListener('mousedown', onDown)
    // Capture: обработчик `NoteSheet` висит на window и без перехвата успел бы
    // закрыть форму раньше, чем всплытие дойдёт сюда.
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  // Фокус в поиск при открытии - можно сразу печатать имя папки. Только на
  // десктопе: на мобайле лист и так занимает пол-экрана, а поднятая клавиатура
  // накрыла бы список папок - ради которого его и открыли. Там фокус приходит
  // по тапу в поиск или по кнопке «+ Новая папка».
  useEffect(() => {
    if (open && desktop) searchRef.current?.focus()
  }, [open, desktop])

  const search = (
    <input
      ref={searchRef}
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return
        // Enter внутри формы отправил бы её целиком - перехватываем и выбираем
        // единственную подходящую папку.
        e.preventDefault()
        if (matches.length === 1) pick(matches[0].id)
      }}
      placeholder="Поиск папки"
      aria-label="Поиск папки"
      className={`${fieldCls} py-2.5 text-[14px]`}
    />
  )

  const list = (
    <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
      {matches.map((f) => {
        const active = f.id === folderId
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => pick(f.id)}
            className={`flex cursor-pointer items-center gap-2.5 rounded-[11px] px-3 py-2.5 text-left transition-colors ${
              active ? 'bg-brand-wash' : 'hover:bg-rail'
            }`}
          >
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: folderDotColor(f.color) }}
            />
            <span
              className={`flex-1 truncate text-[14.5px] text-ink ${active ? 'font-extrabold' : 'font-semibold'}`}
            >
              {f.name}
            </span>
            {active && <CheckIcon className="size-3.5 shrink-0 text-brand-ink" />}
          </button>
        )
      })}
      {matches.length === 0 && (
        <p className="px-3 py-2.5 text-[13.5px] text-faint">
          {q ? 'Ничего не нашлось' : 'Пока нет ни одной папки'}
        </p>
      )}
    </div>
  )

  // Кнопка создания (макет v3, десктоп): строка внизу списка, отделённая
  // границей, без рамки - зелёный жирный текст. Доступна всегда: имя и цвет
  // спрашивает окно папки, а не эта строка. Набранный запрос уезжает туда
  // заготовкой имени - «искал, не нашёл, создаю» продолжается без перенабора.
  const createRow = (
    <button
      type="button"
      onClick={create}
      className="shrink-0 cursor-pointer border-t border-line-soft px-3 pt-3 pb-1 text-left text-[14px] font-bold text-brand-ink transition-colors hover:text-brand-ink-deep"
    >
      {q ? `+ Создать папку «${query.trim()}»` : '+ Новая папка'}
    </button>
  )

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${fieldCls} flex cursor-pointer items-center gap-2.5 text-left ${
          open ? 'border-brand shadow-focus' : ''
        }`}
      >
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: dot }} />
        <span
          className={`flex-1 truncate text-[15px] font-bold ${selected ? 'text-ink' : 'text-hint'}`}
        >
          {label}
        </span>
        <svg
          viewBox="0 0 11 7"
          className="size-2.5 shrink-0 text-faint-2"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M1 1l4.5 4.5L10 1"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Десктоп - выпадающий список под полем; мобайл - лист снизу поверх
          формы (в узком окне выпадашка упёрлась бы в край экрана). */}
      <AnimatePresence>
        {open &&
          (desktop ? (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.14 }}
              className="absolute top-full right-0 left-0 z-10 mt-1.5 flex max-h-[300px] flex-col gap-2 rounded-card border border-line bg-card p-2.5 shadow-panel"
            >
              {search}
              {list}
              {createRow}
            </motion.div>
          ) : (
            <div className="fixed inset-0 z-50 flex flex-col justify-end">
              <motion.button
                type="button"
                aria-label="Закрыть"
                tabIndex={-1}
                onClick={close}
                variants={backdropVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="absolute inset-0 cursor-default bg-ink/25"
              />
              <motion.div
                variants={sheetVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="relative flex max-h-[70%] flex-col gap-3 rounded-t-card bg-surface px-5 pt-4 pb-6"
              >
                <div className="flex shrink-0 items-center justify-between">
                  <span className="text-[16px] font-extrabold text-ink">Папка</span>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Закрыть выбор папки"
                    className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-rail text-faint-2 transition-colors hover:bg-rail-hover hover:text-muted"
                  >
                    <CloseIcon className="size-3.5" />
                  </button>
                </div>
                {search}
                {list}
                {createRow}
              </motion.div>
            </div>
          ))}
      </AnimatePresence>
    </div>
  )
}
