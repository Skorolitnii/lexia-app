import { useState } from "react";
import { useRepo } from "@/data/useRepo";
import { PlayIcon } from "@/components/icons";
import { Spinner } from "@/components/Loading";
import { selectCls } from "@/components/formStyles";
import {
  languageOption,
  STUDY_LANGUAGES,
  type StudyLanguage,
} from "@/speech/languages";
import { deviceVoices } from "@/speech/voices";
import { useSpeechContext } from "@/speech/useSpeechContext";

/** Поля настроек, которые правит эта панель. */
interface SettingsPatch {
  tts_rate?: number;
  tts_autoplay?: boolean;
  tts_voice?: string | null;
  tts_cloud?: boolean;
  study_language?: StudyLanguage;
}

/**
 * Убрать из оптимистичного слоя то, что контекст уже отдаёт сам. Сравниваем
 * значения, а не просто удаляем ключи: пока запрос летел, пользователь мог
 * нажать ещё раз, и слепое удаление откатило бы UI на предпоследний выбор.
 */
function dropApplied(
  pending: Partial<SettingsPatch>,
  applied: SettingsPatch,
): Partial<SettingsPatch> {
  const stale = (Object.keys(pending) as (keyof SettingsPatch)[]).filter(
    (key) => pending[key] === applied[key],
  );
  // Нечего снимать - отдаём ПРЕЖНЮЮ ссылку: новый объект на каждый рендер
  // заставлял бы React перерисовывать панель вхолостую.
  if (stale.length === 0) return pending;

  const next = { ...pending };
  for (const key of stale) delete next[key];
  return next;
}

/** Тумблер в стиле формы заметки (см. NoteForm). */
function Switch({ on }: { on: boolean }) {
  return (
    <span
      className={`relative h-6 w-11 shrink-0 rounded-pill transition-colors ${on ? "bg-brand" : "bg-track"}`}
    >
      <span
        className={`absolute top-0.5 size-5 rounded-full bg-card shadow-card transition-[left] ${on ? "left-[22px]" : "left-0.5"}`}
      />
    </span>
  );
}

/* Скорость озвучки убрана из настроек: облако запекает её в mp3, и она входит
   в ключ кэша - каждая новая скорость означала бы повторный синтез всей колоды
   заново. Фиксирована на 1× (`SpeechProvider`). Вернуть - раскомментировать
   секцию ниже и снять фиксацию там же.

const RATES = [0.75, 1, 1.25] as const
*/

/** Качество озвучки: облако или голос устройства. */
const QUALITY: { value: boolean; label: string }[] = [
  { value: true, label: "Улучшенное" },
  { value: false, label: "На устройстве" },
];

/**
 * Настройки озвучки: качество, произношение, скорость, автоплей. Правки
 * сразу пишутся в
 * репозиторий, и `reload()` перечитывает их в общий `SpeechProvider`, чтобы
 * следующий клик по озвучке звучал уже по-новому - без перезагрузки страницы.
 */
