import { useCallback, useEffect, useRef, useState } from 'react'
import { pickVoice, type Accent, type VoiceLike } from '@/speech/voices'
import type { SpeakSource } from '@/speech/audioSource'
import { cachedAudioUrl, synthesizeAudioUrl, type CloudConfig } from '@/speech/cloudTts'

// Подсветку «сейчас звучит» намеренно не делаем: озвучка глобальна (один
// экземпляр на приложение), а состояние было бы одним булевым на все кнопки -
// подсветились бы разом. Различать активную кнопку нечем, поэтому и не заводим.
//
// А вот ОЖИДАНИЕ синтеза показываем: облако отвечает секунды, и без отклика
// клик выглядит как «не нажалось». Держим не флаг, а сам текст (`pendingText`):
// по нему кнопка узнаёт себя, и лоадер видит только та, которую нажали.

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

/**
 * Крошечный валидный wav-файл с тишиной. Нужен, чтобы «прожечь» жест
 * пользователя на переиспользуемом `<audio>`: iOS выдаёт право играть
 * конкретному элементу, а не приложению, и получить его можно только вызвав
 * `play()` внутри обработчика жеста. Источник должен быть ВАЛИДНЫМ - `play()`
 * на пустом элементе отклоняется и мешает следующему `src` загрузиться.
 */
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='

/**
 * КОРЕНЬ проблемы с плеером в Пункте управления.
 *
 * iOS показывает карточку «сейчас играет» не потому, что мы что-то забыли
 * убрать, а потому что КЛАССИФИЦИРУЕТ наш звук как медиа-воспроизведение.
 * По умолчанию тип аудио-сессии - `auto`, и WebKit, увидев играющий
 * `<audio>`, повышает её до `playback` («видео или музыка»). Для такой сессии
 * системный плеер - штатное поведение, и погасить его через `mediaSession`
 * задним числом невозможно: мы правили следствие, а не причину.
 *
 * Наша озвучка - короткий звук по нажатию, а не музыка. По спецификации
 * Audio Session это `transient`: «короткий звук вроде уведомления, играет поверх
 * остального аудио». Такой сессии системные медиа-контролы не положены -
 * карточка не появляется вовсе. Бонусом чужая музыка не обрывается: `playback`
 * останавливал её, `transient` лишь приглушает.
 *
 * API живёт только в WebKit (iOS 16.4+) и в lib.dom пока не описано, поэтому
 * тип объявляем сами, а вызов защищаем проверкой - в Chrome и на десктопе
 * свойства просто нет, и это нормально.
 */
type AudioSessionType = 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient'

function markAudioTransient() {
  if (typeof navigator === 'undefined') return
  const nav = navigator as Navigator & { audioSession?: { type: AudioSessionType } }
  if (!nav.audioSession) return
  try {
    nav.audioSession.type = 'transient'
  } catch {
    // Значение не поддержано этой версией WebKit - остаёмся на дефолте.
    // Хуже, чем было, не станет, а падать из-за косметики нельзя.
  }
}

/**
 * Отпустить элемент и погасить системную карточку «сейчас играет».
 *
 * Держим ВМЕСТЕ с `transient`, а не вместо: тип сессии не даёт карточке
 * появиться, а это - подчищает состояние (в т.ч. на версиях WebKit без
 * Audio Session API и на случай, если карточку успел завести другой путь).
 */
function clearMediaSession() {
  const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined
  if (!ms) return
  ms.metadata = null
  ms.playbackState = 'none'
}

function releaseAudio(audio: HTMLAudioElement) {
  audio.removeAttribute('src')
  audio.load()
  clearMediaSession()
}

export interface SpeechOptions {
  accent: Accent
  rate: number
  /**
   * Закреплённый голос устройства (`voiceURI`); перекрывает `accent`.
   * Влияет только на локальный синтез - облако говорит своим голосом,
   * поэтому и выбор показывается лишь при качестве «На устройстве».
   */
  voiceURI?: string | null
  /** Облачный синтез для фраз; `null` - выключен, играет локальный. */
  cloud?: CloudConfig | null
}

