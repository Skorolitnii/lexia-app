import { useState } from "react";
import { useRepo } from "@/data/useRepo";
import { PlayIcon } from "@/components/icons";
import { Spinner } from "@/components/Loading";
import { SelectField } from "@/components/SelectField";
import {
  languageOption,
  STUDY_LANGUAGES,
  type VoiceByLanguage,
} from "@/speech/languages";
import { deviceVoices } from "@/speech/voices";
import { useSpeechContext } from "@/speech/useSpeechContext";

/** Поля настроек, которые правит эта панель. */
interface SettingsPatch {
  tts_rate?: number;
  tts_autoplay?: boolean;
  tts_voice?: string | null;
  tts_voices?: VoiceByLanguage;
  tts_cloud?: boolean;
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
    tts_voices: ctx.voiceURIs,
    tts_cloud: ctx.cloud,
  });

  // const rate = shown.tts_rate ?? ctx.rate  // вместе с секцией «Скорость»
  const autoplay = shown.tts_autoplay ?? ctx.autoplay;
  const voiceURIs = shown.tts_voices ?? ctx.voiceURIs;
  const cloud = shown.tts_cloud ?? ctx.cloud;
  const testPhrase = languageOption("en").testPhrase;

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
            onClick={() =>
              play({ url: null, text: testPhrase, language: "en", cloud: true })
            }
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

      {/* Голос устройства. Показываем только при качестве «На устройстве»:
          облако говорит своим голосом, и при включённом облаке этот выбор не
          влиял бы ни на что - именно это и путало. */}
      {!cloud && (
        <div className="space-y-3 px-4 py-3.5">
          <div>
            <div className="text-[14.5px] font-semibold text-ink">
              Голоса устройства
            </div>
            <div className="mt-0.5 text-[12.5px] text-faint-2">
              Отдельно для каждого языка
            </div>
          </div>
          <div className="space-y-2.5">
            {STUDY_LANGUAGES.map((language) => {
              const languageVoices = deviceVoices(voices, language.value);
              const selectedURI =
                voiceURIs[language.value] ?? languageVoices[0]?.voiceURI ?? "";
              return (
                <div
                  key={language.value}
                  className="gap-3 lg:flex lg:items-center lg:justify-between"
                >
                  <div className="min-w-0 text-[13.5px] font-bold text-muted">
                    {language.label}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 lg:mt-0">
                    <SelectField
                      className="min-w-0 flex-1 py-2 text-[13px] lg:w-[230px] lg:flex-none"
                      value={selectedURI}
                      onChange={(value) =>
                        save({
                          tts_voices: {
                            ...voiceURIs,
                            [language.value]: value || null,
                          },
                        })
                      }
                      disabled={languageVoices.length === 0}
                      options={
                        languageVoices.length === 0
                          ? [
                              {
                                value: "",
                                label: `Авто (${language.locale})`,
                              },
                            ]
                          : languageVoices.map((v) => ({
                              value: v.voiceURI,
                              label: `${v.name} (${v.lang})`,
                            }))
                      }
                    />
                    <button
                      type="button"
                      aria-label={`Проверить ${language.label}`}
                      aria-busy={pendingText === language.testPhrase}
                      onClick={() =>
                        play({
                          url: null,
                          text: language.testPhrase,
                          language: language.value,
                          cloud: true,
                        })
                      }
                      className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-brand text-white"
                    >
                      {pendingText === language.testPhrase ? (
                        <Spinner size={14} />
                      ) : (
                        <PlayIcon className="size-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
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
