import { useCallback, useEffect, useMemo, useState } from 'react'
import { State } from 'ts-fsrs'
import { motion } from 'motion/react'
import type { CardRow, FolderRow, NoteRow } from '@/types'
import { useRepo } from '@/data/useRepo'
import { NO_FOLDER } from '@/data/queue'
import { CheckIcon } from '@/components/icons'
import { EmptyState } from '@/components/EmptyState'
import { listContainer, listItem } from '@/components/motion'
import { StudySetupSkeleton } from '@/study/StudySetupSkeleton'
import { OnboardingSheets, type OnboardingSheet } from '@/library/OnboardingSheets'
import { FOLDER_GRAY, folderDotColor } from '@/library/folderColors'
import { plural } from '@/study/format'

/** Счётчики папки для экрана выбора. */
interface FolderStat {
  folder: FolderRow | null
  /** true для псевдо-строки «Без папки» (folder_id = null). */
  noFolder?: boolean
  noteCount: number
  dueCount: number
  newCount: number
}

/**
 * Экран выбора области изучения: какие папки и в каком режиме.
 * По «Начать» вызывает `onStart` с выбором - родитель строит очередь.
 * `null` в наборе папок означает «все папки».
 */
export function StudySetup({
  initialFolderId,
  initialCram = false,
  onStart,
}: {
  /** Папка, с которой пришли (из «Учить папку»); undefined - стартуем со «все». */
  initialFolderId?: string | null
  /** Режим, с которым вернулись из сессии: выход не должен сбрасывать выбор. */
  initialCram?: boolean
  onStart: (opts: { folderIds: string[] | null; cram: boolean }) => void
}) {
  const repo = useRepo()
  const [data, setData] = useState<{
    folders: FolderRow[]
    notes: NoteRow[]
    cards: CardRow[]
  } | null>(null)
  // Выбранные папки; пустой набор = «все». `null` в наборе невозможен.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialFolderId ? [initialFolderId] : []),
  )
  const [cram, setCram] = useState(initialCram)
  // Модалка онбординга поверх пустого экрана (слово / импорт).
  const [sheet, setSheet] = useState<OnboardingSheet>(null)

  // Счётчик перезагрузок: колода записывается прямо на этом экране (стартовая
  // или через модалки), и после неё данные надо перечитать (иначе «0 слов»).
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((n) => n + 1), [])

  useEffect(() => {
    let active = true
    Promise.all([repo.listFolders(), repo.listNotes(), repo.listCards()]).then(
      ([folders, notes, cards]) => {
        if (active) setData({ folders, notes, cards })
      },
    )
    return () => {
      active = false
    }
  }, [repo, reloadKey])

  const stats = useMemo<FolderStat[]>(() => {
    if (!data) return []
    const now = Date.now()
    const folderByNote = new Map(data.notes.map((n) => [n.id, n.folder_id]))
    const active = data.cards.filter((c) => !c.suspended)

    const countFor = (match: (folderId: string | null) => boolean) => {
      let noteCount = 0
      let dueCount = 0
      let newCount = 0
      const seenNotes = new Set<string>()
      for (const c of active) {
        const fid = folderByNote.get(c.note_id) ?? null
        if (!match(fid)) continue
        if (!seenNotes.has(c.note_id)) {
          seenNotes.add(c.note_id)
          noteCount++
        }
        if (c.state === State.New) newCount++
        else if (new Date(c.due).getTime() <= now) dueCount++
      }
      return { noteCount, dueCount, newCount }
    }

    const noFolderStat = { folder: null, noFolder: true, ...countFor((fid) => fid === null) }

    return [
      { folder: null, ...countFor(() => true) },
      ...data.folders.map((folder) => ({
        folder,
        ...countFor((fid) => fid === folder.id),
      })),
      // Строка «Без папки» - только если такие слова есть (иначе не показываем).
      ...(noFolderStat.noteCount > 0 ? [noFolderStat] : []),
    ]
  }, [data])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const start = () => onStart({ folderIds: selected.size ? [...selected] : null, cram })

  if (!data) return <StudySetupSkeleton />

  // Совсем пустой аккаунт: учить нечего в принципе. Вместо экрана выбора с
  // «мёртвой» кнопкой «Начать» (она уводила бы на «На сегодня всё, возвращайтесь
  // позже» - обман для того, кто ещё не добавил ни слова) - онбординг к двум
  // реальным способам наполнить колоду.
  if (data.notes.length === 0) {
    return (
      <>
        <EmptyState
          title="Соберите первую колоду"
          description="Достаточно 10 слов, чтобы запустить интервальные повторения."
          // Модалки открываются прямо здесь, без ухода в Библиотеку: онбординг
          // не должен телепортировать в другой раздел. Записали - перечитываем
          // свои данные, и экран сам сменится на обычный выбор области.
          onAddWord={() => setSheet('note')}
          onImport={() => setSheet('import')}
          onInstalled={reload}
        />
        <OnboardingSheets
          open={sheet}
          folders={data.folders}
          onClose={() => setSheet(null)}
          onChanged={reload}
        />
      </>
    )
  }

  // Выбираемые строки: настоящие папки + «Без папки». Первый элемент stats -
  // сводный бакет «все» (folder: null, без noFolder), его в список не берём.
  const folderStats = stats.filter((s) => s.folder !== null || s.noFolder)
  const allStat = stats[0]

  return (
    <div className="mx-auto flex h-full w-full max-w-[560px] flex-col px-5 py-7 lg:py-10">
      <h1 className="text-[26px] font-extrabold text-ink lg:text-[30px]">Что учим?</h1>
      <p className="mt-1.5 text-[14.5px] text-faint">Выберите папки или учите всё.</p>

      {/* Режим. Подпись - под переключателем, а не на кнопках: на мобайле в
          пилюлю не влезает ничего длиннее одного слова. */}
      <div className="mt-6 flex gap-2 rounded-[14px] bg-rail p-1">
        {[
          { key: false, label: 'Изучение' },
          { key: true, label: 'Повторение' },
        ].map(({ key, label }) => (
          <button
            key={String(key)}
            type="button"
            onClick={() => setCram(key)}
            aria-pressed={cram === key}
            className={`flex-1 cursor-pointer rounded-[11px] py-2.5 text-[13.5px] font-bold transition-colors ${
              cram === key ? 'bg-card text-ink shadow-card' : 'text-faint'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 px-1 text-[13px] leading-snug text-faint-2">
        {cram
          ? 'Прогон всей папки в любой момент. Прогресс не меняется.'
          : 'Новые слова и те, которым подошёл срок. Двигает прогресс.'}
      </p>

      {/* Папки */}
      <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
        <p className="mb-2 px-1 text-[12px] font-extrabold tracking-[0.06em] text-label uppercase">
          Папки {selected.size === 0 ? '· все' : null}
        </p>
        <motion.div
          className="flex flex-col gap-1.5"
          variants={listContainer}
          initial="hidden"
          animate="visible"
        >
          {folderStats.length === 0 && (
            <p className="px-1 py-4 text-[14px] text-faint">
              Папок пока нет - {allStat?.noteCount ?? 0}{' '}
              {plural(allStat?.noteCount ?? 0, 'слово', 'слова', 'слов')} без папки.
            </p>
          )}
          {folderStats.map((s) => {
            // «Без папки» - псевдо-строка с id-сентинелом; у настоящей папки свой id.
            const id = s.noFolder ? NO_FOLDER : s.folder!.id
            const name = s.noFolder ? 'Без папки' : s.folder!.name
            const on = selected.has(id)
            return (
              <motion.button
                key={id}
                type="button"
                variants={listItem}
                onClick={() => toggle(id)}
                aria-pressed={on}
                className={`flex cursor-pointer items-center gap-3 rounded-[14px] border px-4 py-3 text-left transition-colors ${
                  on ? 'border-brand bg-brand-soft' : 'border-line bg-card hover:bg-rail'
                }`}
              >
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                    on ? 'border-brand bg-brand text-white' : 'border-line'
                  }`}
                >
                  {on && <CheckIcon className="size-3" />}
                </span>
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: s.noFolder ? FOLDER_GRAY : folderDotColor(s.folder!.color) }}
                />
                <span
                  className={`flex-1 truncate text-[15px] font-bold ${s.noFolder ? 'text-muted-2 italic' : 'text-ink'}`}
                >
                  {name}
                </span>
                <span className="shrink-0 text-[13px] text-faint-2">
                  {cram
                    ? `${s.noteCount} ${plural(s.noteCount, 'слово', 'слова', 'слов')}`
                    : s.dueCount + s.newCount > 0
                      ? `${s.dueCount + s.newCount} к изучению`
                      : 'на сегодня всё'}
                </span>
              </motion.button>
            )
          })}
        </motion.div>
      </div>

      <button
        type="button"
        onClick={start}
        className="mt-5 w-full cursor-pointer rounded-[16px] bg-brand px-4 py-4 text-[15px] font-extrabold text-white shadow-fab"
      >
        {cram ? 'Начать повторение' : 'Начать изучение'}
      </button>
    </div>
  )
}
