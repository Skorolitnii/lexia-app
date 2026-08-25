import { describe, expect, it } from "vitest";
import { parseDeck } from "@/transfer/deck";
import {
  STARTER_DECK_PRESETS,
  STARTER_DECK_SIZE,
  starterDeckJson,
} from "@/transfer/starterDeck";

/**
 * Стартовая колода - контент, а не код, и сломать её легко молча: опечатка в
 * cloze или пустой `back` дадут «issue» на импорте, а не ошибку сборки. Поэтому
 * гоняем её через тот же `parseDeck`, что и файл пользователя.
 */
describe("стартовые колоды", () => {
  it("каждый пресет разбирается без брака", () => {
    for (const preset of STARTER_DECK_PRESETS) {
      const deck = parseDeck(starterDeckJson(preset.id));

      expect(deck.issues, preset.id).toEqual([]);
      expect(deck.folder).toBe(`${preset.title} - ${preset.languageName}`);
      expect(deck.language).toBe(preset.language);
    }
  });

  it("обещанный размер совпадает с реальным", () => {
    for (const preset of STARTER_DECK_PRESETS) {
      const deck = parseDeck(starterDeckJson(preset.id));

      // Цифра показана на пустом экране - расхождение было бы враньём в UI.
      expect(deck.notes, preset.id).toHaveLength(STARTER_DECK_SIZE);
    }
  });

  it("у каждой заметки есть перевод, уникальное слово и правильный язык", () => {
    for (const preset of STARTER_DECK_PRESETS) {
      const deck = parseDeck(starterDeckJson(preset.id));
      for (const note of deck.notes) {
        expect(note.type, note.front).toBe("basic");
        expect(note.back, note.front).toBeTruthy();
        expect(note.examples, note.front).toHaveLength(1);
        expect(note.examples[0]?.text, note.front).toBeTruthy();
        expect(note.examples[0]?.translation, note.front).toBeTruthy();
        expect(note.details, note.front).toContain("**Часть речи:**");
        expect(note.study_language, note.front).toBe(preset.language);
      }
      const fronts = deck.notes.map((n) => n.front.toLowerCase());
      expect(new Set(fronts).size, preset.id).toBe(fronts.length);
    }
  });
});
