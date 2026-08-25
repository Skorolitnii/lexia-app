// @vitest-environment jsdom
import { useCallback, useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NoteForm } from "@/library/NoteForm";
import { emptyDraft, type NoteDraft } from "@/library/draft";
import type { FolderRow } from "@/types";

/**
 * Самое хрупкое место автозаполнения - эффект подстановки: он различает свой
 * и автоподставленный пример и не должен переживать смену слова. Здесь именно
 * те сценарии, на которых ловились баги вручную.
 */

const ENTRY = {
  hello: [
    { word: "hello", tags: ["ipa_pron:həlˈoʊ"], defs: ["n\tA greeting."] },
  ],
  bright: [
    {
      word: "bright",
      tags: ["ipa_pron:brˈaɪt"],
      defs: ["adj\tEmitting light."],
    },
  ],
  otter: [{ word: "otter", tags: ["ipa_pron:ˈɑtɝ"], defs: [] }],
  // Многозначное слово: коробка / удар кулаком - словарь не знает, что имели в
  // виду, поэтому форма даёт выбрать значение.
  box: [
    {
      word: "box",
      tags: ["ipa_pron:bˈɑks"],
      defs: ["n\tA container.", "v\tTo fight with fists."],
    },
  ],
  // Реальный размер ответа: у `run` значений больше сотни. Показать их все
  // разом - это скролл на пол-экрана вместо выбора.
  run: [
    {
      word: "run",
      tags: ["ipa_pron:rˈʌn"],
      defs: [
        "v\tTo move swiftly.",
        "v\tTo flow.",
        "v\tTo operate.",
        "n\tAn act of running.",
        "n\tA scoring unit.",
        "n\tA rapid escape.",
      ],
    },
  ],
} as const;

/**
 * jsdom не даёт matchMedia, а `FolderPicker` внутри формы спрашивает брейкпоинт.
 * Здешним тестам ширина безразлична - отдаём стабильный мобайл.
 */
function stubMatchMedia() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function stubDictionary() {
  stubMatchMedia();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const word = new URL(url).searchParams.get("sp")!;
      const entry = ENTRY[word as keyof typeof ENTRY];
      // Неизвестное слово у Datamuse - пустой массив, а не 404.
      return Promise.resolve(
        new Response(JSON.stringify(entry ?? []), { status: 200 }),
      );
    }),
  );
}

/**
 * Обёртка с реальным состоянием драфта - как в LibraryPage.
 * QueryClient создаётся один раз на монтаж: пересоздание на каждый рендер
 * выбрасывало кэш и ломало отслеживание подстановки.
 */
function Harness({
  initial,
  onDraft,
  folders = [],
  onSubmit = () => {},
}: {
  initial: NoteDraft;
  onDraft: (d: NoteDraft) => void;
  folders?: FolderRow[];
  onSubmit?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      }),
  );
  // Стабильная ссылка - как applyToDraft в LibraryPage: иначе эффект подстановки
  // перезапускался бы на каждый рендер и затирал выбор значения обратно на дефолт.
  const applyToDraft = useCallback(
    (update: (current: NoteDraft) => NoteDraft) =>
      setDraft((prev) => update(prev)),
    [],
  );
  const wrap = (children: ReactNode) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  onDraft(draft);
  return wrap(
    <NoteForm
      draft={draft}
      folders={folders}
      saving={false}
      onChange={setDraft}
      onApply={applyToDraft}
      onSubmit={onSubmit}
      onCancel={() => {}}
      onCreateFolder={() => {}}
    />,
  );
}

function renderForm(front: string) {
  let latest: NoteDraft = { ...emptyDraft(null), front };
  const view = render(
    <Harness initial={latest} onDraft={(d) => (latest = d)} />,
  );
  return { view, draft: () => latest };
}

