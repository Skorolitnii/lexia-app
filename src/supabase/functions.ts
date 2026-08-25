import type { StudyLanguage } from "@/speech/languages";
import { isSupabaseConfigured, supabase } from "@/supabase/client";

/**
 * Вызовы Edge Functions. Всё, что раньше фронт делал сам десятком запросов -
 * словарные лукапы при импорте, синтез озвучки, - переехало на сервер и
 * зовётся отсюда одной ручкой.
 *
 * Каждая функция проверяет JWT сессии: publishable-ключ общий для всех и
 * пользователя не удостоверяет. Токен берём в момент запроса, а не заранее -
 * `getSession` сам обновит его, если тот успел протухнуть.
 */

// Ссылку фиксируем здесь: внутри функции `supabase` снова сузился бы до
// `null` - TS не помнит проверку через границу вызова.
const client = isSupabaseConfigured ? supabase : null;

/** Функции доступны только при настроенном Supabase (иначе всё локально). */
export const functionsAvailable = client !== null;

async function callFunction(name: string, body: unknown): Promise<unknown> {
  if (!client) throw new Error("supabase not configured");

  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("not signed in");

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    // Тело ошибки читаем: функции кладут туда разбор («quota exhausted»,
    // «cards failed»), и без него в UI осталось бы голое «не получилось».
    const detail: unknown = await res.json().catch(() => null);
    const reason = (detail as { error?: unknown } | null)?.error;
    throw new Error(typeof reason === "string" ? reason : `HTTP ${res.status}`);
  }
  return res.json();
}

/** Заметка колоды в том виде, в каком её принимает `import-deck`. */
export interface ImportDeckNote {
  type: "basic" | "cloze";
  front: string;
  back: string | null;
  details: string | null;
  examples: { text: string; translation?: string }[];
  study_language: StudyLanguage;
  reverse: boolean;
  tags: string[];
}

export interface ImportDeckResult {
  created: number;
  /** Дубликаты: слово уже есть в целевой папке. */
  skipped: number;
}

/**
 * Импортировать колоду целиком: словарь, дубликаты, запись notes+cards и
 * прогрев озвучки - всё на сервере, за один запрос.
 */
export async function importDeck(
  notes: ImportDeckNote[],
  folderId: string | null,
  rate: number,
): Promise<ImportDeckResult> {
  const body = (await callFunction("import-deck", {
    notes,
    folderId,
    rate,
  })) as {
    created?: unknown;
    skipped?: unknown;
  };
  return {
    created: typeof body.created === "number" ? body.created : 0,
    skipped: typeof body.skipped === "number" ? body.skipped : 0,
  };
}

/**
 * Синтезировать озвучку заранее - для только что сохранённой заметки.
 * Осечки глотаем: прогрев спекулятивен, и при промахе клиент сходит за
 * синтезом сам при первом показе карточки. Ждать результата незачем -
 * форма закрывается сразу.
 */
export function warmAudio(
  texts: string[],
  language: StudyLanguage,
  rate: number,
): void {
  if (!client || texts.length === 0) return;
  void callFunction("warm-audio", { texts, language, rate }).catch(() => {});
}
