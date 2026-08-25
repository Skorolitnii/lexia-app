import { useRef, useState } from 'react'
import { Spinner } from '@/components/Loading'
import { PageShell } from '@/components/PageShell'
import { AccountPanel } from '@/supabase/AccountPanel'
import { SpeechSettings } from '@/speech/SpeechSettings'
import { StudySettings } from '@/study/StudySettings'
import { useRepo } from '@/data/useRepo'
import { backupFileName, BackupParseError, buildBackup, parseBackup } from '@/transfer/backup'
import { plural } from '@/study/format'

/** Скачать текст файлом - без этого «экспорт» некуда деть. */
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  // Отзыв только следующим тиком: `click()` лишь ставит скачивание в очередь,
  // и синхронный revoke - гонка. Chrome обычно успевает, WebKit (а это iPhone,
  // целевая платформа §1) заметно чаще отдаёт «файл не скачался».
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function Row({
  title,
  hint,
  children,
  danger,
}: {
  title: string
  hint?: string
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line-faint px-4 py-3.5 last:border-b-0">
      <div className="min-w-0">
        <div className={`text-[14.5px] font-semibold ${danger ? 'text-again' : 'text-ink'}`}>
          {title}
        </div>
        {hint && <div className="mt-0.5 text-[12.5px] text-faint-2">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

const btnCls =
  'flex cursor-pointer items-center gap-2 rounded-[10px] bg-rail px-3.5 py-2 text-[13px] font-bold text-muted-2 disabled:cursor-not-allowed disabled:opacity-60'

export function SettingsPage() {
  const repo = useRepo()
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  // Какая именно операция идёт, а не просто «занято»: флаг гейтит обе кнопки
  // разом (правильно - данные общие), но спиннер должен крутиться только на
  // нажатой, иначе экран заявляет о двух операциях вместо одной.
  const [running, setRunning] = useState<'export' | 'restore' | null>(null)
  const busy = running !== null

  const exportAll = async () => {
    if (busy) return
    setRunning('export')
    try {
      const data = await repo.exportAll()
      download(backupFileName(), JSON.stringify(buildBackup(data), null, 2))
      setStatus(
        `Выгружено ${data.notes.length} ${plural(data.notes.length, 'слово', 'слова', 'слов')} и ${data.cards.length} ${plural(data.cards.length, 'карточка', 'карточки', 'карточек')}`,
      )
    } finally {
      setRunning(null)
    }
  }

  const restore = async (file: File) => {
    if (busy) return
    setStatus(null)
    let backup
    try {
      backup = parseBackup(await file.text())
    } catch (e) {
      setStatus(e instanceof BackupParseError ? e.message : 'Не удалось прочитать файл')
      return
    }

    // Восстановление затирает всё - спрашиваем, показав, что именно придёт.
    const ok = window.confirm(
      `Восстановить из бэкапа?\n\n` +
        `В файле: ${backup.notes.length} заметок, ${backup.cards.length} карточек.\n\n` +
        `ВСЕ текущие данные, включая прогресс FSRS, будут заменены. Действие необратимо.`,
    )
    if (!ok) return

    setRunning('restore')
    try {
      await repo.replaceAll(backup)
      setStatus('Данные восстановлены. Перезагрузите страницу, чтобы увидеть их.')
    } catch {
      setStatus('Не удалось восстановить данные')
    } finally {
      setRunning(null)
    }
  }

  return (
    <PageShell title="Настройки">
      <div className="mb-3 text-[11px] font-extrabold tracking-[0.06em] text-label uppercase">
        Аккаунт
      </div>
      <div className="mb-6 rounded-[16px] bg-card shadow-card">
        <AccountPanel />
      </div>

      <div className="mb-3 text-[11px] font-extrabold tracking-[0.06em] text-label uppercase">
        Озвучка
      </div>
      <div className="mb-6 rounded-[16px] bg-card shadow-card">
        <SpeechSettings />
      </div>

      <div className="mb-3 text-[11px] font-extrabold tracking-[0.06em] text-label uppercase">
        Изучение
      </div>
      <div className="mb-6 rounded-[16px] bg-card shadow-card">
        <StudySettings />
      </div>

      <div className="mb-3 text-[11px] font-extrabold tracking-[0.06em] text-label uppercase">
        Данные
      </div>
      <div className="rounded-[16px] bg-card shadow-card">
        <Row title="Экспорт всех данных" hint="Полный бэкап">
          <button type="button" disabled={busy} onClick={() => void exportAll()} className={btnCls}>
            {running === 'export' && <Spinner size={13} />}
            {running === 'export' ? 'Выгружаю…' : 'Экспортировать'}
          </button>
        </Row>
        <Row title="Восстановить из бэкапа" hint="Заменит все текущие данные" danger>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className={btnCls}
          >
            {running === 'restore' && <Spinner size={13} />}
            {running === 'restore' ? 'Восстанавливаю…' : 'Выбрать файл'}
          </button>
        </Row>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0]
          if (picked) void restore(picked)
          e.target.value = ''
        }}
      />

      {status && (
        <div className="mt-3 rounded-[12px] bg-brand-wash px-4 py-3 text-[13.5px] font-semibold text-brand-ink">
          {status}
        </div>
      )}
    </PageShell>
  )
}
