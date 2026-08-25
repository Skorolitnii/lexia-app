import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { State } from 'ts-fsrs'
import type { CardRow, FolderRow, NoteRow } from '@/types'
import type { NotePageQuery } from '@/data/repo'
import { useRepo } from '@/data/useRepo'

/** Сколько заметок тянем за одну страницу списка. */
const PAGE_SIZE = 50

/** Заметка + агрегаты по её карточкам (для списка и фильтров). */
export interface NoteItem {
  note: NoteRow
  /** Ближайший срок среди карточек заметки; null - карточек нет. */
  due: Date | null
  /** Все карточки заметки ещё не изучались. */
  isNew: boolean
  cardCount: number
}

/** Папка + счётчик заметок. */
export interface FolderItem {
  folder: FolderRow | null
  noteCount: number
}

export interface Library {
  /** Первичная загрузка (папки/счётчики/первая страница ещё не пришли). */
  loading: boolean
  folders: FolderItem[]
  /** Загруженные заметки текущей области - постранично, уже с бейджами срока. */
  notes: NoteItem[]
  /** Есть ли ещё страницы под текущими фильтрами. */
  hasMore: boolean
  /** Идёт подгрузка следующей страницы (для спиннера внизу списка). */
  loadingMore: boolean
  /** Данные не прочитались - экран предлагает повтор вместо вечного скелетона. */
  error: boolean
  /** Подгрузить следующую страницу (бесконечный скролл). */
  loadMore: () => void
  /** Всего заметок в текущей области - для счётчика в заголовке. */
  totalInFolder: number
  /** Всего заметок во всём аккаунте - для онбординга «здесь пока пусто». */
  totalNotes: number
  /** Точка отсчёта сроков; общая для всех бейджей, чтобы список не «дрожал». */
  now: Date
  /** Перечитать всё с первой страницы (после правки/удаления/импорта). */
  reload: () => void
  /**
   * Перечитать только папки и счётчики, не трогая список слов. Нужен, когда
   * папку завели из модалки поверх списка: полный `reload` сбросил бы страницы
   * на первую, и список под модалкой перерисовался бы целиком - хотя слова
   * не менялись.
   */
  reloadFolders: () => void
}

export type TypeFilter = 'all' | 'basic' | 'cloze'

/** `null` - «Все слова» (папка не выбрана). */
export type FolderScope = string | null

/** Свести карточки заметки к бейджу срока (ближайший due, «новизна»). */
function toItem(note: NoteRow, cards: CardRow[]): NoteItem {
  const active = cards.filter((c) => !c.suspended)
  const soonest = active.reduce<Date | null>((min, c) => {
    const due = new Date(c.due)
    return !min || due < min ? due : min
  }, null)
  return {
    note,
    due: soonest,
    isNew: active.length > 0 && active.every((c) => c.state === State.New),
    cardCount: active.length,
  }
}

