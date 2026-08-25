/**
 * Чистый выбор голоса TTS - вынесен из хука, чтобы тестировать без DOM
 * (в jsdom `speechSynthesis` нет). Работает с любым объектом-как-`SpeechSynthesisVoice`.
 */

import { languageOption, type StudyLanguage } from "@/speech/languages";

/** Минимум, который нам нужен от голоса - чтобы функцию можно было звать с моками. */
export interface VoiceLike {
  lang: string;
  name: string;
  voiceURI: string;
  default?: boolean;
}

/**
 * Чёрный список: Apple-голоса набора Novelty - поющие и роботические
 * (`Bells`, `Zarvox`, ...). Они английские и формально годны для синтеза, но
 * словарное слово ими не выучить.
 *
 * Именно чёрный, а не белый: белый список конкретных имён молча выкидывал
 * только что скачанный голос, если его не было в перечне, - а Apple добавляет
 * голоса с каждой версией. Лучше показать лишнее, чем спрятать нужное.
 *
 * КАЖДОЕ имя держим в двух вариантах - английском и русском. Apple переводит
 * имена novelty-голосов под язык системы, и на русской macOS приходят
 * «Колокольчик»/«Зарвокс»/«Шепот», а не `Bells`/`Zarvox`/`Whisper`: список
 * только из английских имён не отсекал на такой системе ничего.
 *
 * Сравнение идёт по «канону» имени (см. `canon`), поэтому снабжённые суффиксом
 * качества и языком в скобках варианты тоже отсеиваются.
 */
const BLOCKED_VOICE_NAMES = new Set([
  // Novelty, английские имена.
  "albert",
  "bad news",
  "bahh",
  "bells",
  "boing",
  "bubbles",
  "cellos",
  "good news",
  "grandma",
  "grandpa",
  "jester",
  "junior",
  "organ",
  "ralph",
  "rocko",
  "superstar",
  "trinoids",
  "whisper",
  "wobble",
  "zarvox",
  // Старейшие compact-голоса macOS. Формально не novelty, но синтетичны
  // настолько, что учить по ним произношение бессмысленно.
  "fred",
  "kathy",
  // Novelty, те же голоса под русской локалью системы.
  "альберт",
  "бабушка",
  "бах",
  "виолончель",
  "воббл",
  "дедушка",
  "джуниор",
  "зарвокс",
  "колокольчик",
  "орган",
  "плохие новости",
  "прыг-скок",
  "пузырьки",
  "ральф",
  "рокко",
  "суперзвезда",
  "триноид",
  "хорошие новости",
  "шепот",
  "шёпот",
  "шутник",
  "фред",
  "кэти",
]);

/** Нормализуем `en_US` / `en-us` к `en-us` - ОС пишут по-разному. */
function norm(lang: string): string {
  return lang.toLowerCase().replace("_", "-");
}

/**
 * Канон имени голоса для сравнения и дедупа: нижний регистр без скобочных
 * суффиксов. Режем ВСЕ скобки до конца строки, а не только `(Premium)`:
 * Apple дописывает к новым голосам ещё и язык, локализованный под систему
 * (`Eddy (английский (Великобритания))`), и совпадение по точному имени на
 * таких голосах не срабатывало бы вовсе.
 */
function canon(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\(.*$/, "")
    .trim();
}

/**
 * Ранг качества голоса - он же порядок в списке. Нужен и для дедупа (показать
 * лучшую версию одного голоса), и для сортировки: хорошие голоса должны быть
 * наверху, иначе смысл их загрузки теряется.
 *
 * Облачные голоса Google (десктопный Chrome) идут первыми: они заметно лучше
 * системных compact и были дефолтом до появления этого ранжирования. Суффикса
 * `(Premium)` у них нет, поэтому без отдельной ветки они падали бы в общую
 * кучу compact и терялись в хвосте алфавита.
 */
function qualityRank(name: string): number {
  const n = name.toLowerCase();
  if (n.startsWith("google")) return 0;
  if (n.includes("(premium)")) return 1;
  if (n.includes("(enhanced)")) return 2;
  return 3;
}

