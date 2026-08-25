import { Navigate, Route, Routes } from 'react-router'
import { Sidebar } from '@/components/Sidebar'
import { TabBar } from '@/components/TabBar'
import { StudyPage } from '@/pages/StudyPage'
import { LibraryPage } from '@/pages/LibraryPage'
import { AddPage } from '@/pages/AddPage'
import { StatsPage } from '@/pages/StatsPage'
import { SettingsPage } from '@/pages/SettingsPage'

export function App() {
  return (
    <div className="flex h-full">
      {/* Десктоп: постоянный левый рейл */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* Контент + мобильный таб-бар */}
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-h-0 flex-1 overflow-y-auto bg-surface">
          <Routes>
            <Route path="/" element={<Navigate to="/study" replace />} />
            <Route path="/study" element={<StudyPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/add" element={<AddPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/study" replace />} />
          </Routes>
        </main>

        <div className="lg:hidden">
          <TabBar />
        </div>
      </div>
    </div>
  )
}
