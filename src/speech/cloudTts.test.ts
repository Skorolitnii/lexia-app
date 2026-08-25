import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cachedAudioUrl,
  cacheKey,
  cloudVoice,
  resetQuotaBlock,
  storageUrl,
  synthesizeAudioUrl,
} from "@/speech/cloudTts";

const CONFIG = {
  baseUrl: "https://proj.supabase.co",
  accessToken: async () => "jwt-test",
};

/** Ответ fetch с нужным статусом; тело - только для POST в функцию. */
function res(ok: boolean, body?: unknown, status = ok ? 200 : 500): Response {
  return { ok, status, json: async () => body } as Response;
}

// Пауза после 429 живёт в модуле и протекла бы в соседние случаи.
beforeEach(resetQuotaBlock);

describe("cacheKey", () => {
  it("одна фраза - один ключ (иначе платный синтез дублируется)", () => {
    const a = cacheKey("the otter swims", "en-US-AvaMultilingualNeural", 1);
    const b = cacheKey("the otter swims", "en-US-AvaMultilingualNeural", 1);
    expect(a).toBe(b);
  });

  it("лишние пробелы не плодят двойников", () => {
    const messy = cacheKey("  the   otter  swims ", "v", 1);
    const clean = cacheKey("the otter swims", "v", 1);
    expect(messy).toBe(clean);
  });

  it("регистр значим: он меняет интонацию, в отличие от словарного лукапа", () => {
    expect(cacheKey("OTTER", "v", 1)).not.toBe(cacheKey("otter", "v", 1));
  });

  it("голос и скорость входят в ключ - облако запекает их в файл", () => {
    const base = cacheKey("otter", "en-US-AvaMultilingualNeural", 1);
    expect(cacheKey("otter", "en-GB-SoniaNeural", 1)).not.toBe(base);
    expect(cacheKey("otter", "en-US-AvaMultilingualNeural", 1.25)).not.toBe(
      base,
    );
  });

  /**
   * Эталон. Ту же формулу считает Edge Function (`supabase/functions/tts`), и
   * разъехавшись, они дадут разные имена файлов: клиент будет вечно мазать
   * мимо кэша, а функция - синтезировать заново на каждый показ карточки.
   * Сломался этот тест - значит правку надо продублировать на сервере.
   */
  it("совпадает с эталоном (та же формула в Edge Function)", () => {
    expect(
      cacheKey("  the   otter swims ", "en-US-AvaMultilingualNeural", 1),
    ).toBe("55c25b879e2112c9");
  });

  /**
   * Ключ считается СИНХРОННО. Раньше он шёл через `crypto.subtle.digest`, и
   * промис на пути от клика до `audio.play()` съедал жест пользователя - на
   * iOS звук пропадал совсем, включая локальный фолбэк. Вернётся промис -
   * вернётся и немая озвучка на айфоне.
   */
  it("синхронный: промис на пути к play() стоил бы жеста на iOS", () => {
    expect(cacheKey("otter", "v", 1)).not.toBeInstanceOf(Promise);
    expect(typeof cacheKey("otter", "v", 1)).toBe("string");
  });

  it("дрожь плавающей точки не создаёт файл-двойник", () => {
    expect(cacheKey("otter", "v", 0.9500000000000001)).toBe(
      cacheKey("otter", "v", 0.95),
    );
  });
});

describe("cloudVoice", () => {
  it("язык выбирает голос синтеза; English всегда US", () => {
    expect(cloudVoice("en")).toContain("en-US");
    expect(cloudVoice("de")).toContain("de-DE");
    expect(cloudVoice("it")).toContain("it-IT");
  });
});

describe("storageUrl", () => {
  it("публичный путь без подписи: query-string ломал бы кэш service worker", () => {
    expect(storageUrl("https://proj.supabase.co", "abc")).toBe(
      "https://proj.supabase.co/storage/v1/object/public/tts/abc.mp3",
    );
  });

  it("хвостовой слэш в базовом URL не даёт двойного", () => {
    expect(storageUrl("https://proj.supabase.co/", "abc")).not.toContain(
      "co//storage",
    );
  });
});

