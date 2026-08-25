import type { FolderRow } from '@/types'
import { EditIcon, AddIcon } from '@/components/icons'
import { folderDotColor } from '@/library/folderColors'
import type { FolderItem, FolderScope } from '@/library/useLibrary'

export function FolderList({
  folders,
  selected,
  onSelect,
  onCreate,
  onEdit,
}: {
  folders: FolderItem[]
  selected: FolderScope
  onSelect: (scope: FolderScope) => void
  onCreate: () => void
  /** Открыть редактор папки (переименование/цвет/удаление). */
  onEdit?: (folder: FolderRow) => void
}) {
  return (
    <>
      <div className="mb-3 flex items-center justify-between px-1.5">
        <span className="text-[12px] font-extrabold tracking-[0.06em] text-label uppercase">
          Папки
        </span>
        <button
          type="button"
          onClick={onCreate}
          aria-label="Создать папку"
          className="flex size-6 cursor-pointer items-center justify-center rounded-lg border border-brand/30 bg-brand-soft text-brand-ink transition-colors hover:border-brand/55 hover:bg-brand-wash"
        >
          <AddIcon className="size-3.5" strokeWidth={2.5} />
        </button>
      </div>

      <div className="flex flex-col gap-1 lg:gap-0.5">
        {folders.map((item) => {
          const id = item.folder?.id ?? null
          const active = selected === id
          const folder = item.folder
          return (
            <div
              key={id ?? 'all'}
              className={`group flex items-center gap-2 rounded-[11px] pr-3 transition-colors ${
                active ? 'bg-card shadow-card' : 'hover:bg-rail'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(id)}
                aria-label={`${folder?.name ?? 'Все слова'} - ${item.noteCount}`}
                aria-current={active ? 'true' : undefined}
                className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-[11px] py-2.5 pr-0 pl-3 text-left text-[14px] ${
                  active ? 'font-bold text-ink' : 'font-semibold text-muted-2'
                }`}
              >
                <span
                  className={`size-2.5 shrink-0 ${folder ? 'rounded-full' : 'rounded-[3px]'}`}
                  style={{ background: folder ? folderDotColor(folder.color) : '#c8bdac' }}
                />
                <span className="flex-1 truncate">{folder?.name ?? 'Все слова'}</span>
              </button>
              <span className="relative flex size-7 shrink-0 items-center justify-center">
                <span
                  aria-hidden="true"
                  className={`text-[13px] text-hint ${
                    folder && onEdit
                      ? `${active ? 'opacity-0' : ''} lg:group-hover:opacity-0 lg:group-focus-within:opacity-0`
                      : ''
                  }`}
                >
                  {item.noteCount}
                </span>
                {folder && onEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(folder)}
                    aria-label={`Изменить папку ${folder.name}`}
                    className={`absolute inset-0 flex cursor-pointer items-center justify-center rounded-lg text-faint transition-opacity hover:text-ink lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 ${
                      active ? 'opacity-100' : 'opacity-0'
                    }`}
                  >
                    <EditIcon className="size-3.5" />
                  </button>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </>
  )
}
