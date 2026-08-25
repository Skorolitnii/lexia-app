import { useCallback, useRef, useState } from "react";
import { useRepo } from "@/data/useRepo";
import { DEFAULT_FOLDER_COLOR } from "@/library/folderColors";
import { useSpeechContext } from "@/speech/useSpeechContext";
import type { StudyLanguage } from "@/speech/languages";
import { importDeck } from "@/supabase/functions";
import { parseDeck } from "@/transfer/deck";
import { starterDeckJson } from "@/transfer/starterDeck";

/**
 * Установка стартовой колоды в один клик с пустого экрана.
 *
 * Идёт тем же путём, что и обычный импорт (`import-deck`): словарь, запись и
 * прогрев озвучки - на сервере. Своей записи в обход общей ручки не заводим -
 * иначе стартовая колода расходилась бы с обычным импортом.
 *
 * Превью здесь не нужно: колода наша, а аккаунт пустой - дубликатов быть не с
 * чем.
 */
export function useStarterDeck(onDone: () => void) {
  const repo = useRepo();
  // Скорость нужна серверу для ключа кэша; язык лежит в заметках стартовой колоды.
  const { rate } = useSpeechContext();
  const [busyPresetId, setBusyPresetId] = useState<StudyLanguage | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Гейт от двойного клика: `setBusy` асинхронен, два синхронных клика оба
  // увидели бы false и завели колоду дважды (тот же приём, что `running`).
  const running = useRef(false);

  const install = useCallback(
    async (presetId: StudyLanguage) => {
      if (running.current) return;
      running.current = true;
      setBusyPresetId(presetId);
      setError(null);
      try {
        const deck = parseDeck(starterDeckJson(presetId));
        const folder = await repo.createFolder({
          id: crypto.randomUUID(),
          name: deck.folder ?? "100 главных слов",
          color: DEFAULT_FOLDER_COLOR,
          position: 0,
        });
        await importDeck(deck.notes, folder.id, rate);
        onDone();
      } catch {
        setError("Не удалось добавить колоду");
      } finally {
        running.current = false;
        setBusyPresetId(null);
      }
    },
    [repo, onDone, rate],
  );

  return { install, busyPresetId, error };
}
