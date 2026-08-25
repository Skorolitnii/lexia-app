import { describe, expect, it } from "vitest";
import { DeckParseError, needsLookup, parseDeck } from "@/transfer/deck";

const deck = (notes: unknown[], folder = "Animals") =>
  JSON.stringify({ version: 1, folder, notes });

describe("parseDeck - формат файла", () => {
  it("разбирает пример из спеки (§4)", () => {
    const result = parseDeck(
      deck([
        {
          type: "basic",
          front: "otter",
          back: "выдра",
          reverse: true,
          tags: ["animals", "water"],
          examples: [
            {
              text: "The otter cracked a shell.",
              translation: "Выдра разбила раковину.",
            },
          ],
          details: "**Часть речи:** существительное",
        },
      ]),
    );

    expect(result.folder).toBe("Animals");
    expect(result.issues).toEqual([]);
    expect(result.notes[0]).toEqual({
      type: "basic",
      front: "otter",
      back: "выдра",
      details: "**Часть речи:** существительное",
      examples: [
        {
          text: "The otter cracked a shell.",
          translation: "Выдра разбила раковину.",
        },
      ],
      study_language: "en",
      reverse: true,
      tags: ["animals", "water"],
    });
  });

  it("не-JSON и файл без notes - ошибка целиком", () => {
    expect(() => parseDeck("не json")).toThrow(DeckParseError);
    expect(() => parseDeck('{"folder":"A"}')).toThrow(DeckParseError);
    expect(() => parseDeck("[]")).toThrow(DeckParseError);
  });

  it("тип по умолчанию basic, reverse по умолчанию false (§4: импортёр терпим)", () => {
    const { notes } = parseDeck(deck([{ front: "hedgehog" }]));
    expect(notes[0]).toMatchObject({
      type: "basic",
      reverse: false,
      back: null,
      details: null,
      study_language: "en",
    });
  });

  it("заметка без front - брак с указанием позиции, остальные импортируются", () => {
    const { notes, issues } = parseDeck(
      deck([{ front: "otter" }, { back: "без слова" }]),
    );
    expect(notes).toHaveLength(1);
    expect(issues).toEqual([{ index: 1, reason: "нет поля front" }]);
  });

  it("незнакомый тип - брак, а не «сойдёт за basic»", () => {
    const { notes, issues } = parseDeck(deck([{ front: "x", type: "clozе" }]));
    expect(notes).toHaveLength(0);
    expect(issues[0]?.reason).toContain("неизвестный тип");
  });

  it("cloze без пропусков не импортируется", () => {
    const { notes, issues } = parseDeck(
      deck([{ front: "Просто предложение.", type: "cloze" }]),
    );
    expect(notes).toHaveLength(0);
    expect(issues[0]?.reason).toContain("без пропусков");
  });

  it("cloze с пропусками проходит и теряет reverse (§3)", () => {
    const { notes } = parseDeck(
      deck([
        {
          front: "The fox is a {{cunning::хитрый}} animal.",
          type: "cloze",
          reverse: true,
        },
      ]),
    );
    expect(notes[0]?.type).toBe("cloze");
    expect(notes[0]?.reverse).toBe(false);
  });

  it("примеры принимаются и строками, и объектами; мусор отсеивается", () => {
    const { notes } = parseDeck(
      deck([
        {
          front: "x",
          examples: [
            "Строкой.",
            { text: "Объектом." },
            { translation: "без text" },
            42,
          ],
        },
      ]),
    );
    expect(notes[0]?.examples).toEqual([
      { text: "Строкой." },
      { text: "Объектом." },
    ]);
  });

  it("теги дедуплицируются, нестроковые отбрасываются", () => {
    const { notes } = parseDeck(
      deck([{ front: "x", tags: ["a", "a", 7, "", "b"] }]),
    );
    expect(notes[0]?.tags).toEqual(["a", "b"]);
  });

  it("поля-нестроки не роняют разбор", () => {
    const { notes } = parseDeck(
      deck([{ front: "x", back: 42, details: {}, tags: "нет" }]),
    );
    expect(notes[0]).toMatchObject({ back: null, details: null, tags: [] });
  });

  it("берёт язык из колоды для всех карточек", () => {
    const { language, notes } = parseDeck(
      JSON.stringify({
        version: 1,
        language: "de",
        notes: [{ front: "Haus" }],
      }),
    );

    expect(language).toBe("de");
    expect(notes[0]?.study_language).toBe("de");
  });

  it("берёт язык из карточки и использует его для озвучки/словаря", () => {
    const { notes } = parseDeck(
      deck([{ front: "ciao", language: "it" }, { front: "niño" }]),
    );

    expect(notes.map((x) => x.study_language)).toEqual(["it", "es"]);
    expect(needsLookup(notes[0]!)).toBe(false);
  });
});

describe("needsLookup", () => {
  const note = (over: object) => ({
    type: "basic" as const,
    front: "otter",
    back: null,
    details: null,
    examples: [],
    study_language: "en" as const,
    reverse: false,
    tags: [],
    ...over,
  });

  it("идёт за отдельным словом", () => {
    expect(needsLookup(note({}))).toBe(true);
  });

  it("идёт за глаголом с частицей «to» (to stir → stir)", () => {
    expect(needsLookup(note({ front: "to stir" }))).toBe(true);
    expect(needsLookup(note({ front: "To Run" }))).toBe(true);
  });

  it("пропускает фразы и cloze (§4)", () => {
    expect(needsLookup(note({ front: "otter cracked a shell" }))).toBe(false);
    expect(needsLookup(note({ type: "cloze", front: "A {{fox}} runs." }))).toBe(
      false,
    );
    // «to» + фраза - это всё ещё фраза, не отдельное слово.
    expect(needsLookup(note({ front: "to take off" }))).toBe(false);
  });
});
