import { useEffect, useState } from "react";
import { useRepo } from "@/data/useRepo";
import { SelectField } from "@/components/SelectField";

/**
 * Настройки изучения. Пока одна - дневная норма новых слов: раньше она была
 * зашита в дефолты (20) и не показывалась, поэтому упереться в неё можно было
 * только через «Карточек нет, возвращайтесь позже», без шанса поменять.
 */

/** Норма новых карточек в день. 200 - верхний ручной режим для больших пресетов. */
const LIMITS = [5, 10, 15, 20, 30, 50, 100, 200];

export function StudySettings() {
  const repo = useRepo();
  const [limit, setLimit] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void repo.getSettings().then((s) => {
      if (active) setLimit(s.new_cards_per_day);
    });
    return () => {
      active = false;
    };
  }, [repo]);

  const save = (value: number) => {
    setLimit(value);
    setSaving(true);
    void repo
      .updateSettings({ new_cards_per_day: value })
      .finally(() => setSaving(false));
  };

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <div className="text-[14.5px] font-semibold text-ink">
          Новых карточек в день
        </div>
        <div className="mt-0.5 text-[12.5px] text-faint-2">
          Ограничивает только новые карточки. Повторы по расписанию всё равно
          появятся.
        </div>
      </div>
      <div className="shrink-0">
        <SelectField
          aria-label="Новых карточек в день"
          // Пока настройки грузятся, значения нет - select не должен показывать чужое.
          value={limit ?? ""}
          disabled={limit === null || saving}
          onChange={(value) => save(Number(value))}
          options={[
            ...(limit === null ? [{ value: "", label: "…" }] : []),
            ...LIMITS.map((n) => ({ value: String(n), label: String(n) })),
            // Значение из бэкапа может не совпасть со списком - показываем его,
            // иначе select молча съедет на первый пункт и «сохранит» его.
            ...(limit !== null && !LIMITS.includes(limit)
              ? [{ value: String(limit), label: String(limit) }]
              : []),
          ]}
        />
      </div>
    </div>
  );
}