/**
 * Выбрать голос под язык с деградацией: точная локаль → та же языковая семья →
 * любой доступный. Возврат `null` только если голосов нет вообще (список ещё
 * не загрузился) - вызывающий код тогда даёт браузеру голос по умолчанию.
 *
 * Если пользователь закрепил конкретный голос (`preferredURI`) и он ещё
 * существует, берём его: набор голосов на устройстве стабилен, а выбор - явный.
 */
export function pickVoice(
  voices: readonly VoiceLike[],
  language: StudyLanguage,
  preferredURI?: string | null,
): VoiceLike | null {
  if (voices.length === 0) return null;

  if (preferredURI) {
    const pinned = voices.find((v) => v.voiceURI === preferredURI);
    if (pinned) return pinned;
  }

  // Дефолт без явного выбора - лучший из пригодных: список уже отсортирован
  // по качеству, поэтому premium-голос выигрывает у compact автоматически.
  const allowed = allowedVoices(voices, language);
  if (allowed.length > 0) {
    const want = norm(languageOption(language).locale);
    return allowed.find((v) => norm(v.lang) === want) ?? allowed[0];
  }

  const want = norm(languageOption(language).locale);
  const sameFamily = voices.filter(
    (v) => norm(v.lang).split("-")[0] === want.split("-")[0],
  );
  return (
    sameFamily.find((v) => norm(v.lang) === want) ?? sameFamily[0] ?? voices[0]
  );
}

/**
 * Английские голоса, пригодные для изучения слов: всё, кроме novelty.
 * Дедупим по канону имени и языку: одна и та же «Ava» может прийти и как
 * compact, и как premium - в списке нужна одна строка, лучшая из доступных.
 * Сортировка: сначала качество (premium → enhanced → compact), внутри
 * качества - по алфавиту, чтобы порядок не прыгал между запусками.
 */
function allowedVoices(
  voices: readonly VoiceLike[],
  language?: StudyLanguage,
  anyLanguage = false,
): VoiceLike[] {
  const best = new Map<string, VoiceLike>();
  const seenURI = new Set<string>();
  const wanted = language ? norm(languageOption(language).locale) : null;
  const wantedFamily = wanted?.split("-")[0];
  for (const voice of voices) {
    const name = canon(voice.name);
    if (BLOCKED_VOICE_NAMES.has(name)) continue;
    const lang = norm(voice.lang);
    if (wantedFamily && lang.split("-")[0] !== wantedFamily) continue;
    if (wanted && !anyLanguage && lang !== wanted) continue;
    // Один и тот же голос (тот же `voiceURI`) некоторые браузеры отдают
    // несколько раз под разными языками - берём первое вхождение.
    if (seenURI.has(voice.voiceURI)) continue;
    seenURI.add(voice.voiceURI);
    // Ключ включает язык: один и тот же голос идёт отдельными строками для
    // US и UK (`Eddy (en-GB)` / `Eddy (en-US)`) - это разные акценты, и
    // схлопывать их в одну строку значило бы отнять выбор.
    const key = `${name}|${lang}`;
    const prev = best.get(key);
    // Дедуп по канону: держим лучшую по качеству версию голоса.
    if (!prev || qualityRank(voice.name) < qualityRank(prev.name))
      best.set(key, voice);
  }
  return [...best.values()].sort(
    (a, b) =>
      qualityRank(a.name) - qualityRank(b.name) ||
      canon(a.name).localeCompare(canon(b.name)),
  );
}

/** Голоса-кандидаты для автоподбора: только US/UK, кроме novelty. */
export function englishVoices(voices: readonly VoiceLike[]): VoiceLike[] {
  return allowedVoices(voices, "en");
}

/**
 * Голоса для ручного выбора в настройках: все голоса семейства выбранного
 * языка. Для English это en-US/en-GB/en-AU/etc, но автоподбор держит en-US.
 */
export function deviceVoices(
  voices: readonly VoiceLike[],
  language: StudyLanguage = "en",
): VoiceLike[] {
  return allowedVoices(voices, language, true);
}
