import { useEffect, useState } from 'react'
import type { FolderRow } from '@/types'
import { CheckIcon, CloseIcon, TrashIcon } from '@/components/icons'
import { Spinner } from '@/components/Loading'
import { TYPE_LABEL, fieldCls as field, labelCls } from '@/components/formStyles'
import { FolderPicker } from '@/library/FolderPicker'
import { cardsForDraft, dictionaryFields, lookupKey, type NoteDraft } from '@/library/draft'
import { useDictionary, type DictionaryState } from '@/dictionary/useDictionary'
import { topSenses, type Sense } from '@/dictionary/api'
import { plural } from '@/study/format'

/**
 * Статус словарного лукапа под полем слова. «Не найдено» и офлайн - это
 * не ошибки заполнения: карточка сохраняется и без транскрипции (§4).
 */
function DictionaryHint({ state, draft }: { state: DictionaryState; draft: NoteDraft }) {
  if (state.loading) {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-hint">
        <Spinner size={11} />
        Ищу в словаре…
      </p>
    )
  }
  if (state.notFound) {
    return (
      <p className="mt-1.5 text-[12.5px] text-faint">Нет в словаре - сохранится без транскрипции</p>
    )
  }
  if (state.failed) {
    return (
      <p className="mt-1.5 text-[12.5px] text-faint">
        Словарь недоступен - можно сохранить и без него
      </p>
    )
  }
  // Показываем только то, что принадлежит текущему слову: иначе от прежнего
  // остаётся чужая транскрипция (ловили на кириллице и на «слово → фраза»).
  // Бейджа «со звуком» здесь больше нет: озвучка есть у КАЖДОЙ заметки -
  // её синтезирует облако по тексту. Раньше он отмечал наличие живой записи
  // OneLook, которая была далеко не у всех слов.
  const { transcription } = dictionaryFields(draft)
  if (transcription) {
    return (
      <p className="mt-1.5 flex items-center gap-2 text-[12.5px] text-faint">
        <span className="font-mono text-hint">{transcription}</span>
      </p>
    )
  }
  return null
}

/**
 * Выбор значения у многозначного слова. Словарь не знает, какое значение ты
 * имел в виду (box - коробка или удар), поэтому показываем список и даём
 * подставить пример нужного, а не берём молча первый (§4).
 */
function SenseChooser({
  senses,
  activeDefinition,
  onPick,
}: {
  senses: Sense[]
  activeDefinition: string | null
  onPick: (sense: Sense) => void
}) {
  // Полный список - по кнопке: у `run` значений 122, и разворачивать их сразу
  // значит утопить форму в скролле.
  const [expanded, setExpanded] = useState(false)
  const top = topSenses(senses)
  const shown = expanded ? senses : top
  const hidden = senses.length - top.length

  if (senses.length < 2) return null
  return (
    <div className="mt-2 space-y-1">
      <span className="text-[12px] font-bold text-faint">
        Несколько значений - выберите нужное:
      </span>
      <div className="space-y-1">
        {shown.map((s) => {
          const active = s.definition === activeDefinition
          return (
            <button
              key={s.definition}
              type="button"
              aria-pressed={active}
              onClick={() => onPick(s)}
              className={`flex w-full flex-col gap-0.5 rounded-[10px] border px-2.5 py-2 text-left transition-colors ${
                active ? 'border-brand bg-brand/5' : 'border-line bg-card hover:border-hint'
              }`}
            >
              <span className="flex items-baseline gap-1.5">
                {s.partOfSpeech && (
                  <span className="text-[11px] font-bold text-brand-ink">{s.partOfSpeech}</span>
                )}
                <span className="line-clamp-1 text-[12.5px] text-muted">{s.definition}</span>
              </span>
            </button>
          )
        })}
      </div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="cursor-pointer text-[12px] font-bold text-brand-ink hover:underline"
        >
          {expanded
            ? 'Свернуть'
            : `Показать ещё ${hidden} ${plural(hidden, 'значение', 'значения', 'значений')}`}
        </button>
      )}
    </div>
  )
}