export interface Speech {
  supported: boolean
  /** Список голосов может прийти асинхронно (`voiceschanged`), в т.ч. после первого рендера. */
  voices: SpeechSynthesisVoice[]
  /**
   * Текст, который сейчас ждёт облачного синтеза, или `null`. Кнопка сравнивает
   * со своим текстом и показывает лоадер вместо иконки. Локальный синтез сюда
   * не попадает - он мгновенный.
   */
  pendingText: string | null
  speak: (text: string) => void
  /**
   * Озвучить источник из `cardSpeakSource`: живой голос словаря, если он есть,
   * иначе (и при любой осечке mp3) - синтез по `text`.
   *
   * `gesture: false` - вызов не из клика, а фоновый (автоплей при смене
   * карточки). Тогда при промахе облачного кэша НЕ откатываемся на локальный
   * синтез: жеста нет, iOS всё равно заблокирует звук, и слышно было бы
   * только робота вместо нормального голоса.
   */
  play: (source: SpeakSource, opts?: { gesture?: boolean }) => void
  /**
   * Заранее подготовить облачную озвучку, ничего не проигрывая: синтез идёт
   * секунды, и без прогрева каждая новая фраза встречала бы пользователя
   * лоадером. Звук не трогает, `pendingText` не ставит - фоновая работа не
   * должна зажигать лоадер на кнопке, которую никто не нажимал.
   */
  prefetch: (source: SpeakSource) => void
}

/**
 * Озвучка через Web Speech (§8 этап 4). Подводные камни §7:
 *
 * - Список голосов грузится асинхронно (`voiceschanged`) и на первом кадре
 *   часто пуст - подписываемся и перечитываем.
 * - iOS отдаёт `getVoices()` пустым до первого `speak()` - поэтому голос
 *   выбираем в момент озвучки, а не заранее; пустой список = голос по умолчанию.
 * - Быстрые повторные клики: `cancel()` перед `speak()`, иначе фразы копятся
 *   в очереди и проговариваются одна за другой.
 */