export function SpeechSettings() {
  const repo = useRepo();
  // Значения - из контекста; поверх него лежит тонкий оптимистичный слой
  // `pending`, чтобы клик применялся мгновенно (см. ниже).
  const ctx = useSpeechContext();
  const { supported, voices, play, pendingText, reload } = ctx;

  /**
   * Что пользователь успел нажать, но база ещё не подтвердила. Контекст
   * обновляется только после записи и `reload()`, и без этого слоя
   * переключатель залипал бы на старом варианте до конца запроса.
   *
   * Полной копии настроек здесь нет - только нажатые поля.
   */
  const [pending, setPending] = useState<Partial<SettingsPatch>>({});

  // Оптимистичное значение живёт ровно до тех пор, пока контекст не отдаст
  // то же самое. Считаем это прямо в рендере, а не эффектом с `setState`:
  // эффект дал бы лишний проход рендера на каждое обновление контекста.
  const shown = dropApplied(pending, {
    tts_rate: ctx.rate,
    tts_autoplay: ctx.autoplay,
    tts_voice: ctx.voiceURI,
    tts_cloud: ctx.cloud,
    study_language: ctx.studyLanguage,
  });

  // const rate = shown.tts_rate ?? ctx.rate  // вместе с секцией «Скорость»
  const autoplay = shown.tts_autoplay ?? ctx.autoplay;
  const studyLanguage = shown.study_language ?? ctx.studyLanguage;
  const currentLanguage = languageOption(studyLanguage);
  const cloud = shown.tts_cloud ?? ctx.cloud;
  const voiceURI =
    shown.tts_voice !== undefined ? shown.tts_voice : ctx.voiceURI;
  const testPhrase = currentLanguage.testPhrase;

  const save = (patch: SettingsPatch) => {
    // Показываем выбор сразу, пишем в фоне: настройки озвучки - не та правка,
    // ради которой стоит держать интерфейс запертым.
    setPending((prev) => ({ ...prev, ...patch }));
    void repo.updateSettings(patch).then(() => reload());
  };

  if (!supported) {
    return (
      <div className="px-4 py-3.5 text-[13px] text-faint-2">
        Этот браузер не поддерживает озвучку (Web Speech).
      </div>
    );
  }

  const languageVoices = deviceVoices(voices, studyLanguage);
  // При пустом `voiceURI` (голос не выбран) select показывает фактический
  // дефолт - тот же, что подберёт `pickVoice`, - чтобы UI совпадал со звуком.
  const selectedURI = voiceURI ?? languageVoices[0]?.voiceURI ?? "";

  return (
    <div className="divide-y divide-line-faint">
      {/* Качество озвучки. Раньше здесь был выбор конкретного голоса
          устройства, но при включённом облаке он не влиял ни на что: фразы
          произносит облачный синтез, а слова - живая запись OneLook. Осталась
          одна честная ось - как звучит приложение.

          На мобайле раскладка вертикальная: два варианта со словами плюс
          кнопка проверки не оставляют заголовку места на 375px (у соседних
          секций короткие US/UK и 1x, им хватает). На десктопе места довольно -
          там строка, как у всех. */}
      <div className="px-4 py-3.5 lg:flex lg:items-center lg:justify-between lg:gap-4">
        <div className="min-w-0">
          <div className="text-[14.5px] font-semibold text-ink">
            Качество озвучки
          </div>
          <div className="mt-0.5 text-[12.5px] text-faint-2">
            {cloud
              ? "Живые голоса, нужен интернет"
              : "Голос устройства, работает без сети"}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 lg:mt-0 lg:shrink-0">
          <div className="flex flex-1 gap-1 rounded-[11px] bg-track p-1 lg:flex-none">
            {QUALITY.map(({ value, label }) => (
              <button
                key={String(value)}
                type="button"
                aria-pressed={cloud === value}
                onClick={() => save({ tts_cloud: value })}
                className={`flex-1 cursor-pointer rounded-[8px] px-3 py-1.5 text-[13px] font-bold transition-colors lg:flex-none ${
                  cloud === value
                    ? "bg-card text-ink shadow-pill"
                    : "text-faint-2"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Одна кнопка проверки на весь раздел, и стоит она здесь всегда.
              Раньше их было две - для облака и для голоса устройства, - и при
              переключении качества кнопка исчезала тут и появлялась строкой
              ниже, будто перепрыгивая.

              `cloud: true` - просьба озвучить облаком, а не утверждение, что
              оно включено: `play` сверяется с настройкой сам и при «На
              устройстве» произнесёт локальным синтезом. Поэтому одна кнопка
              честно проверяет оба режима - тем же путём, что и карточка. */}
          <button
            type="button"
            aria-label="Проверить озвучку"
            aria-busy={pendingText === testPhrase}
            onClick={() => play({ url: null, text: testPhrase, cloud: true })}
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-brand text-white"
          >
            {pendingText === testPhrase ? (
              <Spinner size={16} />
            ) : (
              <PlayIcon className="size-4" />
            )}
          </button>
        </div>
      </div>

      <div className="px-4 py-3.5 lg:flex lg:items-center lg:justify-between lg:gap-4">
        <div className="min-w-0">
          <div className="text-[14.5px] font-semibold text-ink">Язык</div>
          <div className="mt-0.5 text-[12.5px] text-faint-2">
            {currentLanguage.label}: {currentLanguage.hint}
          </div>
        </div>
        <select
          className={`${selectCls} mt-3 w-full py-2 text-[13px] lg:mt-0 lg:w-auto lg:min-w-[180px] lg:shrink-0`}
          value={studyLanguage}
          onChange={(e) =>
            save({
              study_language: e.target.value as StudyLanguage,
              tts_voice: null,
            })
          }
        >
          {STUDY_LANGUAGES.map((language) => (
            <option key={language.value} value={language.value}>
              {language.label}
            </option>
          ))}
        </select>
      </div>

      {/* Голос устройства. Показываем только при качестве «На устройстве»:
          облако говорит своим голосом, и при включённом облаке этот выбор не
          влиял бы ни на что - именно это и путало. */}
      {!cloud && (
        <div className="px-4 py-3.5 lg:flex lg:items-center lg:justify-between lg:gap-4">
          <div className="min-w-0">
            <div className="text-[14.5px] font-semibold text-ink">Голос</div>
            <div className="mt-0.5 text-[12.5px] text-faint-2">
              Из установленных в системе
            </div>
          </div>
          {/* На мобайле во всю ширину: имена длинные («Саманта (en-US)»), и
              рядом с заголовком select резался бы до нечитаемого. Кнопки
              проверки здесь нет - она одна на раздел, в «Качестве». */}
          <select
            className={`${selectCls} mt-3 w-full py-2 text-[13px] lg:mt-0 lg:w-auto lg:max-w-[185px] lg:shrink-0`}
            value={selectedURI}
            onChange={(e) => save({ tts_voice: e.target.value || null })}
            disabled={languageVoices.length === 0}
          >
            {languageVoices.length === 0 && (
              <option value="">Авто ({currentLanguage.locale})</option>
            )}
            {languageVoices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Скорость - см. комментарий у RATES выше.
      <div className="flex items-center justify-between gap-4 px-4 py-3.5">
        <div className="text-[14.5px] font-semibold text-ink">Скорость</div>
        <div className="flex shrink-0 gap-1 rounded-[11px] bg-track p-1">
          {RATES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={rate === r}
              onClick={() => save({ tts_rate: r })}
              className={`cursor-pointer rounded-[8px] px-3 py-1.5 text-[13px] font-bold transition-colors ${
                rate === r ? 'bg-card text-ink shadow-pill' : 'text-faint-2'
              }`}
            >
              {r === 1 ? '1×' : `${r}×`}
            </button>
          ))}
        </div>
      </div>
      */}

      {/* Автоплей */}
      <button
        type="button"
        aria-pressed={autoplay}
        onClick={() => save({ tts_autoplay: !autoplay })}
        className="flex w-full cursor-pointer items-center justify-between gap-4 px-4 py-3.5 text-left"
      >
        <div className="min-w-0">
          <div className="text-[14.5px] font-semibold text-ink">
            Автопроигрывание
          </div>
          <div className="mt-0.5 text-[12.5px] text-faint-2">
            Озвучивать слово при показе карточки
          </div>
        </div>
        <Switch on={autoplay} />
      </button>
    </div>
  );
}
