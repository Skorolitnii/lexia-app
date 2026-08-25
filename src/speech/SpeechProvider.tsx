import { useEffect, useState, type ReactNode } from "react";
import { useRepo } from "@/data/useRepo";
import { SpeechContext } from "@/speech/SpeechContext";
import { useSpeech } from "@/speech/useSpeech";
import type { CloudConfig } from "@/speech/cloudTts";
import { normalizeStudyLanguage, type StudyLanguage } from "@/speech/languages";
import { isSupabaseConfigured, supabase } from "@/supabase/client";

/**
 * Куда ходить за облачным синтезом. Облако живёт в том же проекте Supabase,
 * что и данные: отдельной настройки не заводим - не настроен Supabase,
 * значит фразы озвучивает локальный синтез, как и раньше.
 */
// Ссылку фиксируем здесь: внутри замыкания `supabase` снова сузился бы до
// `null` - TS не помнит проверку через границу функции.
const client = isSupabaseConfigured ? supabase : null;

const CLOUD: CloudConfig | null = client
  ? {
      baseUrl: import.meta.env.VITE_SUPABASE_URL,
      // Сессию спрашиваем у клиента в момент запроса, а не запоминаем:
      // `getSession` сам обновит токен, если тот успел протухнуть.
      accessToken: async () => {
        const { data } = await client.auth.getSession();
        return data.session?.access_token ?? null;
      },
    }
  : null;

/**
 * Скорость озвучки зафиксирована на 1×. Она входит в ключ кэша (облако
 * запекает её в mp3), поэтому её смена означала бы повторный - платный -
 * синтез всей колоды. Настройка `tts_rate` в базе остаётся: вернуть регулятор
 * можно, раскомментировав секцию в `SpeechSettings` и сняв фиксацию здесь.
 */
const FIXED_RATE = 1;

export function SpeechProvider({ children }: { children: ReactNode }) {
  const repo = useRepo();
  const rate = FIXED_RATE;
  const [autoplay, setAutoplay] = useState(false);
  const [studyLanguage, setStudyLanguage] = useState<StudyLanguage>("en");
  const [cloud, setCloud] = useState(true);
  const [voiceURI, setVoiceURI] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    void repo.getSettings().then((s) => {
      if (!active) return;
      setAutoplay(s.tts_autoplay);
      setStudyLanguage(normalizeStudyLanguage(s.study_language));
      setCloud(s.tts_cloud);
      setVoiceURI(s.tts_voice);
    });
    return () => {
      active = false;
    };
  }, [repo, tick]);

  // Выключенное облако = `null`: `useSpeech` тогда сразу идёт локальным
  // синтезом, не тратя запрос на заведомо ненужный резолв.
  const speech = useSpeech({
    language: studyLanguage,
    rate,
    voiceURI,
    cloud: cloud ? CLOUD : null,
  });

  return (
    <SpeechContext
      value={{
        ...speech,
        rate,
        autoplay,
        studyLanguage,
        cloud,
        voiceURI,
        reload: () => setTick((t) => t + 1),
      }}
    >
      {children}
    </SpeechContext>
  );
}
