import { useEffect } from 'react'
import { motion } from 'motion/react'
import { useNavigate, useSearchParams } from 'react-router'
import { CloseIcon, UndoIcon } from '@/components/icons'
import { LoadError } from '@/components/LoadError'
import { LoadingScreen } from '@/components/Loading'
import type { Scope } from '@/data/queue'
import type { Direction, NoteRow } from '@/types'
import { autoplayText } from '@/study/autoplay'
import { cardSpeakSource } from '@/speech/audioSource'
import { RatingBar } from '@/study/RatingBar'
import { CramBar } from '@/study/CramBar'
import { SessionSummary } from '@/study/SessionSummary'
import { StudyCard } from '@/study/StudyCard'
import { StudySetup } from '@/study/StudySetup'
import { plural } from '@/study/format'
import { useStudyHotkeys } from '@/study/useStudyHotkeys'
import { useStudySession } from '@/study/useStudySession'
import { useSpeechContext } from '@/speech/useSpeechContext'

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div
      className="mb-6 h-[5px] overflow-hidden rounded-[3px] bg-line"
      role="progressbar"
      aria-valuenow={done}
      aria-valuemax={total}
    >
      <div
        className="h-full rounded-[3px] bg-brand transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/**
 * Область изучения кодируется в URL: `folder` (можно несколько) задаёт папки,
 * `cram=1` - режим тренировки, `go=1` - сессия запущена (иначе показываем выбор).
 * URL-источник нужен, чтобы «Учить папку» из библиотеки открывало нужную область
 * без общего состояния.
 */
/** Сколько примеров следующей карточки греем заранее. */
const PREFETCH_EXAMPLES = 2

export function StudyPage() {
  const [params, setParams] = useSearchParams()
  const started = params.get('go') === '1'

  if (!started) {
    return (
      <StudySetup
        initialFolderId={params.get('folder')}
        initialCram={params.get('cram') === '1'}
        onStart={({ folderIds, cram }) => {
          const next = new URLSearchParams()
          folderIds?.forEach((id) => next.append('folder', id))
          if (cram) next.set('cram', '1')
          next.set('go', '1')
          setParams(next)
        }}
      />
    )
  }

  const folderIds = params.getAll('folder')
  const scope: Scope = folderIds.length ? { kind: 'folders', folderIds } : { kind: 'all' }
  const cram = params.get('cram') === '1'

  // key: смена области/режима пересобирает сессию с нуля (хук читает scope
  // только при монтировании).
  return <StudySession key={params.toString()} scope={scope} cram={cram} />
}

