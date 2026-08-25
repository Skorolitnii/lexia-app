import { useState } from 'react'
import type { FolderRow } from '@/types'
import { CheckIcon } from '@/components/icons'
import { Spinner } from '@/components/Loading'
import { plural } from '@/study/format'
import { DESKTOP_QUERY, useMediaQuery } from '@/components/useMediaQuery'
import {
  DEFAULT_FOLDER_COLOR,
  FOLDER_COLORS,
  FOLDER_HUES,
  hueColor,
  hueOf,
} from '@/library/folderColors'

/**
 * Форма папки: создание или переименование + выбор цвета и удаление.
 * Рендерится внутри `NoteSheet` (с `fitContent` - окно по высоте контента).
 * При удалении даём выбор: оставить слова (они уходят из папки, §3
 * `folder_id on delete set null`) или удалить их вместе с папкой. Подтверждаем
 * инлайн, а не через `window.confirm` (тот к тому же блокирует автоматизацию
 * превью).
 */
export function FolderEditor({
  folder,
  initialName,
  noteCount = 0,
  onSave,
  onDelete,
  onCancel,
  saving = false,
}: {
  /** null - создаём новую. */
  folder: FolderRow | null
  /**
   * Заготовка имени для новой папки: пришли из поиска в форме слова, где имя
   * уже набрали. Без неё его пришлось бы печатать заново.
   */
  initialName?: string
  /** Сколько слов в папке - определяет, показывать ли вариант «со словами». */
  noteCount?: number
  onSave: (patch: { name: string; color: string | null }) => void
  /** `withNotes` - удалить ли заодно слова папки. */
  onDelete?: (withNotes: boolean) => void
  onCancel: () => void
  /** Идёт запись - блокирует кнопки, чтобы двойной клик не задвоил папку. */
  saving?: boolean
}) {
  const [name, setName] = useState(folder?.name ?? initialName ?? '')
  // Цвет - единственный источник правды; ползунок пишет `hueColor(h)`.
  const [color, setColor] = useState<string>(folder?.color ?? DEFAULT_FOLDER_COLOR)
  // Оттенок для ползунка: у серого его нет - держим последний цветной, чтобы
  // ползунок не прыгал в 0, если пользователь вернётся от серого к цветному.
  const [hue, setHue] = useState<number>(hueOf(folder?.color ?? null) ?? FOLDER_HUES[0])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isDesktop = useMediaQuery(DESKTOP_QUERY)

  const trimmed = name.trim()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!trimmed || saving) return
    onSave({ name: trimmed, color })
  }

  return (
    <form onSubmit={submit} className="flex flex-col">
      <div className="flex items-center justify-between border-b border-line-soft px-6 py-4 lg:px-7">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* Живой предпросмотр метки - как папка встанет в сайдбар. */}
          <span
            aria-hidden
            style={{ background: color }}
            className="size-4 shrink-0 rounded-full ring-3 ring-ink/5"
          />
          <h2 className="truncate text-[17px] font-extrabold text-ink">
            {folder ? 'Папка' : 'Новая папка'}
          </h2>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer text-[13.5px] font-semibold text-faint hover:text-ink"
        >
          Отмена
        </button>
      </div>

      <div className="px-6 py-5 lg:px-7">
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-extrabold tracking-[0.05em] text-label uppercase">
            Название
          </span>
          <input
            // autoFocus только на десктопе: на мобайле фокус поднимает
            // клавиатуру и зумит вьюпорт, сразу пряча половину листа.
            autoFocus={isDesktop}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например, Животные"
            className="w-full rounded-[12px] border border-line bg-card px-3.5 py-2.5 text-[15px] text-ink outline-none placeholder:text-hint focus:border-brand"
          />
        </label>

        <div className="mt-5">
          <span className="mb-2 block text-[12px] font-extrabold tracking-[0.05em] text-label uppercase">
            Цвет
          </span>

          {/* Пресеты - быстрый выбор. */}
          <div className="flex flex-wrap gap-2.5">
            {FOLDER_COLORS.map((c) => {
              const on = color === c
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setColor(c)
                    const h = hueOf(c)
                    if (h !== null) setHue(h)
                  }}
                  aria-label={`Цвет ${c}`}
                  aria-pressed={on}
                  style={{ background: c }}
                  className={`flex size-8 cursor-pointer items-center justify-center rounded-full text-white transition-transform ${
                    on ? 'scale-110 ring-2 ring-ink/20 ring-offset-2 ring-offset-surface' : ''
                  }`}
                >
                  {on && <CheckIcon className="size-4" />}
                </button>
              )
            })}
          </div>

          {/* Свой оттенок. Ползунок крутит только hue: L/C фиксированы, поэтому
              любой цвет остаётся в гармонии с темой. */}
          <div className="mt-4 flex items-center gap-3">
            <span
              aria-hidden
              style={{ background: color }}
              className="size-8 shrink-0 rounded-full ring-3 ring-ink/5"
            />
            <input
              type="range"
              min={0}
              max={360}
              value={hue}
              onChange={(e) => {
                const h = Number(e.target.value)
                setHue(h)
                setColor(hueColor(h))
              }}
              aria-label="Свой оттенок"
              className="hue-slider h-2 flex-1 cursor-pointer appearance-none rounded-full"
            />
          </div>
        </div>
      </div>

      {/* Режим подтверждения удаления занимает весь подвал: «Сохранить» тут ни к
          чему. Пустую папку удаляем одной кнопкой; у папки со словами даём выбор -
          удалить со словами или оставить слова без папки. */}
      {onDelete && confirmDelete ? (
        <div className="border-t border-line-soft px-6 py-4 lg:px-7">
          <p className="mb-1 text-[13px] font-semibold text-ink">
            {noteCount > 0
              ? `Удалить папку и ${noteCount} ${plural(noteCount, 'слово', 'слова', 'слов')}?`
              : 'Удалить папку?'}
          </p>
          {noteCount > 0 ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => onDelete(true)}
                disabled={saving}
                className="cursor-pointer rounded-[11px] bg-again px-4 py-2.5 text-left text-[13.5px] font-extrabold text-white hover:opacity-90 disabled:opacity-40"
              >
                Удалить со словами
                <span className="block text-[12px] font-medium text-white/85">
                  Папка и все её слова уйдут в корзину.
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(false)}
                disabled={saving}
                className="cursor-pointer rounded-[11px] border border-line px-4 py-2.5 text-left text-[13.5px] font-bold text-ink hover:bg-track disabled:opacity-40"
              >
                Удалить, слова оставить
                <span className="block text-[12px] font-medium text-faint">
                  Слова останутся, но без папки.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={saving}
                className="mt-0.5 cursor-pointer self-start text-[13px] font-semibold text-faint hover:text-ink disabled:opacity-40"
              >
                Отмена
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onDelete(false)}
                disabled={saving}
                className="cursor-pointer text-[13.5px] font-extrabold text-again hover:opacity-80 disabled:opacity-40"
              >
                Да
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={saving}
                className="cursor-pointer text-[13.5px] font-semibold text-faint hover:text-ink disabled:opacity-40"
              >
                Нет
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 border-t border-line-soft px-6 py-4 lg:px-7">
          {onDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="cursor-pointer text-[13.5px] font-bold text-again hover:opacity-80"
            >
              Удалить
            </button>
          )}
          <button
            type="submit"
            disabled={!trimmed || saving}
            className="ml-auto flex cursor-pointer items-center gap-2 rounded-[12px] bg-brand px-5 py-2.5 text-[14px] font-extrabold text-white shadow-brand disabled:opacity-40"
          >
            {saving && <Spinner size={14} />}
            {saving ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      )}
    </form>
  )
}