export function useLibrary(
  folderScope: FolderScope,
  search: string,
  typeFilter: TypeFilter,
): Library {
  const repo = useRepo()

  // Метаданные области: счётчики папок, момент отсчёта сроков. Живут отдельно от
  // страниц списка - меняются реже (смена папки, reload), а не при каждой
  // подгрузке.
  const [meta, setMeta] = useState<{
    folders: FolderItem[]
    totalNotes: number
    loadedAt: number
  } | null>(null)

  // Аккумулятор страниц. `items` растёт по мере скролла; `done` - страниц
  // больше нет. `loading` относится к первой странице набора.
  const [pages, setPages] = useState<{
    items: NoteItem[]
    done: boolean
    loading: boolean
    loadingMore: boolean
    /** Страница не пришла (нет сети при серверном хранилище / отказ БД). */
    error: boolean
  }>({ items: [], done: false, loading: true, loadingMore: false, error: false })

  // Отказ чтения папок/счётчиков - отдельно от страниц: у них свой ключ
  // перезагрузки, и упасть они могут независимо.
  const [metaError, setMetaError] = useState(false)

  const [reloadKey, setReloadKey] = useState(0)
  // Отдельный ключ для папок: он двигается и сам по себе (`reloadFolders`), и
  // вместе с общим `reload`. Список слов на него НЕ подписан - иначе создание
  // папки перечитывало бы всю ленту.
  const [folderKey, setFolderKey] = useState(0)
  const reload = useCallback(() => {
    setReloadKey((k) => k + 1)
    setFolderKey((k) => k + 1)
  }, [])
  const reloadFolders = useCallback(() => setFolderKey((k) => k + 1), [])

  // Метаданные области: перечитываем при смене папки или reload, но НЕ при
  // печати в поиске (счётчик папок от поиска не зависит).
  useEffect(() => {
    let active = true
    Promise.all([repo.listFolders(), repo.folderNoteCounts()])
      .then(([folders, counts]) => {
        if (!active) return
        const countOf = (id: string | null) => counts.find((c) => c.folderId === id)?.count ?? 0
        setMeta({
          folders: [
            { folder: null, noteCount: countOf(null) },
            ...folders.map((folder) => ({ folder, noteCount: countOf(folder.id) })),
          ],
          totalNotes: countOf(null),
          loadedAt: Date.now(),
        })
        // Успех после неудачи (повтор по кнопке) снимает прежнюю ошибку.
        setMetaError(false)
      })
      // Без catch отказ чтения папок держал бы `meta === null`, то есть
      // `loading` навсегда - страницы при этом могли уже прийти.
      .catch(() => {
        if (active) setMetaError(true)
      })
    return () => {
      active = false
    }
  }, [repo, folderScope, folderKey])

  // Ключ фильтров: при его смене набор страниц сбрасывается на первую.
  // `search` внутри - вызывающий уже применил debounce (см. LibraryPage).
  const filterKey = `${folderScope ?? ''}|${search}|${typeFilter}`

  // Токен последнего запроса: ответ устаревшей выборки (сменили фильтр, пока
  // грузилась страница) не должен перезаписать актуальную. Инкрементим на
  // каждый старт, при разрешении сверяемся - чужой ответ отбрасываем.
  const reqId = useRef(0)
  // Гейт от двойного запроса - синхронный ref, а не флаг `loadingMore` в state:
  // state обновляется асинхронно, и два `loadMore` подряд (StrictMode дважды
  // монтирует эффекты; сентинел может дёрнуться до ре-рендера) оба увидели бы
  // `loadingMore === false` и ушли бы дублем на тот же offset. Ref встаёт сразу.
  // Тот же приём, что `writing`/`running`/`busy` в других местах проекта.
  const inFlight = useRef(false)

  const fetchPage = useCallback(
    async (offset: number, replace: boolean) => {
      // replace (смена фильтров) главнее дозагрузки: он обязан пройти, даже если
      // в полёте была подгрузка - её ответ отсечёт reqId. Дозагрузку же, пока
      // идёт другой запрос, просто пропускаем - иначе дубль страницы.
      if (inFlight.current && !replace) return
      inFlight.current = true
      const id = ++reqId.current
      // На replace сразу чистим список: иначе на экране мигают строки прежней
      // папки, пока идёт запрос. На дозагрузке items не трогаем.
      setPages((p) => ({
        items: replace ? [] : p.items,
        done: false,
        loading: replace,
        loadingMore: !replace,
        error: false,
      }))
      const query: NotePageQuery = {
        folderId: folderScope,
        search,
        type: typeFilter,
        offset,
        limit: PAGE_SIZE,
      }
      try {
        const rows = await repo.listNotesPage(query)
        const cards = await repo.listCardsForNotes(rows.map((r) => r.id))
        if (id !== reqId.current) return // устаревший ответ - его сменил новый запрос
        const byNote = new Map<string, CardRow[]>()
        for (const c of cards) {
          const list = byNote.get(c.note_id)
          if (list) list.push(c)
          else byNote.set(c.note_id, [c])
        }
        const items = rows.map((r) => toItem(r, byNote.get(r.id) ?? []))
        setPages((prev) => ({
          items: replace ? items : [...prev.items, ...items],
          done: rows.length < PAGE_SIZE,
          loading: false,
          loadingMore: false,
          error: false,
        }))
      } catch {
        // Без этого отказ чтения оставлял бы скелетон навсегда: `finally` снимал
        // гейт, но `loading` в state так и не сбрасывался. Устаревший ответ
        // (сменили фильтр) гасим тем же токеном, что и успешный путь.
        if (id !== reqId.current) return
        // `done: true` останавливает бесконечный скролл: иначе сентинел остаётся
        // видимым и дёргает `loadMore` в цикле по мёртвой сети.
        setPages((prev) => ({
          items: prev.items,
          done: true,
          loading: false,
          loadingMore: false,
          error: true,
        }))
      } finally {
        // Снимаем гейт только для актуального запроса: у отсеянного устаревшего
        // (id !== reqId) флагом уже владеет новый - трогать его нельзя.
        if (id === reqId.current) inFlight.current = false
      }
    },
    [repo, folderScope, search, typeFilter],
  )

  // Смена фильтров (или reload) → первая страница заново. Это законная
  // синхронизация с внешним источником (репозиторием): при новых фильтрах надо
  // сходить за данными. filterKey покрывает folderScope/search/typeFilter;
  // reloadKey - ручной перезапрос. fetchPage меняется вместе с ними, но в deps
  // не нужен: filterKey уже описывает всё, от чего зависит запрос.
  useEffect(() => {
    // Запуск откладываем на микротаску: `fetchPage` первым делом переводит
    // список в состояние загрузки, и синхронный вызов из эффекта дал бы
    // каскадный рендер (react-hooks/set-state-in-effect). На UX это не влияет -
    // разрыв в один тик, а `reqId` внутри по-прежнему отсекает устаревшие
    // ответы, если фильтр сменился раньше, чем очередь дошла до вызова.
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) void fetchPage(0, true)
    })
    return () => {
      cancelled = true
    }
  }, [filterKey, reloadKey])

  const loadMore = useCallback(() => {
    setPages((p) => {
      if (p.done || p.loading || p.loadingMore) return p
      void fetchPage(p.items.length, false)
      return p
    })
  }, [fetchPage])

  const now = useMemo(() => new Date(meta?.loadedAt ?? 0), [meta?.loadedAt])

  const totalInFolder =
    meta?.folders.find((f) => (f.folder?.id ?? null) === folderScope)?.noteCount ?? 0

  const error = metaError || pages.error

  return {
    // При ошибке скелетон уступает место экрану с повтором - иначе страница
    // осталась бы в загрузке навсегда (`meta` так и не придёт).
    loading: !error && (meta === null || pages.loading),
    error,
    folders: meta?.folders ?? [],
    notes: pages.items,
    hasMore: !pages.done,
    loadingMore: pages.loadingMore,
    loadMore,
    totalInFolder,
    totalNotes: meta?.totalNotes ?? 0,
    now,
    reload,
    reloadFolders,
  }
}