describe("cachedAudioUrl", () => {
  it("даёт адрес, не трогая сеть", () => {
    // Проверять существование заранее нельзя: HEAD из `fetch` не перехватывает
    // service worker (destination `empty`), поэтому каждое воспроизведение
    // уходило бы в сеть мимо кэша, а на промахе давало шумный 400.
    const url = cachedAudioUrl("the otter swims", "en", 1, CONFIG);
    expect(url).toContain("/storage/v1/object/public/tts/");
    expect(url).toMatch(/[0-9a-f]{16}\.mp3$/);
  });

  it("облако выключено - адреса нет", () => {
    expect(cachedAudioUrl("the otter swims", "en", 1, null)).toBeNull();
  });

  it("адрес совпадает с тем, что вернёт синтез", async () => {
    // Разойдутся - файл ляжет по одному пути, а играться будет другой,
    // и каждая фраза синтезировалась бы заново на каждом показе.
    const guess = cachedAudioUrl("the otter swims", "en", 1, CONFIG);
    const made = "https://proj.supabase.co/storage/v1/object/public/tts/x.mp3";
    const fetchImpl = vi.fn().mockResolvedValue(res(true, { url: made }));
    await synthesizeAudioUrl("the otter swims", "en", 1, CONFIG, fetchImpl);

    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    const key = guess!.split("/").pop()!.replace(".mp3", "");
    expect(cacheKey(sent.text, sent.voice, sent.rate)).toBe(key);
  });
});

describe("synthesizeAudioUrl", () => {
  it("зовёт функцию и возвращает её адрес", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        res(true, { url: "https://proj.supabase.co/made.mp3" }),
      );

    const url = await synthesizeAudioUrl(
      "the otter swims",
      "en",
      1,
      CONFIG,
      fetchImpl,
    );

    expect(url).toBe("https://proj.supabase.co/made.mp3");
    expect(fetchImpl.mock.calls[0][0]).toContain("/functions/v1/tts");
  });

  it("облако выключено - молча null, озвучит локальный синтез", async () => {
    const fetchImpl = vi.fn();
    expect(
      await synthesizeAudioUrl("the otter swims", "en", 1, null, fetchImpl),
    ).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("без входа функцию не зовём - она проверяет JWT сессии", async () => {
    // Регрессия: клиент слал publishable-ключ вместо токена сессии, и функция
    // отвечала 401 на каждую фразу - облако не работало вовсе.
    const anon = { ...CONFIG, accessToken: async () => null };
    const fetchImpl = vi.fn();

    expect(
      await synthesizeAudioUrl("the otter swims", "en", 1, anon, fetchImpl),
    ).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("офлайн - null, а не исключение: это повод озвучить локально", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    expect(
      await synthesizeAudioUrl("the otter swims", "en", 1, CONFIG, fetchImpl),
    ).toBeNull();
  });

  it("отказ функции (сбой провайдера) - тоже null", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(false, undefined, 502));
    expect(
      await synthesizeAudioUrl("the otter swims", "en", 1, CONFIG, fetchImpl),
    ).toBeNull();
  });

  it("после 429 облако не трогаем - квота кончилась надолго", async () => {
    const limited = vi.fn().mockResolvedValue(res(false, undefined, 429));
    expect(
      await synthesizeAudioUrl("first phrase", "en", 1, CONFIG, limited),
    ).toBeNull();
    expect(limited).toHaveBeenCalledTimes(1);

    // Следующая фраза функцию уже не беспокоит.
    const after = vi.fn();
    expect(
      await synthesizeAudioUrl("second phrase", "en", 1, CONFIG, after),
    ).toBeNull();
    expect(after).not.toHaveBeenCalled();
  });

  it("обычный отказ паузу не включает - осечка могла быть разовой", async () => {
    const failed = vi.fn().mockResolvedValue(res(false, undefined, 502));
    expect(
      await synthesizeAudioUrl("first phrase", "en", 1, CONFIG, failed),
    ).toBeNull();

    const after = vi
      .fn()
      .mockResolvedValue(res(true, { url: "https://proj.supabase.co/ok.mp3" }));
    expect(
      await synthesizeAudioUrl("second phrase", "en", 1, CONFIG, after),
    ).not.toBeNull();
  });

  it("пустой текст не тратит запрос", async () => {
    const fetchImpl = vi.fn();
    expect(
      await synthesizeAudioUrl("   ", "en", 1, CONFIG, fetchImpl),
    ).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