// cleanup вручную: авто-очистка Testing Library включается только с
// `globals: true` в конфиге vitest. Без неё формы прошлых тестов остаются
// в DOM, и getByLabelText находит чужое поле.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NoteForm - подстановка из словаря", () => {
  it("подставляет транскрипцию", async () => {
    stubDictionary();
    const { draft } = renderForm("hello");

    await waitFor(() => expect(draft().transcription).toBe("/həlˈoʊ/"), {
      timeout: 3000,
    });
    expect(draft().lookupFor).toBe("hello");
    // Примеров словарь не даёт - поле остаётся под ручной ввод.
    expect(draft().examples).toEqual([]);
  });

  it("слово без определений всё равно даёт транскрипцию (otter)", async () => {
    stubDictionary();
    const { draft } = renderForm("otter");

    await waitFor(() => expect(draft().transcription).toBe("/ˈɑtɝ/"), {
      timeout: 3000,
    });
  });

  it("не ходит в словарь за фразой", async () => {
    stubDictionary();
    renderForm("otter cracked a shell");

    await new Promise((r) => setTimeout(r, 900));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("не ходит в словарь за кириллицей", async () => {
    stubDictionary();
    renderForm("выдра");

    await new Promise((r) => setTimeout(r, 900));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("«не найдено» не роняет форму и оставляет поля пустыми", async () => {
    stubDictionary();
    const { draft } = renderForm("zzzznotaword");

    expect(
      await screen.findByText(/Нет в словаре/, {}, { timeout: 3000 }),
    ).toBeTruthy();
    expect(draft().transcription).toBeNull();
  });
});

describe("NoteForm - ручные примеры", () => {
  it("свой пример переживает и лукап, и смену слова", async () => {
    stubDictionary();
    const mine = { text: "МОЙ СОБСТВЕННЫЙ ПРИМЕР" };
    let latest: NoteDraft = {
      ...emptyDraft(null),
      front: "bright",
      examples: [mine],
    };
    render(<Harness initial={latest} onDraft={(d) => (latest = d)} />);

    await waitFor(() => expect(latest.transcription).toBe("/brˈaɪt/"), {
      timeout: 3000,
    });
    expect(latest.examples).toEqual([mine]);

    // Меняем слово так же, как пользователь - печатая в поле, без перемонтажа.
    await userEvent.clear(screen.getByLabelText("Слово / фраза"));
    await userEvent.type(screen.getByLabelText("Слово / фраза"), "hello");

    await waitFor(() => expect(latest.transcription).toBe("/həlˈoʊ/"), {
      timeout: 3000,
    });
    expect(latest.examples).toEqual([mine]);
  });
});

/**
 * Подвал - единственное место, где форма объясняет, почему «Сохранить»
 * выключено. Проверяем и запрет, и текст: молча выключенная кнопка - это
 * ровно тот баг, ради которого подсказка и заведена.
 */
describe("NoteForm - валидация обязательных полей", () => {
  const FOLDER: FolderRow = {
    id: "f1",
    user_id: "u",
    name: "Животные",
    color: null,
    position: 0,
    created_at: "",
    updated_at: "",
    deleted: false,
  };

  function renderWith(draft: Partial<NoteDraft>, onSubmit = vi.fn()) {
    stubDictionary();
    const initial: NoteDraft = { ...emptyDraft(null), ...draft };
    render(
      <Harness
        initial={initial}
        onDraft={() => {}}
        folders={[FOLDER]}
        onSubmit={onSubmit}
      />,
    );
    return {
      onSubmit,
      save: () => screen.getByRole("button", { name: /Сохранить/ }),
    };
  }

  it("без перевода не даёт сохранить и говорит, чего не хватает", async () => {
    const { onSubmit, save } = renderWith({
      front: "otter",
      folder_id: "f1",
      back: "",
    });

    expect(save().hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Введите перевод")).toBeTruthy();

    await userEvent.click(save());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("перевод из пробелов не считается заполненным", () => {
    const { save } = renderWith({
      front: "otter",
      folder_id: "f1",
      back: "   ",
    });

    expect(save().hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Введите перевод")).toBeTruthy();
  });

  it("заполненный перевод открывает сохранение и показывает итог", () => {
    const { save } = renderWith({
      front: "otter",
      folder_id: "f1",
      back: "выдра",
    });

    expect(save().hasAttribute("disabled")).toBe(false);
    expect(screen.getByText(/Сохранит 1 карточку в «Животные»/)).toBeTruthy();
  });

  it("у cloze просит перевод предложения", () => {
    renderWith({
      type: "cloze",
      front: "The fox is a {{cunning}} animal.",
      folder_id: "f1",
      back: "",
    });

    expect(screen.getByText("Введите перевод предложения")).toBeTruthy();
  });

  // Порядок подсказок = порядок полей: пока пусто слово, про перевод молчим.
  it("называет недостающее сверху вниз", () => {
    renderWith({ front: "", folder_id: "f1", back: "" });
    expect(screen.getByText("Введите слово или фразу")).toBeTruthy();
    expect(screen.queryByText("Введите перевод")).toBeNull();
  });

  it("без папки просит выбрать папку", () => {
    renderWith({ front: "otter", folder_id: null, back: "выдра" });
    // Именно подсказка подвала: тот же текст стоит и на кнопке пикера.
    expect(screen.getByText("Выберите папку", { selector: "p" })).toBeTruthy();
  });
});

describe("NoteForm - выбор значения у многозначного слова", () => {
  it("показывает список всех значений", async () => {
    stubDictionary();
    renderForm("box");

    expect(
      await screen.findByText("A container.", {}, { timeout: 3000 }),
    ).toBeTruthy();
    expect(screen.getByText("To fight with fists.")).toBeTruthy();
    expect(screen.getByText(/Несколько значений/)).toBeTruthy();
  });

  it("клик по значению переносит подсветку на него", async () => {
    stubDictionary();
    renderForm("box");

    // По умолчанию подсвечено первое значение.
    const container = await screen.findByText(
      "A container.",
      {},
      { timeout: 3000 },
    );
    const fight = screen.getByText("To fight with fists.");
    const pressed = (el: HTMLElement) =>
      el.closest("button")?.getAttribute("aria-pressed");

    await waitFor(() => expect(pressed(container)).toBe("true"));
    expect(pressed(fight)).toBe("false");

    await userEvent.click(fight);
    await waitFor(() => expect(pressed(fight)).toBe("true"));
    expect(pressed(container)).toBe("false");
  });

  it("длинный список сокращён до двух значений на часть речи", async () => {
    stubDictionary();
    renderForm("run");

    // Показаны первые два глагола и первые два существительных, третьи скрыты.
    expect(
      await screen.findByText("To move swiftly.", {}, { timeout: 3000 }),
    ).toBeTruthy();
    expect(screen.getByText("To flow.")).toBeTruthy();
    expect(screen.getByText("An act of running.")).toBeTruthy();
    expect(screen.getByText("A scoring unit.")).toBeTruthy();
    expect(screen.queryByText("To operate.")).toBeNull();
    expect(screen.queryByText("A rapid escape.")).toBeNull();
  });

  it("«показать ещё» раскрывает полный список и сворачивает обратно", async () => {
    stubDictionary();
    renderForm("run");

    const more = await screen.findByText(
      /Показать ещё 2 значения/,
      {},
      { timeout: 3000 },
    );
    await userEvent.click(more);

    expect(screen.getByText("To operate.")).toBeTruthy();
    expect(screen.getByText("A rapid escape.")).toBeTruthy();

    await userEvent.click(screen.getByText("Свернуть"));
    expect(screen.queryByText("To operate.")).toBeNull();
  });

  it("у однозначного слова списка нет", async () => {
    stubDictionary();
    const { draft } = renderForm("hello");

    await waitFor(() => expect(draft().transcription).toBe("/həlˈoʊ/"), {
      timeout: 3000,
    });
    expect(screen.queryByText(/Несколько значений/)).toBeNull();
  });
});
