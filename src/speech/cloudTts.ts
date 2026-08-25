import { cloudVoice, type StudyLanguage } from "@/speech/languages";

export { cloudVoice } from "@/speech/languages";

/**
 * Облачный синтез - ЕДИНСТВЕННЫЙ источник озвучки (§6): слова, фразы, примеры
 * и cloze-предложения. Живые записи OneLook убраны: они существовали лишь для
 * части словарных слов, ссылка была недокументированным путём чужого сайта, а
 * голоса Azure звучат ровно так же хорошо на всём материале.
 *
 * Зачем вообще облако, если есть Web Speech: на iOS браузеру доступны только
 * компактные системные голоса - скачанные enhanced/premium WebKit не отдаёт.
 * Проверено на реальном устройстве: и в Chrome, и в установленной PWA список
 * один и тот же, все голоса `super-compact`.
 *
 * Экономика держится на кэше: синтез идёт ОДИН раз на фразу, дальше mp3
 * лежит в Supabase Storage, а на устройстве - в кэше service worker
 * (правило `pronunciation-audio` матчит любой `destination === 'audio'`,
 * поэтому облачные файлы попадают туда сами).
 */

/**
 * Нормализация текста перед хэшированием. Без неё «the  otter » и «the otter»
 * дали бы два разных ключа, то есть два платных синтеза одной фразы.
 * Регистр НЕ трогаем: в отличие от словарного лукапа, он влияет на интонацию.
 */
function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * Ключ файла в Storage. Зависит от всего, что влияет на звук: текста, голоса
 * и скорости. Скорость входит в ключ, потому что облако запекает её в файл -
 * в отличие от Web Speech, где `rate` живой параметр воспроизведения.
 *
 * Скорость округляем до сотых: `0.9500000000000001` из-за плавающей точки
 * иначе создал бы файл-двойник.
 *
 * СИНХРОННАЯ, и это принципиально. Раньше здесь был `crypto.subtle.digest`,
 * то есть промис, - и путь от клика до `audio.play()` разрывался микротаском.
 * WebKit на iOS считает жест пользователя потраченным, как только между
 * обработчиком и воспроизведением появляется `await`, и глушил звук целиком:
 * и облако, и локальный фолбэк. Криптостойкость тут не нужна - имя файла в
 * своём же бакете не секрет, - поэтому берём обычный строковый хэш.
 *
 * Считаем два независимых 32-битных состояния (FNV-1a с разными смещениями)
 * и склеиваем: один 32-битный хэш дал бы коллизии на нескольких тысячах фраз,
 * а коллизия - это чужая озвучка вместо своей.
 */
export function cacheKey(text: string, voice: string, rate: number): string {
  const payload = `${normalize(text)}|${voice}|${rate.toFixed(2)}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < payload.length; i++) {
    const c = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x85ebca6b);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return hex(h1) + hex(h2);
}

/** Публичный URL готового mp3 в бакете `tts`. */
export function storageUrl(baseUrl: string, key: string): string {
  return `${baseUrl.replace(/\/$/, "")}/storage/v1/object/public/tts/${key}.mp3`;
}

/**
 * До какого момента не трогаем облако. Исчерпанная месячная квота (429) - это
 * не «попробуйте через секунду», а надолго: без паузы каждая фраза ходила бы
 * в функцию впустую, добавляя задержку перед неизбежным откатом на локальный
 * синтез. Живёт в памяти вкладки - перезагрузка сбрасывает, и это правильно:
 * между сессиями квота могла обновиться.
 */
let quotaBlockUntil = 0;

/** Пауза после исчерпания квоты. */
const QUOTA_COOLDOWN_MS = 30 * 60 * 1000;

/** Сброс паузы. Нужен тестам: состояние модульное и течёт между случаями. */
export function resetQuotaBlock(): void {
  quotaBlockUntil = 0;
}

/** Куда ходить за синтезом; `null` - облако выключено или не настроено. */
export interface CloudConfig {
  baseUrl: string;
  /**
   * JWT текущей сессии - функция проверяет именно его, а не publishable-ключ:
   * тот общий для всех и не удостоверяет пользователя. Функция, а не строка,
   * потому что токен живёт около часа и обновляется: взятый заранее протух бы
   * посреди сессии изучения. `null` - пользователь не вошёл, облако не наше.
   */
  accessToken: () => Promise<string | null>;
}

/**
 * Адрес, по которому mp3 фразы ЛЕЖАЛ БЫ, будь он уже синтезирован. Сети не
 * трогает: имя файла - чистая функция от текста, голоса и скорости.
 *
 * Проверять существование заранее (HEAD) не нужно и вредно: у HEAD из `fetch`
 * destination `empty`, поэтому правило service worker (`destination === 'audio'`)
 * его не перехватывает - каждое воспроизведение уходило бы в сеть, даже когда
 * файл уже в кэше, а на промахе давало шумный 400. Вместо этого адрес отдаём
 * `<audio>`: попадание играет из кэша SW и работает офлайн, а промах ловит
 * обработчик ошибки и зовёт `synthesizeAudioUrl`.
 *
 * СИНХРОННАЯ вслед за `cacheKey`: это единственный шаг между кликом и
 * `audio.play()`, и любой `await` здесь стоил бы жеста пользователя на iOS
 * (см. `cacheKey`).
 */
export function cachedAudioUrl(
  text: string,
  language: StudyLanguage,
  rate: number,
  config: CloudConfig | null,
): string | null {
  if (!config || !normalize(text)) return null;
  return storageUrl(config.baseUrl, cacheKey(text, cloudVoice(language), rate));
}

/**
 * Синтезировать фразу и получить URL готового mp3, или `null` при любой
 * осечке. Зовётся ТОЛЬКО когда воспроизведение по `cachedAudioUrl` не
 * удалось: файла ещё нет.
 */
export async function synthesizeAudioUrl(
  text: string,
  language: StudyLanguage,
  rate: number,
  config: CloudConfig | null,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (!config || !normalize(text)) return null;
  // Квота кончилась совсем недавно - не тратим время на заведомый отказ.
  if (Date.now() < quotaBlockUntil) return null;

  const voice = cloudVoice(language);
  try {
    const token = await config.accessToken();
    if (!token) return null;

    const made = await fetchImpl(
      `${config.baseUrl.replace(/\/$/, "")}/functions/v1/tts`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        // `key` не шлём: функция считает его сама из тех же полей. Присланный
        // путь означал бы управление именем объекта в бакете.
        body: JSON.stringify({ text: normalize(text), voice, rate }),
      },
    );
    if (!made.ok) {
      // 429 - лимит Azure: либо запросов в секунду, либо месячная квота.
      // Различить их клиенту нечем, поэтому выдерживаем паузу в обоих
      // случаях: секундный лимит она переживёт, а месячный - не даст
      // упереться в него на каждой карточке.
      if (made.status === 429) quotaBlockUntil = Date.now() + QUOTA_COOLDOWN_MS;
      return null;
    }

    const body: unknown = await made.json();
    const got = (body as { url?: unknown }).url;
    return typeof got === "string" ? got : null;
  } catch {
    // Сеть недоступна, CORS, битый JSON - всё это не ошибка озвучки,
    // а повод озвучить локально.
    return null;
  }
}