function StudySession({ scope, cram }: { scope: Scope; cram: boolean }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const session = useStudySession(scope, cram)
  const { current, next, revealed, reveal, rate, undo, canUndo, options, done, counts } = session
  const { play, prefetch, autoplay } = useSpeechContext()

  // Выход из сессии возвращает на экран выбора (снимаем go), а не в библиотеку -
  // так проще выбрать другую папку. Крестик/Esc = «завершить».
  // Снимаем только `go`: `folder` и `cram` остаются, и экран выбора открывается
  // с тем же режимом и папкой. Раньше здесь стоял `setParams({})`, и выход из
  // «Повторения» молча возвращал в «Изучение».
  const exit = () => {
    const next = new URLSearchParams(params)
    next.delete('go')
    setParams(next)
  }
  const goLibrary = () => void navigate('/library')

  const cardId = current?.card.id
  const direction = current?.card.direction
  const front = current?.note.front
  // Озвучка идёт тем же путём, что и кнопка на карточке: единственный источник -
  // облако (§6). `autoplayText` решает, КОГДА играть, `cardSpeakSource` - ЧЕМ.

  // Автоплей лица новой карточки: играем то, что `autoplayText` разрешает для
  // ЛИЦА (revealed:false) - это только forward (EN-слово). У reverse лицо русское,
  // у cloze - предложение с пропусками (озвучка выдала бы ответ), поэтому там null.
  // Зависимость по `card.id`: озвучиваем при СМЕНЕ карточки, а не на reveal/undo.
  useEffect(() => {
    if (!front) return
    const text = autoplayText({ autoplay, direction, front, revealed: false })
    // `gesture: false` - это не клик: при промахе облачного кэша лучше
    // промолчать, чем озвучить роботом (см. `useSpeech.play`).
    if (text !== null) play({ url: null, text, cloud: true }, { gesture: false })
  }, [cardId, direction, front, autoplay, play])

  // Автоплей оборота: играем то, что `autoplayText` разрешает для ОБОРОТА
  // (revealed:true) - это reverse (EN-слово появляется на обороте) и cloze
  // (предложение целиком, уже без секрета). Эффект срабатывает по `revealed`;
  // undo (revealed→false) ничего не играет, т.к. ниже гейт `if (revealed)`.
  useEffect(() => {
    if (!front || !revealed) return
    const text = autoplayText({ autoplay, direction, front, revealed: true })
    if (text !== null) play({ url: null, text, cloud: true }, { gesture: false })
  }, [cardId, direction, front, autoplay, revealed, play])

  // Прогрев озвучки следующей карточки, пока пользователь смотрит текущую.
  // Синтез в облаке занимает секунды, и без этого каждая новая фраза
  // встречала бы лоадером; к моменту показа файл уже лежит в кэше.
  //
  // Расход символов Azure не растёт: греем ровно то, что пользователь и так
  // увидит через несколько секунд, а синтез каждой фразы платный только
  // однажды. Прогревать всю колоду наперёд нельзя - это сожгло бы квоту на
  // карточках, которые могут не открыться.
  // Греем и ТЕКУЩУЮ карточку, и следующую. Только следующей мало: в начале
  // сессии первая карточка оказывалась холодной - её примеры встречали
  // лоадером, потому что прогрев смотрел лишь на `queue[1]`.
  const warmNote = current?.note
  const warmDirection = current?.card.direction
  const nextNote = next?.note
  const nextDirection = next?.card.direction
  useEffect(() => {
    const warm = (note: NoteRow | undefined, dir: Direction | undefined) => {
      if (!note || !dir) return
      prefetch(cardSpeakSource(note, dir))
      // Примеры озвучиваются той же кнопкой на обороте - их тоже греем, но
      // только первые: у иных заметок примеров полдесятка, а слушают обычно
      // один-два, и синтез остальных ушёл бы в квоту впустую.
      for (const example of note.examples.slice(0, PREFETCH_EXAMPLES)) {
        prefetch({ url: null, text: example.text, cloud: true })
      }
    }
    warm(warmNote, warmDirection)
    warm(nextNote, nextDirection)
  }, [warmNote, warmDirection, nextNote, nextDirection, prefetch])

  useStudyHotkeys({
    revealed,
    reveal,
    rate,
    undo,
    exit,
    enabled: !!current,
    cram,
  })

  // Спиннер, а не скелетон карточки: плейсхолдер в форме карточки на долю
  // секунды читался бы как «слово уже показали», а весь экран - ровно про то,
  // чтобы слово появилось в нужный момент.
  if (session.loading) return <LoadingScreen label="Собираю очередь…" />

  // Очередь не собралась - предлагаем повтор, а не пустой экран «всё выучено»:
  // молчаливый ноль здесь читался бы как «повторять нечего».
  if (session.error) {
    return (
      <div className="flex h-full flex-col px-5 pt-5 pb-6 lg:px-8">
        <LoadError what="карточки" onRetry={session.restart} />
      </div>
    )
  }

  if (session.finished) {
    return (
      <SessionSummary
        stats={session.stats}
        folderName={session.folderName}
        outlook={session.outlook}
        onHome={goLibrary}
        onStudyMore={session.studyMore}
        // Прогон без расписания той же области: cram живёт в URL, а `key` на
        // сессии пересоберёт её под новый режим.
        onCram={() => {
          const next = new URLSearchParams(params)
          next.set('cram', '1')
          setParams(next)
        }}
      />
    )
  }

  if (!current) return null

  const total = done + counts.total
  // Ярлык области: одна папка - её имя, несколько - счётчик, иначе «все».
  const scopeLabel =
    scope.kind === 'folders'
      ? scope.folderIds.length === 1
        ? (session.folderName ?? 'Без папки')
        : `${scope.folderIds.length} ${plural(scope.folderIds.length, 'папка', 'папки', 'папок')}`
      : 'Все папки'

  return (
    <div className="flex h-full flex-col px-5 pt-5 pb-6 lg:px-8 lg:pt-6 lg:pb-7">
      {/* Топбар: мобайл - крестик/папка/undo; десктоп - папка слева, действия справа.
          Мобайл: боковые зоны равной ширины (min-w-0 flex-1) держат пилюлю папки
          ровно по центру при разной ширине крестика и «Назад» - justify-between
          этого не даёт. На lg зоны сбрасываются (flex-none) и работает
          justify-between: папка слева, действия справа. */}
      <div className="mb-4 flex items-center gap-2 lg:mb-2 lg:justify-between lg:gap-0">
        {/* На десктопе зона пустая (крестик там скрыт), но в `space-between`
            она всё равно считается третьим элементом - и заголовок оказывался
            посередине между ней и кнопками, а не у левого края. `lg:hidden`
            убирает её из раскладки. */}
        <div className="flex shrink-0 grow basis-0 justify-start lg:hidden">
          <button
            type="button"
            onClick={exit}
            aria-label="Завершить сессию"
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-card text-faint-2 shadow-pill lg:hidden"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        {/* Пилюля обязана сжиматься: с `shrink-0` длинное имя папки распирало
            её в правую зону и она наезжала на кнопку отмены. `truncate`
            внутри обрезает имя, а не ломает раскладку. */}
        <div className="flex min-w-0 shrink items-center gap-2 rounded-pill bg-card px-4 py-2 shadow-pill lg:shrink-0 lg:gap-2.5 lg:bg-transparent lg:px-0 lg:py-0 lg:shadow-none">
          <span className="size-2.5 shrink-0 rounded-full bg-brand" />
          <span className="truncate text-[13px] font-bold text-ink lg:text-[15px]">
            {scopeLabel}
          </span>
          <span className="hidden text-[13px] text-faint-2 lg:inline">
            {done} / {total}
          </span>
        </div>

        {/* `basis-0 grow` вместо `flex-1`: зона занимает своё содержимое как
            минимум. С `flex-1` стороны делили место поровну, и кнопка справа
            не влезала в отмеренную ей половину - наезжала на пилюлю папки. */}
        <div className="flex shrink-0 grow basis-0 justify-end gap-2.5 lg:flex-none lg:grow-0">
          {/* На мобайле - зеркало крестика слева: белый круг с одной иконкой.
              Подпись «Назад» там съедала место у названия папки, а пара
              «круг ... круг» читается как единый ряд управления. На десктопе
              место есть - остаётся пилюля с текстом. */}
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            aria-label="Отменить оценку"
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-card text-faint-2 shadow-pill disabled:cursor-not-allowed disabled:opacity-40 lg:size-auto lg:rounded-[11px] lg:bg-rail lg:px-3 lg:py-2 lg:text-[13px] lg:font-semibold lg:text-faint lg:shadow-none"
          >
            <UndoIcon className="size-4" />
            <span className="hidden lg:inline">Назад</span>
          </button>
          <button
            type="button"
            onClick={exit}
            className="hidden shrink-0 cursor-pointer items-center gap-1.5 rounded-[11px] bg-rail px-3 py-2 text-[13px] font-semibold text-faint lg:flex"
          >
            Завершить
          </button>
        </div>
      </div>

      <ProgressBar done={done} total={total} />

      {/* Карточка: на мобайле тянется, на десктопе - фиксированная и по центру */}
      <div className="flex min-h-0 flex-1 flex-col lg:items-center lg:justify-center">
        <StudyCard
          card={current.card}
          note={current.note}
          revealed={revealed}
          onFlip={reveal}
          // Примеры - это фразы: живой записи для них не существует, поэтому
          // озвучивает облако (§6), а локальный синтез остаётся фолбэком.
          // Раньше здесь стоял голый `speak`, и примеры звучали системным
          // голосом мимо облака, в отличие от самого слова.
          onSpeak={(text) => play({ url: null, text, cloud: true })}
          onPlay={play}
        />
      </div>

      {/* Оценки - только после раскрытия; до этого место занимает подсказка */}
      <div className="mt-5 lg:mt-3 lg:self-center lg:w-[560px]">
        {revealed ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* В тренировке оценка ни на что не влияет - показываем честные
                «Ещё раз»/«Дальше» вместо четырёх неработающих градаций. */}
            {cram ? <CramBar onRate={rate} /> : <RatingBar options={options} onRate={rate} />}
          </motion.div>
        ) : (
          <button
            type="button"
            onClick={reveal}
            className="w-full cursor-pointer rounded-[18px] bg-brand px-4 py-4 text-[15px] font-extrabold text-white shadow-fab lg:rounded-2xl"
          >
            Показать ответ
          </button>
        )}
      </div>
    </div>
  )
}
