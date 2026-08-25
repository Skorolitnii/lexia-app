import { Navigate } from 'react-router'

/**
 * Зона «Добавить» - не отдельный экран, а та же форма поверх библиотеки
 * (в макете добавление открывается модалкой). Импорт колоды - этап 7.
 */
export function AddPage() {
  return <Navigate to="/library?new=1" replace />
}