export function useSpeech(opts: SpeechOptions): Speech {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  // Опции читаем в момент клика, а не замыкаем в `speak`: иначе смена
  // акцента/скорости в настройках не подхватилась бы без пересборки колбэка.
  // Обновляем в эффекте, а не в рендере (правка ref во время рендера запрещена):
  // клик всегда происходит после коммита, так что к нему ref уже актуален.
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  })

  // Перечитать список голосов. Держим в ref, чтобы звать и из эффекта, и из
  // `speak` (после первой озвучки iOS наконец отдаёт непустой список).
  const loadVoicesRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (!supported) return
    const load = () => setVoices(window.speechSynthesis.getVoices())
    loadVoicesRef.current = load
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)

    // iOS отдаёт `getVoices()` пустым до первого обращения к синтезу и при
    // этом НЕ всегда шлёт `voiceschanged` (особенно в установленной PWA).
    // Без опроса первая же озвучка звучала бы голосом браузера по умолчанию,
    // мимо выбранного US/UK. Опрашиваем несколько раз, пока список не
    // приедет, и прекращаем - вечный таймер тут не нужен.
    let tries = 0
    const timer = window.setInterval(() => {
      if (window.speechSynthesis.getVoices().length > 0 || ++tries > 10) {
        window.clearInterval(timer)
        load()
        return
      }
      load()
    }, 300)

    return () => {
      window.clearInterval(timer)
      window.speechSynthesis.removeEventListener('voiceschanged', load)
    }
  }, [])

  // Незавершённая озвучка при размонтировании (ушли со страницы) - обрываем.
  useEffect(() => {
    if (!supported) return
    return () => window.speechSynthesis.cancel()
  }, [])

  const speak = useCallback((text: string) => {
    const clean = text.trim()
    if (!supported || !clean) return

    // Локальный синтез на iOS заводит ту же аудио-сессию, что и `<audio>`, -
    // значит и ту же карточку плеера. В `speak` можно попасть мимо `unlock`
    // (фолбэк после неудачного облака), поэтому объявляем тип и здесь.
    markAudioTransient()

    const synth = window.speechSynthesis
    synth.cancel()

    const u = new SpeechSynthesisUtterance(clean)
    const { accent, rate, voiceURI } = optsRef.current
    const voice = pickVoice(synth.getVoices() as VoiceLike[], accent, voiceURI)
    if (voice) {
      u.voice = voice as unknown as SpeechSynthesisVoice
      u.lang = voice.lang
    } else {
      // Голоса ещё не загружены: язык подсказываем сами, голос выберет браузер.
      u.lang = accent === 'us' ? 'en-US' : 'en-GB'
    }
    u.rate = rate
    synth.speak(u)

    // После первого `speak()` iOS отдаёт голоса, даже если до этого список
    // был пуст и `voiceschanged` не приходил. Перечитываем - следующая
    // озвучка тогда уже попадёт в нужный акцент.
    loadVoicesRef.current()
  }, [])

  // ОДИН переиспользуемый <audio> на всё приложение вместо `new Audio(url)`
  // на каждый клик - иначе на iOS звука нет вовсе.
  //
  // WebKit разрешает воспроизведение только элементу, у которого `play()`
  // хоть раз вызвали внутри обработчика жеста пользователя. Свежесозданный
  // элемент этого права не имеет, а получить его не успевает: облачный путь
  // сначала резолвит адрес, и к моменту `play()` жест уже потрачен. Поэтому
  // элемент создаём один раз, «прожигаем» на нём жест синхронно в клике
  // (`unlock`), и дальше он играет любой src, в том числе полученный
  // асинхронно.
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Кому сейчас принадлежит элемент. Играет роль прежнего сравнения
  // `audioRef.current !== audio`: элемент теперь один, и отличать свежий
  // запрос от отменённого нужно по токену, иначе ошибка отменённого
  // воспроизведения утащила бы в фолбэк уже начавшееся новое.
  const audioTokenRef = useRef(0)

  // Токен воспроизведения, которому принадлежит ближайший `ended`. Ставится в
  // `playUrl` вместе с `audioTokenRef` - у тишины «прожига» из `unlock` его
  // нет, поэтому её окончание элемент не отпускает. Стартовое -1, а не 0:
  // иначе на первом же `unlock` (когда `audioTokenRef` ещё 0) гейт совпал бы.
  const endedTokenRef = useRef(-1)

  // Локальный синтез на iOS требует того же жеста, что и <audio>. Один раз за
  // сессию проговариваем пустую фразу прямо в обработчике клика - после этого
  // WebKit принимает и отложенные `speak()`, до которых мы доходим через
  // резолв облака.
  const synthUnlockedRef = useRef(false)

  /**
   * Забрать право на воспроизведение, пока жест ещё жив. Зовётся СИНХРОННО в
   * начале `play`/`speak`, до любого `await`.
   */
  const unlock = useCallback(() => {
    if (typeof window === 'undefined') return null

    // Объявляем тип аудио-сессии ДО первого воспроизведения: если дать WebKit
    // сыграть при `auto`, он уже повысит сессию до `playback` и заведёт
    // карточку плеера. Ставим на каждый жест, а не один раз при создании
    // элемента, - тип сессии сбрасывается вместе с ней (например, после
    // долгого молчания или возврата из фона).
    markAudioTransient()

    if (!audioRef.current) {
      const audio = new Audio()
      audio.preload = 'auto'
      audioRef.current = audio
      // iOS показывает наш `<audio>` в Пункте управления как «сейчас играет»
      // и оставляет карточку плеера висеть после конца воспроизведения -
      // убрать её можно было только выгрузив приложение. Отпускаем элемент
      // сами, как только фраза доиграла: снятый `src` + `load()` переводят
      // его в «нечего играть», и система убирает карточку.
      //
      // Только на `ended`: `pause` сюда вешать нельзя - `playUrl` намеренно
      // останавливает элемент перед подстановкой нового src, и `load()`
      // оттуда сбрасывал бы озвучку, которая как раз начинается. Обрыв
      // предыдущей фразы гасит карточку сам, прямо в `playUrl`.
      //
      // Гейт по токену: `ended` от прошлого источника приходит асинхронно и
      // может застать уже начавшуюся следующую озвучку - отпускать элемент
      // тогда нельзя. Сравниваем токен, действовавший на момент подписки
      // на это воспроизведение, с текущим. Тишина «прожига» из `unlock`
      // токена не получает вовсе, поэтому её `ended` сюда не доходит.
      audio.addEventListener('ended', () => {
        if (audioTokenRef.current !== endedTokenRef.current) return
        releaseAudio(audio)
      })
      // Разблокируем ОДИН раз и обязательно на валидном источнике - коротком
      // молчании. `play()` на элементе БЕЗ src отклоняется с `NotSupportedError`
      // и оставляет элемент в подвешенном состоянии: следующий `src` в том же
      // такте иногда не грузится, и озвучка молча падала в локальный синтез.
      // Тишина же играет и заканчивается сама, не мешая подставить настоящий
      // src следом.
      audio.src = SILENCE
      void audio.play().catch(() => {})
    }
    const audio = audioRef.current

    if (supported && !synthUnlockedRef.current) {
      synthUnlockedRef.current = true
      // Пробел, а не пустая строка: пустую WebKit отбрасывает как no-op, и
      // жест бы не «прожёгся». Громкость 0 - прогрев не должен быть слышен.
      const warm = new SpeechSynthesisUtterance(' ')
      warm.volume = 0
      window.speechSynthesis.speak(warm)
    }

    return audio
  }, [])

  // Счётчик кликов: облачный резолв асинхронный, и пока он идёт, пользователь
  // может нажать другую кнопку. Ответ устаревшего запроса отбрасываем по
  // несовпадению токена - иначе прошлая фраза перебила бы новую.
  const playTokenRef = useRef(0)

  // Что ждёт синтеза. Снимаем при любом исходе - успех, отказ, устаревший
  // клик: иначе кнопка осталась бы с вечным лоадером.
  const [pendingText, setPendingText] = useState<string | null>(null)

  // Фразы, уже прогретые в этой сессии, - защита от повторных вызовов
  // функции. Живёт в памяти вкладки; перезагрузка сбрасывает, и это верно:
  // к тому моменту файл лежит в Storage, и повтор всё равно дешёвый.
  const warmedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    return () => {
      // Элемент переиспользуемый, но хук живёт в провайдере и размонтируется
      // вместе с приложением - осиротевший src держать незачем.
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        // Не просто `pause`: на iOS карточка «сейчас играет» переживает и паузу,
        // и размонтирование - элемент надо отпустить явно.
        releaseAudio(audio)
      }
      audioRef.current = null
    }
  }, [])

  /**
   * Проиграть mp3 (живая запись или облачный синтез) с откатом на локальный
   * синтез по `text`. Общая для обоих путей: у живого голоса и облака
   * различается только источник ссылки, а обрыв предыдущего и фолбэк - одни.
   */
  const playUrl = useCallback(
    (url: string, text: string, onError?: () => void) => {
      // Элемент общий, поэтому не создаём новый, а переключаем src. Право на
      // воспроизведение уже взято в `unlock` внутри жеста.
      const audio = unlock()
      if (!audio) return

      // Прежнее произношение снимаем ДО нового src: иначе два наложатся друг
      // на друга (та же причина, что у `synth.cancel()`). `pause()` только
      // если что-то реально играет: вызов поверх ещё не разрешившегося
      // `play()` отклоняет тот промис с `AbortError`, а он у нас ведёт в
      // фолбэк на локальный синтез.
      if (!audio.paused) audio.pause()
      if (supported) window.speechSynthesis.cancel()

      // Прошлое воспроизведение оборвано - его `ended` не придёт НИКОГДА, а
      // системная карточка плеера осталась бы от него висеть. В режиме
      // изучения это основной путь: каждое новое слово перебивает прошлое.
      // Гасим сессию здесь же; новый src ниже заведёт её заново.
      clearMediaSession()

      const token = audioTokenRef.current + 1
      audioTokenRef.current = token
      // Этому воспроизведению принадлежит и ближайший `ended`.
      endedTokenRef.current = token

      // Фолбэк на синтез, если mp3 не доступно: офлайн без кэша, битая ссылка,
      // неподдерживаемый кодек. Гейт по токену отсекает событие от УЖЕ
      // отменённого воспроизведения - без него быстрый второй клик получил бы
      // TTS поверх нового произношения.
      const fallback = () => {
        if (audioTokenRef.current !== token) return
        // Облако подставляет сюда «сходить в функцию за синтезом»; у готового
        // адреса из заметки своего пути нет - сразу локальный синтез.
        if (onError) onError()
        else speak(text)
      }
      // Слушатель одноразовый: элемент переживает много воспроизведений, и без
      // `once` обработчики от прошлых кликов копились бы на нём.
      audio.addEventListener('error', fallback, { once: true })

      audio.src = url
      // `play()` отклоняется отдельно от события error (например, когда
      // автоплей заблокирован политикой браузера) - ловим оба пути.
      void audio.play().catch(fallback)
    },
    [speak, unlock],
  )

  /**
   * Прогрев кэша: если файла ещё нет - синтезировать и положить в Storage,
   * если есть - подтянуть в кэш service worker обычным GET.
   *
   * Осечки глотаем молча: прогрев спекулятивен, пользователь его не просил,
   * и падать из-за него нельзя - когда дойдёт до реального клика, `play`
   * пройдёт тот же путь и честно откатится на локальный синтез.
   */
  const prefetch = useCallback((source: SpeakSource) => {
    if (!source.cloud) return
    const { accent, rate, cloud } = optsRef.current
    if (!cloud) return
    // Одну фразу греем один раз за сессию. Без этого прогрев дёргал бы
    // функцию на каждый показ карточки: в dev service worker выключен
    // (`devOptions` не задан), и `caches.match` там всегда промахивается.
    if (warmedRef.current.has(source.text)) return
    warmedRef.current.add(source.text)

    const url = cachedAudioUrl(source.text, accent, rate, cloud)
    if (!url) return

    // Здесь `await` безвреден, в отличие от `play`: прогрев ничего не
    // воспроизводит, и жест пользователя ему не нужен.
    void (async () => {
      // Сначала спрашиваем кэш service worker напрямую - без сети и без
      // шумного 400 в консоли, который давал GET по отсутствующему файлу.
      // Уже лежит - греть нечего.
      if ('caches' in window && (await caches.match(url))) return

      // Идём в функцию, а не GET'ом в Storage: она сама проверяет наличие
      // файла и не синтезирует повторно, а промах по GET светился бы
      // ошибкой. Ответ прогоняем обычным запросом, чтобы SW положил mp3
      // в кэш (у HEAD destination `empty` - такое правило SW не ловит).
      const made = await synthesizeAudioUrl(source.text, accent, rate, cloud)
      if (made) void fetch(made).catch(() => {})
    })()
  }, [])

  /**
   * Озвучить текст облаком, с откатом на локальный синтез. Основной и
   * единственный путь озвучки: слова, фразы, примеры и cloze идут сюда.
   *
   * `gesture` - был ли вызов из клика. Если нет (автоплей), при промахе кэша
   * молчим: синтез идёт секунды, жест к тому моменту потрачен, и локальный
   * фолбэк был бы слышен как робот вместо голоса.
   */
  const playViaCloud = useCallback(
    (text: string, gesture: boolean) => {
      const { accent, rate, cloud } = optsRef.current
      const token = playTokenRef.current + 1
      playTokenRef.current = token

      // Ожидание от прошлого клика снимаем сразу: тот запрос уже никого не
      // озвучит (его отсечёт токен), а его кнопка иначе осталась бы с
      // лоадером навсегда - если этот клик попадёт в кэш и до `finally`
      // синтеза дело не дойдёт.
      setPendingText(null)

      // Синтез идёт секунды - показываем ожидание именно на этой кнопке.
      // Зовётся только при промахе кэша: попадание играет мгновенно, и
      // лоадер моргнул бы впустую.
      const onMiss = () => {
        if (playTokenRef.current !== token) return
        setPendingText(text)
        void synthesizeAudioUrl(text, accent, rate, cloud ?? null)
          .then((made) => {
            if (playTokenRef.current !== token) return
            // Синтез занял секунды, и жеста пользователя давно нет. Если это
            // была НЕ его затея (автоплей на открытии карточки), iOS такое
            // воспроизведение молча заблокирует, и локальный синтез из
            // фолбэка тоже не зазвучит - в жесте отказано обоим. Поэтому у
            // автоплея фолбэка нет: не смогли облаком - молчим, а озвучка
            // ждёт тапа (файл к тому моменту готов и играет нормально).
            if (!made) {
              if (gesture) speak(text)
              return
            }
            playUrl(made, text, gesture ? () => speak(text) : undefined)
          })
          .finally(() => {
            // Свежий клик уже поставил своё ожидание - чужое не трогаем.
            if (playTokenRef.current === token) setPendingText(null)
          })
      }

      // Адрес считается синхронно (чистая функция от текста, голоса и
      // скорости), поэтому `playUrl` вызывается ПРЯМО в жесте - ради этого
      // `cacheKey` и перестал быть асинхронным. Попадание играет из кэша
      // service worker, в том числе офлайн; промах приводит в `onMiss`, и
      // лишнего запроса на каждое воспроизведение нет.
      const guess = cachedAudioUrl(text, accent, rate, cloud ?? null)
      if (guess) playUrl(guess, text, onMiss)
      else speak(text)
    },
    [speak, playUrl],
  )

  const play = useCallback(
    (source: SpeakSource, opts?: { gesture?: boolean }) => {
      // Вызов из обработчика клика (по умолчанию) или фоновый - автоплей при
      // смене карточки. От этого зависит поведение при промахе кэша: см.
      // `playViaCloud`.
      const gesture = opts?.gesture ?? true

      // Первым делом, пока жест пользователя ещё жив, забираем право на
      // воспроизведение. Всё, что ниже, может уйти в промис - и на iOS уже
      // не смогло бы включить звук самостоятельно.
      unlock()

      if (!source.url) {
        // Обычный путь: синтезирует облако, локальный голос - фолбэк. На iOS
        // системные голоса компактные и звучат заметно хуже облачных.
        if (source.cloud) playViaCloud(source.text, gesture)
        else speak(source.text)
        return
      }

      // Готовый адрес есть только у заметки с собственным `audio_url` из
      // импортированного чужого JSON (§5). Не проигралось - откатываемся на
      // облако, и лишь оно, не сумев, отдаёт локальному синтезу.
      playUrl(source.url, source.text, () => playViaCloud(source.text, gesture))
    },
    [speak, playUrl, unlock, playViaCloud],
  )

  return { supported, voices, pendingText, speak, play, prefetch }
}
