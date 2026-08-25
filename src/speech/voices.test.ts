import { describe, expect, it } from "vitest";
import {
  deviceVoices,
  englishVoices,
  pickVoice,
  type VoiceLike,
} from "@/speech/voices";

const v = (lang: string, name: string, voiceURI = name): VoiceLike => ({
  lang,
  name,
  voiceURI,
});

const GOOGLE_UK_MALE = v("en-GB", "Google UK English Male");
const GOOGLE_US = v("en-US", "Google US English");
const GOOGLE_DE = v("de-DE", "Google Deutsch");
const GOOGLE_IT = v("it-IT", "Google italiano");
const DANIEL = v("en-GB", "Дэниэл", "com.apple.voice.daniel");
const KAREN = v("en-AU", "Карен", "com.apple.voice.karen");
const FRED = v("en-US", "Fred");
const ZARVOX = v("en-US", "Zarvox"); // novelty - в чёрном списке
const RU = v("ru-RU", "Milena");

describe("pickVoice", () => {
  it("без выбора берёт пригодный голос выбранного языка", () => {
    expect(pickVoice([RU, ZARVOX, GOOGLE_DE], "de")).toBe(GOOGLE_DE);
  });

  it("для English предпочитает US, а не UK", () => {
    expect(pickVoice([GOOGLE_UK_MALE, GOOGLE_US], "en")).toBe(GOOGLE_US);
  });

  it("умеет выбирать итальянский голос", () => {
    expect(pickVoice([GOOGLE_US, GOOGLE_IT], "it")).toBe(GOOGLE_IT);
  });

  it("предпочитает качественный голос компактному", () => {
    // Ради этого и затевалась загрузка голосов: premium должен побеждать.
    const compact = v("en-US", "Samantha", "samantha.compact");
    const premium = v("en-US", "Ava (Premium)", "ava.premium");
    expect(pickVoice([compact, premium], "en")).toBe(premium);
  });

  it("деградирует к языковой семье, если пригодных нет (одни novelty)", () => {
    expect(pickVoice([RU, ZARVOX], "en")).toBe(ZARVOX);
  });

  it("деградирует к любому голосу, если нужного языка нет вовсе", () => {
    expect(pickVoice([RU], "de")).toBe(RU);
  });

  it("возвращает null на пустом списке (голоса ещё не загружены)", () => {
    expect(pickVoice([], "en")).toBeNull();
  });

  it("закреплённый голос перекрывает дефолт", () => {
    expect(pickVoice([GOOGLE_US, DANIEL], "en", "com.apple.voice.daniel")).toBe(
      DANIEL,
    );
  });

  it("игнорирует закреплённый голос, если его больше нет на устройстве", () => {
    // Голос удалили из ОС - не падаем, берём дефолт.
    expect(pickVoice([GOOGLE_US], "en", "com.apple.voice.fred")).toBe(
      GOOGLE_US,
    );
  });

  it("ловит Apple-голос под англоязычной локалью системы", () => {
    const daniel = v("en-GB", "Daniel", "com.apple.voice.daniel");
    expect(pickVoice([RU, daniel], "en")).toBe(daniel);
  });
});

describe("deviceVoices", () => {
  it("показывает голоса всех локалей выбранного языка", () => {
    // Ручной выбор - это всё, что реально умеет устройство. На iPhone WebKit
    // отдаёт лишь базовый compact-набор, и сужение до US/UK оставляло из него
    // два имени.
    const list = deviceVoices(
      [DANIEL, KAREN, v("en-IE", "Мойра"), v("en-ZA", "Тесса")],
      "en",
    );
    expect(list).toHaveLength(4);
  });

  it("показывает немецкие голоса для немецкого языка", () => {
    expect(
      deviceVoices([GOOGLE_US, GOOGLE_DE, v("de-AT", "Инга")], "de"),
    ).toHaveLength(2);
  });

  it("всё ещё прячет novelty", () => {
    // По «Зарвоксу» произношение не учат ни на какой локали.
    expect(deviceVoices([ZARVOX, v("en-US", "Колокольчик")], "en")).toEqual([]);
  });

  it("не пускает чужие локали", () => {
    expect(
      deviceVoices([RU, v("ja-JP", "Flo (японский (Япония))", "flo.ja")], "en"),
    ).toEqual([]);
  });
});

