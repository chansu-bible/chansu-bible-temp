import { useEffect, useState } from 'react'
import { parseRoute, type PageName, type Route } from './route.ts'
import Canon from './pages/Canon.tsx'
import Dashboard from './pages/Dashboard.tsx'
import Images from './pages/Images.tsx'
import Jobs from './pages/Jobs.tsx'
import Lexicon from './pages/Lexicon.tsx'
import Queue from './pages/Queue.tsx'
import Quiz from './pages/Quiz.tsx'
import Repo from './pages/Repo.tsx'
import Scenes from './pages/Scenes.tsx'

const NAV: { page: PageName; href: string; label: string }[] = [
  { page: 'dashboard', href: '#/', label: '대시보드' },
  { page: 'canon', href: '#/canon/characters', label: '설정집' },
  { page: 'scenes', href: '#/scenes/1', label: '장면' },
  { page: 'images', href: '#/images', label: '그림' },
  { page: 'lexicon', href: '#/lexicon', label: '원어 뜻' },
  { page: 'quiz', href: '#/quiz/1', label: '퀴즈' },
  { page: 'jobs', href: '#/jobs', label: '작업' },
  { page: 'queue', href: '#/queue', label: '검수 대기열' },
  { page: 'repo', href: '#/repo', label: '저장소' },
]

function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export default function App() {
  const route = useRoute()

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="관리 메뉴">
        <p className="brand">
          장면 성경
          <span>관리</span>
        </p>
        <ul>
          {NAV.map((item) => (
            <li key={item.page}>
              <a href={item.href} aria-current={route.page === item.page ? 'page' : undefined}>
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <main className="content">
        <Page route={route} />
      </main>
    </div>
  )
}

function Page({ route }: { route: Route }) {
  switch (route.page) {
    case 'dashboard':
      return <Dashboard />
    case 'canon':
      return <Canon key={route.kind} kind={route.kind} selectedId={route.id} />
    case 'scenes':
      return <Scenes chapter={route.chapter} sceneId={route.sceneId} />
    case 'images':
      return <Images />
    case 'lexicon':
      return <Lexicon filter={route.filter} />
    case 'quiz':
      return <Quiz chapter={route.chapter} />
    case 'jobs':
      return <Jobs />
    case 'queue':
      return <Queue />
    case 'repo':
      return <Repo />
  }
}
