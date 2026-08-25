/**
 * Общие классы полей формы. Держим в одном месте, чтобы селекты и инпуты
 * в библиотеке и форме заметки не расходились по отступам и рамке.
 */
export const fieldCls =
  "w-full rounded-field border-[1.5px] border-line bg-card px-3.5 py-3 text-[15px] text-ink outline-none transition-[border-color,box-shadow] placeholder:text-hint focus:border-brand focus:shadow-focus";

export const labelCls =
  "mb-1.5 block text-[11px] font-extrabold tracking-[0.06em] text-label uppercase";

/** Селект со своей стрелкой - сам класс объявлен в `index.css` (`.select-field`). */
export const selectCls = "cursor-pointer select-field";

export const selectFieldCls = `${fieldCls} ${selectCls}`;

/** Названия типов заметок в интерфейсе (в данных остаются basic/cloze). */
export const TYPE_LABEL = {
  basic: "Слово или фраза",
  cloze: "Пропуск в тексте",
} as const;

/** Короткие подписи для бейджей в списке, где длинное не влезает. */
export const TYPE_BADGE = {
  basic: "слово",
  cloze: "пропуск",
} as const;