describe("englishVoices", () => {
  it("оставляет English US, кроме novelty и старых compact", () => {
    // UK/KAREN/FRED - мимо: English default теперь только US.
    const list = englishVoices([RU, DANIEL, GOOGLE_US, FRED, ZARVOX, KAREN]);
    expect(list.map((x) => x.name)).toEqual(["Google US English"]);
  });

  it("отсекает английский за пределами US", () => {
    const regional = [
      v("en-GB", "Дэниэл"),
      v("en-AU", "Карен"),
      v("en-IE", "Мойра"),
      v("en-IN", "Риши"),
      v("en-ZA", "Тесса"),
    ];
    expect(englishVoices(regional)).toEqual([]);
  });

  it("пропускает голос, которого не было в старом белом списке", () => {
    // Ровно тот баг: скачанный Enhanced-голос молча исчезал из настроек.
    const allison = v(
      "en-US",
      "Allison (Enhanced)",
      "com.apple.voice.enhanced.allison",
    );
    expect(englishVoices([allison])).toEqual([allison]);
  });

  it("дедупит один голос, продублированный под разными языками", () => {
    const dupA = v("en-US", "Google US English", "google-us");
    const dupB = v("en-US", "Google US English", "google-us");
    expect(englishVoices([dupA, dupB])).toHaveLength(1);
  });

  it("отсекает неанглийские версии голоса", () => {
    const en = v("en-US", "Flo (английский (США))", "flo.en");
    const ja = v("ja-JP", "Flo (японский (Япония))", "flo.ja");
    const ko = v("ko-KR", "Flo (корейский)", "flo.ko");
    expect(englishVoices([en, ja, ko])).toEqual([en]);
  });

  it("отсекает UK версию одного голоса: English звучит только US", () => {
    const uk = v("en-GB", "Eddy (английский (Великобритания))", "eddy.uk");
    const us = v(
      "en-US",
      "Eddy (английский (Соединенные Штаты Америки))",
      "eddy.us",
    );
    expect(englishVoices([uk, us])).toEqual([us]);
  });

  it("из нескольких версий одного голоса оставляет лучшую по качеству", () => {
    const compact = v("en-US", "Ava", "ava.compact");
    const premium = v("en-US", "Ava (Premium)", "ava.premium");
    const list = englishVoices([compact, premium]);
    expect(list).toHaveLength(1);
    expect(list[0]).toBe(premium);
  });

  it("сортирует качественные голоса выше компактных", () => {
    const compact = v("en-US", "Aaron", "aaron.compact");
    const enhanced = v("en-US", "Tom (Enhanced)", "tom.enhanced");
    const premium = v("en-US", "Zoe (Premium)", "zoe.premium");
    // По алфавиту порядок был бы обратным - качество важнее.
    expect(
      englishVoices([compact, enhanced, premium]).map((x) => x.name),
    ).toEqual(["Zoe (Premium)", "Tom (Enhanced)", "Aaron"]);
  });

  it("держит голоса Google наверху списка", () => {
    // Суффикса качества у них нет, но они лучше системных compact и были
    // дефолтом на десктопе - в хвосте алфавита им не место.
    const list = englishVoices([
      DANIEL,
      v("en-US", "Саманта"),
      GOOGLE_US,
      GOOGLE_UK_MALE,
    ]);
    expect(list.slice(0, 1).map((x) => x.name)).toEqual(["Google US English"]);
  });

  it("отсеивает novelty вместе с суффиксом качества", () => {
    expect(
      englishVoices([v("en-US", "Whisper (Premium)"), v("en-US", "Bells")]),
    ).toEqual([]);
  });

  it("отсеивает novelty под русской локалью системы", () => {
    // Реальный список с русской macOS: Apple переводит имена, и фильтр
    // только по английским именам не отсекал тут ничего.
    const junk = [
      v("en-US", "Колокольчик"),
      v("en-US", "Зарвокс"),
      v("en-US", "Шепот"),
      v("en-US", "Орган"),
      v("en-US", "Пузырьки"),
      v("en-US", "Плохие новости"),
      v("en-US", "Суперзвезда"),
      v("en-US", "Прыг-скок"),
      v("en-US", "Виолончель"),
      v("en-US", "Триноид"),
      v("en-US", "Шутник"),
      v("en-US", "Альберт"),
      v("en-US", "Бах"),
      v("en-US", "Воббл"),
      v("en-US", "Джуниор"),
      v("en-US", "Ральф"),
    ];
    expect(englishVoices(junk)).toEqual([]);
  });

  it("отсеивает Grandma/Grandpa/Rocko с языком в скобках", () => {
    const junk = [
      v("en-GB", "Grandma (английский (Великобритания))", "grandma.uk"),
      v(
        "en-US",
        "Grandpa (английский (Соединенные Штаты Америки))",
        "grandpa.us",
      ),
      v("en-US", "Rocko (английский (Соединенные Штаты Америки))", "rocko.us"),
    ];
    expect(englishVoices(junk)).toEqual([]);
  });

  it("оставляет нормальные голоса рядом с novelty", () => {
    // Eddy/Flo/Reed/Sandy/Shelley - живые голоса Apple, не мусор.
    const eddy = v("en-GB", "Eddy (английский (Великобритания))", "eddy.uk");
    const shelley = v("en-US", "Shelley (английский (США))", "shelley.us");
    const list = englishVoices([eddy, v("en-US", "Колокольчик"), shelley]);
    expect(list).toEqual([shelley]);
  });
});

describe("englishVoices", () => {
  it("автоподбор держится US", () => {
    expect(englishVoices([GOOGLE_UK_MALE, KAREN, v("en-IE", "Мойра")])).toEqual(
      [],
    );
  });

  it("novelty не проходит", () => {
    // По «Зарвоксу» произношение не учат.
    expect(englishVoices([ZARVOX, v("en-US", "Колокольчик")])).toEqual([]);
  });

  it("неанглийские локали не проходят", () => {
    expect(
      englishVoices([RU, v("ja-JP", "Flo (японский (Япония))", "flo.ja")]),
    ).toEqual([]);
  });
});
