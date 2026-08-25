import { useCallback, useMemo, useRef, useState } from 'react'
import { useRepo } from '@/data/useRepo'
import { useSpeechContext } from '@/speech/useSpeechContext'
import { importDeck } from '@/supabase/functions'
import { DeckParseError, parseDeck, type Deck } from '@/transfer/deck'
import { buildPlan, type ImportPlan } from '@/transfer/plan'

/**
 * Поток импорта колоды: файл → разбор → превью → запись.
 *
 * Словарь здесь больше не опрашивается. Раньше между разбором и превью стояло
 * «обогащение»: колода из 50 слов означала 50 запросов в Datamuse с телефона,
 * и импорт заметно ждал. Теперь транскрипции дотягивает `import-deck` на
 * сервере - вместе с записью и прогревом озвучки, за один запрос. Превью
 * строится из самого файла: слово, перевод, тип и дубликаты видны и без
 * словаря, а транскрипция появляется в библиотеке после импорта.
 */

export interface ImportFile {
  name: string
  size: number
}

export type ImportStage = { kind: 'idle' } | { kind: 'ready' } | { kind: 'importing' }

/** Исход `run()`: сколько создано и сколько пропущено (дубликаты + убранные). */
export interface ImportResult {
  ok: boolean
  created: number
  skipped: number
}

export function useImport() {
  const repo = useRepo()
  // Регион и скорость нужны серверу, чтобы синтезировать озвучку тем же
  // голосом и с тем же ключом кэша, что попросит клиент при показе карточки.
  const { audioRegion, rate } = useSpeechContext()
  const [file, setFile] = useState<ImportFile | null>(null)
  const [deck, setDeck] = useState<Deck | null>(null)
  const [stage, setStage] = useState<ImportStage>({ kind: 'idle' })
  const [error, setError] = useState<string | null>(null)

  // Гейт от двойного клика по «Импортировать»: `setStage` асинхронен, и до
  // ре-рендера кнопка ещё активна - без флага быстрый повторный клик записал бы
  // заметки дважды.
  const running = useRef(false)

  /**
   * Куда импортируем: id существующей папки или null (ещё не выбрана).
   *
   * Новую папку здесь не заводим - её создаёт окно папки (имя + цвет), то же
   * самое, что открывается из формы слова, и возвращает сюда готовый id.
   */
  const [folderId, setFolderId] = useState<string | null>(null)
  const [existing, setExisting] = useState<Awaited<ReturnType<typeof repo.listNotes>>>([])
  // Индексы строк, убранных пользователем из превью (можно вернуть).
  const [excluded, setExcluded] = useState<ReadonlySet<number>>(() => new Set())

  /**
   * Имя папки из колоды, которого ещё нет среди существующих (§4). Панель
   * подставляет его заготовкой в окно создания папки - чтобы имя из файла не
   * пришлось перенабирать руками. Пустая строка = колода без папки либо папка
   * уже существует (тогда она просто выбрана).
   */
  const [suggestedFolderName, setSuggestedFolderName] = useState('')

  /** Убрать строку из импорта или вернуть её (по индексу в превью). */
  const toggleExclude = useCallback((index: number) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  const reset = useCallback(() => {
    running.current = false
    setFile(null)
    setDeck(null)
    setStage({ kind: 'idle' })
    setError(null)
    setFolderId(null)
    setSuggestedFolderName('')
    setExcluded(new Set())
  }, [])

  /**
   * Общий хвост загрузки: разбор → дубликаты → превью. Источник (файл или
   * вставленный текст) отличается только тем, откуда взялась строка и как
   * назвать ошибку разбора, - дальше поток один.
   */
  const ingest = useCallback(
    async (text: string, failMessage: string) => {
      let parsed: Deck
      try {
        parsed = parseDeck(text)
      } catch (e) {
        setError(e instanceof DeckParseError ? e.message : failMessage)
        return
      }

      setDeck(parsed)
      // Заметки нужны для поиска дубликатов - берём один раз на импорт.
      //
      // Осознанно `listNotes` (без удалённых), а не `exportAll`: слово, которое
      // пользователь сам удалил, должно импортироваться заново, иначе колода
      // молча приедет неполной, и причину не найти. Уникальности (folder_id,
      // front) в схеме §3 нет, так что рассинхрона с Supabase это не создаёт:
      // рядом просто окажется живая заметка и её «надгробие».
      const [notes, folders] = await Promise.all([repo.listNotes(), repo.listFolders()])
      setExisting(notes)

      // Папка из файла (§4) назначается сама: имя в колоде уже есть, и
      // заставлять выбирать его руками - лишний шаг на каждом импорте.
      // Совпало с существующей папкой - выбираем её (дозаливка колоды
      // частями); не совпало - имя уходит заготовкой в окно создания папки.
      // Пользователь всё равно может переопределить выбор.
      const deckFolder = parsed.folder?.trim() ?? ''
      const match = deckFolder
        ? folders.find((f) => f.name.toLowerCase() === deckFolder.toLowerCase())
        : undefined
      setFolderId(match?.id ?? null)
      setSuggestedFolderName(match ? '' : deckFolder)

      setStage({ kind: 'ready' })
    },
    [repo],
  )

  const load = useCallback(
    async (picked: File) => {
      reset()
      setFile({ name: picked.name, size: picked.size })
      await ingest(await picked.text(), 'Не удалось прочитать файл')
    },
    [ingest, reset],
  )

  /**
   * Колода из вставленного текста (буфер обмена) - тот же поток, что и файл, но
   * без `File`. `file` остаётся null: показывать «0 КБ» для вставки незачем,
   * панель ориентируется на `deck`.
   */
  const loadText = useCallback(
    async (text: string) => {
      reset()
      await ingest(text, 'Не удалось разобрать JSON')
    },
    [ingest, reset],
  )

  const plan: ImportPlan | null = useMemo(
    () => (deck ? buildPlan(deck.notes, existing, folderId, excluded) : null),
    [deck, existing, folderId, excluded],
  )

  const run = useCallback(async (): Promise<ImportResult> => {
    if (!plan || plan.willImport === 0 || running.current) {
      return { ok: false, created: 0, skipped: 0 }
    }
    running.current = true
    setStage({ kind: 'importing' })
    // Пропущено = только дубликаты: их отсеяли автоматически, и об этом стоит
    // сообщить. Убранные вручную пользователь и так видел - молчим о них.
    const skipped = plan.duplicates
    try {
      // Папка к этому моменту уже существует: её либо выбрали из списка, либо
      // завели через окно папки, которое вернуло сюда готовый id.
      //
      // Дубликаты сервер считает заново - и это не дублирование превью, а
      // защита от расхождения: между показом превью и нажатием кнопки колоду
      // могли залить со второго устройства. Его `skipped` и берём за истину.
      const result = await importDeck(
        plan.rows.filter((r) => !r.duplicate && !r.excluded).map((r) => r.note),
        folderId,
        audioRegion,
        rate,
      )
      return { ok: true, created: result.created, skipped: Math.max(skipped, result.skipped) }
    } catch {
      setError('Не удалось записать заметки')
      setStage({ kind: 'ready' })
      return { ok: false, created: 0, skipped }
    } finally {
      running.current = false
    }
  }, [plan, folderId, audioRegion, rate])

  return {
    file,
    deck,
    plan,
    stage,
    error,
    folderId,
    setFolderId,
    suggestedFolderName,
    toggleExclude,
    load,
    loadText,
    run,
    reset,
  }
}
