import type { CardRow, NoteRow } from "@/types";
import { parseCloze } from "@/study/cloze";

export type StudyMode = "cards" | "mixed";

export type ExerciseKind =
  "flashcard" | "typed" | "choice" | "audio" | "letters" | "example";

export interface ChoiceOption {
  id: string;
  text: string;
  correct: boolean;
}

export const STUDY_MODE_LABEL: Record<StudyMode, string> = {
  cards: "Карточки",
  mixed: "Смешанный",
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  let state = hashString(seed) || 1;
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = Math.imul(state ^ (state >>> 15), 2246822507) >>> 0;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function typedExpectedAnswer(card: CardRow, note: NoteRow): string {
  if (card.direction === "reverse") return note.front;
  if (card.direction === "cloze") {
    return parseCloze(note.front)
      .filter((seg) => seg.blank)
      .map((seg) => seg.text)
      .join(" ");
  }
  return note.back ?? "";
}

export function normalizeAnswer(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[.,!?;:()[\]{}"«»]/g, "")
    .replace(/\s+/g, " ");
}

export function mixedExerciseKind({
  cardId,
  done,
  note,
  canChoice,
  canExample,
}: {
  cardId: string;
  done: number;
  note: NoteRow;
  canChoice: boolean;
  canExample: boolean;
}): ExerciseKind {
  const kinds: ExerciseKind[] = ["typed", "audio", "letters"];
  if (canChoice) kinds.push("choice");
  if (canExample && note.examples.length > 0) kinds.push("example");
  return stableShuffle(kinds, `${cardId}:${done}`)[0] ?? "typed";
}

export function answerForExercise(
  kind: ExerciseKind,
  card: CardRow,
  note: NoteRow,
): string {
  if (kind === "audio" || kind === "letters") return note.front;
  return typedExpectedAnswer(card, note);
}

export function letterTiles(answer: string): string[] {
  return stableShuffle([...answer.replace(/\s+/g, "")], `letters:${answer}`);
}

export function choiceOptions({
  correct,
  pool,
  seed,
}: {
  correct: string;
  pool: readonly string[];
  seed: string;
}): ChoiceOption[] {
  const normalizedCorrect = normalizeAnswer(correct);
  const uniqueDistractors = Array.from(
    new Map(
      pool
        .filter(
          (value) =>
            normalizeAnswer(value) &&
            normalizeAnswer(value) !== normalizedCorrect,
        )
        .map((value) => [normalizeAnswer(value), value]),
    ).values(),
  );

  return stableShuffle(
    [
      { id: "correct", text: correct, correct: true },
      ...stableShuffle(uniqueDistractors, `pool:${seed}`)
        .slice(0, 3)
        .map((text, i) => ({ id: `d${i}`, text, correct: false })),
    ],
    `options:${seed}`,
  );
}

export function exampleOptions({
  note,
  allNotes,
  seed,
}: {
  note: NoteRow;
  allNotes: readonly NoteRow[];
  seed: string;
}): ChoiceOption[] {
  const correct = stableShuffle(note.examples, `examples:${seed}`)[0]?.text;
  if (!correct) return [];
  const pool = allNotes
    .filter((n) => n.id !== note.id)
    .flatMap((n) => n.examples.map((example) => example.text));
  return choiceOptions({ correct, pool, seed: `example:${seed}` });
}
