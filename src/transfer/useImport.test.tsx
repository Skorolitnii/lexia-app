// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { RepoContext } from "@/data/RepoContext";
import type { Repository } from "@/data/repo";
import { SpeechContext, type SpeechContextValue } from "@/speech/SpeechContext";
import { useImport } from "@/transfer/useImport";
import type { FolderRow } from "@/types";

/**
 * Папка из файла (§4) должна назначаться сама: имя в колоде уже есть, и
 * требовать выбрать его руками - лишний шаг на каждом импорте.
 */

function folder(id: string, name: string): FolderRow {
  return {
    id,
    user_id: "u",
    name,
    color: null,
    position: 0,
    created_at: "2026-08-10T00:00:00.000Z",
    updated_at: "2026-08-10T00:00:00.000Z",
    deleted: false,
  };
}

/** Минимальный репозиторий: только методы, которые читает `useImport`. */
function makeRepo(folders: FolderRow[] = []): Repository {
  return {
    listFolders: vi.fn().mockResolvedValue(folders),
    listNotes: vi.fn().mockResolvedValue([]),
  } as unknown as Repository;
}

/**
 * Озвучка нужна `useImport` только ради языка и скорости - их он передаёт
 * серверу, чтобы синтез шёл тем же голосом, что попросит карточка. Сам звук
 * тесты не трогают, поэтому контекст минимальный.
 */
const speech = {
  studyLanguage: "en",
  rate: 1,
} as unknown as SpeechContextValue;

function wrapper(repo: Repository) {
  return ({ children }: { children: ReactNode }) => (
    <RepoContext.Provider value={repo}>
      <SpeechContext.Provider value={speech}>{children}</SpeechContext.Provider>
    </RepoContext.Provider>
  );
}

const deckJson = (name: string | null) =>
  JSON.stringify({
    version: 1,
    ...(name === null ? {} : { folder: name }),
    notes: [{ type: "basic", front: "the otter swims", back: "выдра плывёт" }],
  });

afterEach(cleanup);

describe("useImport - папка из колоды", () => {
  it("выбирает существующую папку, если имя совпало", async () => {
    const repo = makeRepo([folder("f1", "Animals")]);
    const { result } = renderHook(() => useImport(), {
      wrapper: wrapper(repo),
    });

    await result.current.loadText(deckJson("Animals"));

    await waitFor(() => expect(result.current.folderId).toBe("f1"));
    // Новую не создаём - дозаливаем существующую колоду.
    expect(result.current.suggestedFolderName).toBe("");
  });

  it("сравнивает имя папки без учёта регистра", async () => {
    const repo = makeRepo([folder("f1", "Animals")]);
    const { result } = renderHook(() => useImport(), {
      wrapper: wrapper(repo),
    });

    await result.current.loadText(deckJson("animals"));

    await waitFor(() => expect(result.current.folderId).toBe("f1"));
  });

  it("предлагает имя из колоды, если такой папки ещё нет", async () => {
    const repo = makeRepo([folder("f1", "Verbs")]);
    const { result } = renderHook(() => useImport(), {
      wrapper: wrapper(repo),
    });

    await result.current.loadText(deckJson("Animals"));

    // Имя уходит заготовкой в окно создания папки - перенабирать не надо.
    await waitFor(() =>
      expect(result.current.suggestedFolderName).toBe("Animals"),
    );
    expect(result.current.folderId).toBeNull();
  });

  it("оставляет выбор пользователю, если папки в файле нет", async () => {
    const repo = makeRepo([folder("f1", "Animals")]);
    const { result } = renderHook(() => useImport(), {
      wrapper: wrapper(repo),
    });

    await result.current.loadText(deckJson(null));

    await waitFor(() => expect(result.current.deck).not.toBeNull());
    expect(result.current.folderId).toBeNull();
    expect(result.current.suggestedFolderName).toBe("");
  });
});
