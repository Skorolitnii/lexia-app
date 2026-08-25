import { useCallback, useRef, useState } from "react";
import { useRepo } from "@/data/useRepo";
import { DEFAULT_FOLDER_COLOR } from "@/library/folderColors";
import { useSpeechContext } from "@/speech/useSpeechContext";
import { importDeck } from "@/supabase/functions";
import { parseDeck } from "@/transfer/deck";
import { STARTER_DECK_JSON, STARTER_DECK_TITLE } from "@/transfer/starterDeck";

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
  // Язык и скорость нужны серверу, чтобы синтезировать озвучку тем же
  // голосом и с тем же ключом кэша, что попросит клиент при показе карточки.
  const { studyLanguage, rate } = useSpeechContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Гейт от двойного клика: `setBusy` асинхронен, два синхронных клика оба
  // увидели бы false и завели колоду дважды (тот же приём, что `running`).
  const running = useRef(false);

  const install = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const deck = parseDeck(STARTER_DECK_JSON);
      const folder = await repo.createFolder({
        id: crypto.randomUUID(),
        name: STARTER_DECK_TITLE,
        color: DEFAULT_FOLDER_COLOR,
        position: 0,
      });
      await importDeck(deck.notes, folder.id, studyLanguage, rate);
      onDone();
    } catch {
      setError("Не удалось добавить колоду");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [repo, onDone, studyLanguage, rate]);

  return { install, busy, error };
}
