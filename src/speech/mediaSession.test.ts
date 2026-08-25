// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// `supported` в useSpeech вычисляется на уровне модуля, поэтому synthesis
// подменяем ДО импорта - иначе `speak` молча выходит по `!supported`.
vi.stubGlobal("speechSynthesis", {
  speak: () => {},
  cancel: () => {},
  getVoices: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
});

vi.stubGlobal(
  "SpeechSynthesisUtterance",
  class {
    constructor(public text: string) {}
    voice: unknown = null;
    lang = "";
    rate = 1;
    volume = 1;
  },
);

const { useSpeech } = await import("@/speech/useSpeech");

type Listener = () => void;

/** Дубль <audio>: настоящий элемент в jsdom не грузит src и не шлёт `ended`. */
class FakeAudio {
  src = "";
  paused = true;
  preload = "";
  listeners: Record<string, Listener[]> = {};
  constructor() {
    created.push(this);
  }
  addEventListener(t: string, f: Listener) {
    (this.listeners[t] ||= []).push(f);
  }
  removeAttribute(a: string) {
    if (a === "src") this.src = "";
  }
  load() {}
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  fire(t: string) {
    (this.listeners[t] || []).forEach((f) => f());
  }
}

let created: FakeAudio[] = [];

beforeEach(() => {
  created = [];
  vi.stubGlobal("navigator", {
    ...globalThis.navigator,
    mediaSession: { metadata: {}, playbackState: "playing" },
    audioSession: { type: "auto" },
  });
  vi.stubGlobal("Audio", FakeAudio);
});

/** Подменённый `navigator.audioSession` (WebKit-only, в lib.dom его нет). */
function audioSession(): { type: string } {
  return (navigator as unknown as { audioSession: { type: string } })
    .audioSession;
}

/** Текущее состояние подменённого `navigator.mediaSession`. */
function session(): MediaSession {
  return navigator.mediaSession;
}

describe("audio session type", () => {
  it("озвучка объявляет сессию transient, а не playback", () => {
    const { result } = renderHook(() => useSpeech({ rate: 1 }));
    // До первого воспроизведения - дефолт WebKit.
    expect(audioSession().type).toBe("auto");

    act(() => {
      result.current.play({
        url: "https://x/word.mp3",
        text: "word",
        language: "en",
        cloud: false,
      });
    });

    // `auto` дал бы WebKit повысить сессию до `playback` и завести карточку
    // плеера в Пункте управления - именно это и был баг.
    expect(audioSession().type).toBe("transient");
  });

  it("локальный синтез (мимо unlock) тоже объявляет transient", () => {
    const { result } = renderHook(() => useSpeech({ rate: 1 }));
    act(() => result.current.speak("hello"));
    expect(audioSession().type).toBe("transient");
  });
});

describe("media session release", () => {
  it("ended у реальной озвучки гасит карточку плеера", () => {
    const { result } = renderHook(() => useSpeech({ rate: 1 }));
    act(() => {
      result.current.play({
        url: "https://x/word.mp3",
        text: "word",
        language: "en",
        cloud: false,
      });
    });
    const audio = created[0];
    act(() => audio.fire("ended"));
    expect(audio.src).toBe("");
    expect(session().playbackState).toBe("none");
  });

  it("перехват другой озвучкой гасит карточку от прерванной", () => {
    const { result } = renderHook(() => useSpeech({ rate: 1 }));
    act(() => {
      result.current.play({
        url: "https://x/a.mp3",
        text: "a",
        language: "en",
        cloud: false,
      });
    });
    const audio = created[0];
    act(() => {
      result.current.play({
        url: "https://x/b.mp3",
        text: "b",
        language: "en",
        cloud: false,
      });
    });
    expect(audio.src).toBe("https://x/b.mp3");
    // `ended` по первой фразе не придёт никогда - карточку гасит сам `playUrl`.
    expect(session().playbackState).toBe("none");
  });

  it("размонтирование провайдера отпускает элемент и гасит карточку", () => {
    const { result, unmount } = renderHook(() => useSpeech({ rate: 1 }));
    act(() => {
      result.current.play({
        url: "https://x/a.mp3",
        text: "a",
        language: "en",
        cloud: false,
      });
    });
    const audio = created[0];
    unmount();
    expect(audio.src).toBe("");
    expect(session().playbackState).toBe("none");
  });
});
