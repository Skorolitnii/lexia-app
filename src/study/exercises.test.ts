import { describe, expect, it } from "vitest";
import { State } from "ts-fsrs";
import type { CardRow, NoteRow } from "@/types";
import {
  answerForExercise,
  choiceOptions,
  exampleOptions,
  letterTiles,
  mixedExerciseKind,
  normalizeAnswer,
  typedExpectedAnswer,
} from "@/study/exercises";

const now = new Date("2026-08-25T09:00:00Z").toISOString();

function note(partial: Partial<NoteRow>): NoteRow {
  return {
    id: "n1",
    user_id: "u1",
    folder_id: null,
    type: "basic",
    front: "resilient",
    back: "стойкий",
    transcription: null,
    audio_url: null,
    image_url: null,
    details: null,
    examples: [],
    reverse: true,
    tags: [],
    created_at: now,
    updated_at: now,
    deleted: false,
    ...partial,
  };
}

function card(partial: Partial<CardRow>): CardRow {
  return {
    id: "c1",
    user_id: "u1",
    note_id: "n1",
    direction: "forward",
    due: now,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: State.New,
    last_review: null,
    learning_steps: 0,
    suspended: false,
    created_at: now,
    updated_at: now,
    deleted: false,
    ...partial,
  };
}

describe("study exercises", () => {
  it("считает ожидаемый ответ по направлению карточки", () => {
    const baseNote = note({});
    expect(typedExpectedAnswer(card({ direction: "forward" }), baseNote)).toBe(
      "стойкий",
    );
    expect(typedExpectedAnswer(card({ direction: "reverse" }), baseNote)).toBe(
      "resilient",
    );
  });

  it("для audio и letters всегда тренирует изучаемое слово", () => {
    const baseNote = note({});
    expect(
      answerForExercise("audio", card({ direction: "forward" }), baseNote),
    ).toBe("resilient");
    expect(
      answerForExercise("letters", card({ direction: "reverse" }), baseNote),
    ).toBe("resilient");
  });

  it("строит варианты с одним правильным ответом", () => {
    const options = choiceOptions({
      correct: "стойкий",
      pool: ["быстрый", "тихий", "стойкий", "умный"],
      seed: "c1",
    });
    expect(options).toHaveLength(4);
    expect(options.filter((option) => option.correct)).toHaveLength(1);
    expect(options.map((option) => normalizeAnswer(option.text))).toContain(
      "стойкий",
    );
  });

  it("строит варианты примеров из других заметок", () => {
    const current = note({
      examples: [{ text: "She stayed resilient under pressure." }],
    });
    const options = exampleOptions({
      note: current,
      allNotes: [
        current,
        note({ id: "n2", examples: [{ text: "He missed the train." }] }),
        note({ id: "n3", examples: [{ text: "They opened the door." }] }),
        note({ id: "n4", examples: [{ text: "We cooked dinner." }] }),
      ],
      seed: "c1",
    });
    expect(options).toHaveLength(4);
    expect(options.filter((option) => option.correct)[0]?.text).toBe(
      "She stayed resilient under pressure.",
    );
  });

  it("не выбирает недоступные типы mixed-заданий", () => {
    const kind = mixedExerciseKind({
      cardId: "c1",
      done: 0,
      note: note({ examples: [] }),
      canChoice: false,
      canExample: false,
    });
    expect(["typed", "audio", "letters"]).toContain(kind);
  });

  it("перемешивает буквы стабильно", () => {
    expect(letterTiles("word")).toEqual(letterTiles("word"));
    expect(letterTiles("word").sort()).toEqual(["d", "o", "r", "w"]);
  });
});