export function NoteForm({
  draft,
  folders,
  onChange,
  onApply,
  onSubmit,
  onCancel,
  onCreateFolder,
  onDelete,
  saving,
}: {
  draft: NoteDraft
  folders: FolderRow[]
  onChange: (draft: NoteDraft) => void
  /** Функциональное обновление - для подстановки из словаря вне рендера. */
  onApply: (update: (current: NoteDraft) => NoteDraft) => void
  onSubmit: () => void
  onCancel: () => void
  /**
   * Открыть окно создания папки поверх формы. Само окно и запись в репозиторий -
   * на стороне экрана-хозяина: там уже есть и `useRepo`, и перезагрузка списка.
   * Аргумент - набранное в поиске имя (заготовка).
   */
  onCreateFolder: (suggestedName: string) => void
  onDelete?: () => void
  saving: boolean
}) {
  const [showDetails, setShowDetails] = useState(draft.details.length > 0)
  // Подтверждение удаления - инлайн (как в `FolderEditor`), а не `window.confirm`:
  // тот выбивается из стиля и блокирует автоматизацию превью.
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Esc при открытом подтверждении отменяет ТОЛЬКО его. Слушатель `NoteSheet`
  // висит на window и закрыл бы всю форму - перехватываем на фазе capture
  // (она идёт до bubble, где слушает лист) и глушим дальнейшую доставку.
  // React-обработчик на плашке для этого не годится: синтетические события
  // привязаны к корню, и Esc, нажатый вне оверлея, до него просто не долетает.
  useEffect(() => {
    if (!confirmDelete) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      setConfirmDelete(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [confirmDelete])

  const set = <K extends keyof NoteDraft>(key: K, value: NoteDraft[K]) =>
    onChange({ ...draft, [key]: value })

  const { front } = draft
  const isCloze = draft.type === 'cloze'
  const clozeValid = !isCloze || /\{\{.+?\}\}/.test(front)
  // Папка обязательна. Новая создаётся сразу в своём окне, поэтому к моменту
  // сохранения заметки она уже существует и лежит в `folder_id`.
  const folderChosen = draft.folder_id !== null
  // Перевод обязателен: без него карточка не проверяема - на обороте forward
  // нечего показать, а у reverse (RU → EN) пустым окажется само лицо.
  // Словарь перевода не даёт (§4), поэтому это единственное поле, которое
  // всегда заполняется руками.
  const backFilled = draft.back.trim().length > 0
  const canSave = front.trim().length > 0 && clozeValid && backFilled && folderChosen && !saving

  const count = cardsForDraft(draft)

  // Строка над кнопкой: пока сохранить нельзя - называет недостающее (иначе
  // выключенная кнопка молчит о причине), потом - что именно создастся.
  // Порядок условий = порядок полей формы, чтобы подсказка вела сверху вниз.
  const folderName = folders.find((f) => f.id === draft.folder_id)?.name ?? ''
  let footerHint: string
  if (front.trim() === '') footerHint = isCloze ? 'Введите предложение' : 'Введите слово или фразу'
  else if (!clozeValid) footerHint = 'Отметьте пропуск в предложении'
  else if (!backFilled) footerHint = isCloze ? 'Введите перевод предложения' : 'Введите перевод'
  else if (!folderChosen) footerHint = 'Выберите папку'
  else
    footerHint =
      `Сохранит ${count} ${plural(count, 'карточку', 'карточки', 'карточек')} в «${folderName}»` +
      (!isCloze && draft.reverse ? ' - EN → RU и RU → EN' : '')

  // Словарь молчит для cloze и фраз - он знает только отдельные слова (§4).
  const dict = useDictionary(front, !isCloze)

  // Транскрипция и аудио - производные от слова, а не самостоятельные поля:
  // синхронизируем их с текущим лукапом, в том числе СБРАСЫВАЕМ, когда слово
  // сменилось или не нашлось. Иначе от прежнего слова остаётся чужая
  // транскрипция и «со звуком» (ловили на переходе hello → otter).
  //
  // Примеры сюда не входят: словарь их не отдаёт, они целиком ручные.
  //
  // Значение, выбранное КЛИКОМ. Дефолт (первое значение) не храним в состоянии:
  // он однозначно выводится из ответа словаря, а лишний setState в эффекте
  // гонял бы каскадный ререндер на каждый лукап.
  const [pickedDef, setPickedDef] = useState<string | null>(null)
  useEffect(() => {
    // Ждём окончательного ответа: на офлайне и до первого запроса у заметки,
    // открытой на редактирование, уже лежат свои транскрипция и аудио.
    if (!dict.resolved) return
    const found = dict.data

    onApply((current) => {
      const transcription = found?.transcription ?? null
      const audioUrl = found?.audioUrl ?? null
      // Привязываем подстановку к слову, по которому её получили.
      const lookupFor = lookupKey(current.front)

      if (
        current.transcription === transcription &&
        current.audio_url === audioUrl &&
        current.lookupFor === lookupFor
      ) {
        // Ничего не поменялось - прежний объект, чтобы не гонять лишний рендер.
        return current
      }

      // Примеры словарь не даёт - они остаются ручными и здесь не трогаются.
      return { ...current, transcription, audio_url: audioUrl, lookupFor }
    })
  }, [dict.data, dict.resolved, onApply])

  const senses = dict.data?.senses ?? []
  // Клик держится, только пока показывают то же слово: у нового значения
  // прежнего смысла нет, и подсветка возвращается на первое.
  const activeDef = senses.some((s) => s.definition === pickedDef)
    ? pickedDef
    : (senses[0]?.definition ?? null)

  // Выбор значения у многозначного слова (box - коробка / удар / самшит):
  // подсветить нужное. Примеры словарь не отдаёт, поэтому выбор значения
  // ничего в заметку не подставляет - он только помечает нужный смысл.
  const pickSense = (sense: Sense) => {
    setPickedDef(sense.definition)
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (canSave) onSubmit()
      }}
      className="relative flex min-h-0 flex-1 flex-col"
    >
      {/* Шапка и подвал не скроллятся - прокручивается только середина.
          В шапке только крест (макет v3): главное действие вверху ломало
          порядок чтения формы. Заголовок по центру модалки - боковые зоны
          равной ширины (min-w-0 flex-1), крест внутри shrink-0. Равные зоны
          держат заголовок ровно посередине, чего не даёт justify-between.
          На узком экране заголовок truncate - не налезет. */}
      <div className="flex shrink-0 items-center gap-2 px-5 pt-5 pb-3 lg:px-7 lg:pt-6">
        <div className="flex min-w-0 flex-1 justify-start">
          {/* Удаление - здесь, а не в конце формы: внизу до него надо было
              проскроллить больше половины полей, и красная кнопка во всю ширину
              вставала вплотную к «Сохранить». Иконка тише кнопки - вес по
              частоте: удаляют редко. Зона слева симметрична кресту справа. */}
          {onDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Удалить слово"
              title="Удалить слово"
              className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-card text-faint-2 shadow-pill transition-colors hover:bg-again-soft hover:text-again lg:bg-rail lg:shadow-none"
            >
              <TrashIcon className="size-4" />
            </button>
          )}
        </div>
        <span className="min-w-0 shrink-0 truncate text-center text-[15px] font-extrabold text-ink">
          {onDelete ? 'Редактирование' : 'Новое слово'}
        </span>
        <div className="flex min-w-0 flex-1 justify-end">
          <button
            type="button"
            onClick={onCancel}
            aria-label="Закрыть"
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-card text-faint-2 shadow-pill transition-colors hover:text-muted lg:bg-rail lg:shadow-none lg:hover:bg-rail-hover"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>
      </div>

      {/* Тип - первый шаг формы (макет v3): он меняет поля под собой, поэтому
          стоит над ними. Заголовка у секции нет - подписи вкладок говорят сами. */}
      <div className="shrink-0 px-5 pb-4 lg:px-7">
        <div className="flex gap-1 rounded-field bg-track p-1">
          {(['basic', 'cloze'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set('type', t)}
              className={`flex-1 cursor-pointer rounded-[10px] px-2 py-2.5 text-[13.5px] font-bold transition-colors ${
                draft.type === t ? 'bg-card text-ink shadow-card' : 'text-faint hover:text-muted'
              }`}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-6 lg:px-7">
        <div>
          <label htmlFor="note-front" className={labelCls}>
            {isCloze ? 'Предложение с пропуском' : 'Слово / фраза (EN)'}
          </label>
          <input
            id="note-front"
            value={draft.front}
            onChange={(e) => set('front', e.target.value)}
            placeholder={isCloze ? 'The fox is a {{cunning::хитрый}} animal.' : 'resilient'}
            className={field}
          />
          {isCloze && (
            <p className={`mt-1.5 text-[12.5px] ${clozeValid ? 'text-faint' : 'text-again'}`}>
              {clozeValid
                ? 'Пропуск: {{ответ}} или {{ответ::подсказка}}'
                : 'Нужен хотя бы один пропуск в двойных фигурных скобках'}
            </p>
          )}
          {!isCloze && <DictionaryHint state={dict} draft={draft} />}
          {!isCloze && dict.data && lookupKey(front) === draft.lookupFor && (
            <SenseChooser senses={senses} activeDefinition={activeDef} onPick={pickSense} />
          )}
        </div>

        <div>
          <label htmlFor="note-back" className={labelCls}>
            {isCloze ? 'Перевод предложения (RU)' : 'Перевод (RU)'}
          </label>
          <input
            id="note-back"
            value={draft.back}
            onChange={(e) => set('back', e.target.value)}
            placeholder={isCloze ? 'Лис - хитрый зверь.' : 'Перевод на русский'}
            className={field}
          />
        </div>

        <div>
          <span className={labelCls}>Папка</span>
          <FolderPicker
            folders={folders}
            folderId={draft.folder_id}
            onPick={(id) => onChange({ ...draft, folder_id: id })}
            onCreate={onCreateFolder}
          />
        </div>

        {/* Обратная карточка - только для basic: у cloze обратной нет (§3). */}
        {!isCloze && (
          <button
            type="button"
            onClick={() => set('reverse', !draft.reverse)}
            aria-pressed={draft.reverse}
            className="flex w-full cursor-pointer items-center gap-3 rounded-field border border-line bg-card px-3.5 py-3 text-left"
          >
            <span className="flex-1">
              <span className="block text-[14.5px] font-bold text-ink">Обратная карточка</span>
              <span className="block text-[12.5px] text-faint">RU → EN, своё расписание</span>
            </span>
            <span
              className={`relative h-6 w-11 shrink-0 rounded-pill transition-colors ${
                draft.reverse ? 'bg-brand' : 'bg-track'
              }`}
            >
              <span
                className={`absolute top-0.5 size-5 rounded-full bg-card shadow-card transition-[left] ${
                  draft.reverse ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </span>
          </button>
        )}

        <div>
          <span className={labelCls}>Примеры</span>
          <div className="space-y-2">
            {draft.examples.map((ex, i) => (
              <div key={i} className="rounded-field border border-line bg-card p-2.5">
                <div className="flex items-start gap-2">
                  <div className="flex-1 space-y-1.5">
                    <input
                      value={ex.text}
                      onChange={(e) => {
                        const next = [...draft.examples]
                        next[i] = { ...ex, text: e.target.value }
                        set('examples', next)
                      }}
                      placeholder="She remained resilient despite the setbacks."
                      aria-label={`Пример ${i + 1}`}
                      className="w-full bg-transparent text-[14.5px] text-ink outline-none placeholder:text-hint"
                    />
                    <input
                      value={ex.translation ?? ''}
                      onChange={(e) => {
                        const next = [...draft.examples]
                        next[i] = { ...ex, translation: e.target.value }
                        set('examples', next)
                      }}
                      placeholder="Перевод примера"
                      aria-label={`Перевод примера ${i + 1}`}
                      className="w-full bg-transparent text-[13.5px] text-faint-2 outline-none placeholder:text-hint"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      set(
                        'examples',
                        draft.examples.filter((_, j) => j !== i),
                      )
                    }
                    aria-label={`Удалить пример ${i + 1}`}
                    className="cursor-pointer p-1 text-faint-2 hover:text-again"
                  >
                    <CloseIcon className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => set('examples', [...draft.examples, { text: '' }])}
            className="mt-2 cursor-pointer text-[13.5px] font-bold text-brand-ink"
          >
            + Добавить пример
          </button>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
            className="flex w-full cursor-pointer items-center justify-between py-1"
          >
            <span className={`${labelCls} mb-0`}>Подробнее · Markdown</span>
            <span className="text-faint-2">{showDetails ? '▴' : '▾'}</span>
          </button>
          {showDetails && (
            <textarea
              value={draft.details}
              onChange={(e) => set('details', e.target.value)}
              rows={5}
              placeholder="**Часть речи:** прилагательное"
              aria-label="Подробнее"
              className={`${field} mt-1.5 resize-y font-mono text-[13px]`}
            />
          )}
        </div>
      </div>

      {/* Подвал (макет v3): единственное «Сохранить» - на всю ширину, и на
          мобайле, и на десктопе. Строка итога над кнопкой называет, что
          получится, а когда чего-то не хватает - чего именно: в конце длинной
          прокрутки это сообщение терялось. */}
      <div className="shrink-0 border-t border-line bg-surface px-5 pt-3 pb-5 lg:px-7 lg:pb-6">
        <p className="mb-2.5 text-[12.5px] font-semibold text-faint">{footerHint}</p>
        <button
          type="submit"
          disabled={!canSave}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-field bg-brand py-3.5 text-[15px] font-extrabold text-white shadow-brand transition-opacity disabled:cursor-default disabled:bg-track disabled:text-faint-2 disabled:shadow-none"
        >
          {/* Спиннер занимает место галочки, а не встаёт рядом: иначе кнопка
              на время сохранения меняет ширину содержимого и дёргает подвал. */}
          {saving ? <Spinner size={17} /> : <CheckIcon className="size-4" />}
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </div>

      {/* Подтверждение удаления - плашкой по центру поверх всей формы, а не
          в конце скролла: раньше диалог появлялся там, где его не видно.
          Лежит на уровне <form>, поэтому не обрезается `overflow-y-auto`
          середины. Удаление необратимо (слово + карточки + прогресс FSRS),
          поэтому подтверждение обязательно. */}
      {onDelete && confirmDelete && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink/25 px-6">
          <div className="w-full max-w-[340px] rounded-card bg-card p-5 shadow-phone">
            <p className="text-[15px] font-extrabold text-ink">Удалить слово?</p>
            <p className="mt-1.5 text-[13px] leading-snug text-faint">
              Вместе с карточками и прогрессом повторений. Отменить будет нельзя.
            </p>
            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={saving}
                className="flex-1 cursor-pointer rounded-field bg-track py-2.5 text-[13.5px] font-bold text-muted disabled:opacity-40"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={saving}
                className="flex-1 cursor-pointer rounded-field bg-again py-2.5 text-[13.5px] font-extrabold text-white hover:opacity-90 disabled:opacity-40"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}
