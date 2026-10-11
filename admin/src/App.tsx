import { useEffect, useState } from 'react'
import { api } from './api.ts'
import { bookOptionLabel, chooseBook, readableBooks, readStoredBook, storeBook } from './bookChoice.ts'
import { Empty, ErrorBox, Loading } from './components/Notice.tsx'
import { isBookRoute, navigate, parseRoute, redirectHref, routeHref, switchBook, type PageName, type Route } from './route.ts'
import Canon from './pages/Canon.tsx'
import Dashboard from './pages/Dashboard.tsx'
import Images from './pages/Images.tsx'
import Jobs from './pages/Jobs.tsx'
import Lexicon from './pages/Lexicon.tsx'
import Queue from './pages/Queue.tsx'
import Quiz from './pages/Quiz.tsx'
import Repo from './pages/Repo.tsx'
import Scenes from './pages/Scenes.tsx'
import type { BookId, BookSummary } from './types.ts'
import { useLoad } from './useLoad.ts'

const NO_BOOKS = '본문이 있는 책이 없습니다. 작업에서 source를 먼저 돌리세요.'
const NO_READABLE_BOOKS = '읽을 수 있는 본문이 없습니다. 왼쪽의 오류를 보고 본문 파일을 고치거나, 작업에서 source를 다시 돌리세요.'

// 고를 수 있는 책이 없을 때 책 화면의 주소에 쓰는 책. 그때 책 화면은 안내만 보인다.
const FALLBACK_BOOK: BookId = 'genesis'

// 메뉴. 책을 가리는 화면은 지금 책의 주소로 간다.
function navItems(book: BookId): { page: PageName; href: string; label: string }[] {
  return [
    { page: 'dashboard', href: routeHref({ page: 'dashboard', book }), label: '대시보드' },
    { page: 'canon', href: '#/canon/characters', label: '설정집' },
    { page: 'scenes', href: routeHref({ page: 'scenes', book, chapter: 1, sceneId: null }), label: '장면' },
    { page: 'images', href: '#/images', label: '그림' },
    { page: 'lexicon', href: '#/lexicon', label: '원어 뜻' },
    { page: 'quiz', href: routeHref({ page: 'quiz', book, chapter: 1 }), label: '퀴즈' },
    { page: 'jobs', href: '#/jobs', label: '작업' },
    { page: 'queue', href: '#/queue', label: '검수 대기열' },
    { page: 'repo', href: '#/repo', label: '저장소' },
  ]
}

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

export default function App() {
  const books = useLoad(api.getBooks, 'books')
  const hash = useHash()
  const [stored, setStored] = useState(readStoredBook)

  // 받은 책 목록(본문을 읽지 못한 책도 든다). 받기 전이거나 받지 못했으면 null이다.
  const list = books.data
  // 첫 목록 요청이 끝났다(받았거나 실패했다). 그 뒤로는 목록이 없어도 책과 상관없는 화면을 그린다.
  const settled = list !== null || books.error !== null
  const ids = readableBooks(list ?? []).map((b) => b.id)
  // 머리에서 고른 책: 기억한 책, 그 책의 본문을 읽을 수 없으면 첫 책
  const chosen = chooseBook(ids, stored)
  const route = parseRoute(hash, ids, chosen ?? FALLBACK_BOOK)
  // 책 화면이면 그 화면의 책, 아니면 고른 책. 고를 수 있는 책이 없으면 null이다.
  const book = isBookRoute(route) && ids.includes(route.book) ? route.book : chosen
  // 옛 주소와 고를 수 없는 책이 든 주소는 책 목록을 읽은 뒤 고른 책의 주소로 바꿔 쓴다(기록을 남기지 않는다).
  const redirect = list && ids.length > 0 ? redirectHref(hash, route) : null

  useEffect(() => {
    if (redirect) window.location.replace(redirect)
  }, [redirect])

  // 책 화면에서 본 책을 고른 책으로 둔다(다른 화면에서도 그 책을 쓴다). 기억한 책을 읽을 수 없으면 첫 책이 된다.
  if (book !== null && book !== stored) setStored(book)

  // 고른 책을 브라우저에 기억한다.
  useEffect(() => {
    if (book !== null) storeBook(book)
  }, [book])

  // 머리에서 책을 바꾸면 책 화면은 같은 종류의 새 책 화면으로 가고, 다른 화면은 그대로 둔다.
  function pickBook(next: BookId) {
    if (isBookRoute(route)) navigate(switchBook(route, next))
    else setStored(next)
  }

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="관리 메뉴">
        <p className="brand">
          장면 성경
          <span>관리</span>
        </p>
        <BookPicker books={list} book={book} error={books.error} onRetry={books.reload} onPick={pickBook} />
        <ul>
          {navItems(book ?? FALLBACK_BOOK).map((item) => (
            <li key={item.page}>
              <a href={item.href} aria-current={route.page === item.page ? 'page' : undefined}>
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <main className="content">
        {settled ? (
          <Page
            route={route}
            book={book}
            books={list ?? []}
            listError={list ? null : books.error}
            onRetryBooks={books.reload}
            onJobEnd={books.reload}
          />
        ) : (
          <div className="page">
            <Loading />
          </div>
        )}
      </main>
    </div>
  )
}

// 머리의 책 고르기. 본문을 읽은 책만 고를 수 있고, 본문 파일을 읽지 못한 책은 이름 옆에 표시하고 까닭을 아래에 보인다.
// 책 목록을 받지 못했으면(다시 받다가 실패한 것도) 그 오류와 다시 시도 단추를 보인다.
function BookPicker({
  books,
  book,
  error,
  onRetry,
  onPick,
}: {
  books: BookSummary[] | null
  book: BookId | null
  error: string | null
  onRetry: () => void
  onPick: (book: BookId) => void
}) {
  const failure = error && (
    <div className="book-note book-note-error" role="alert">
      <p>
        {books ? '책 목록을 다시 읽지 못했어요' : '책 목록을 읽지 못했어요'}: {error}
      </p>
      <button type="button" className="btn btn-small" onClick={onRetry}>
        다시 시도
      </button>
    </div>
  )
  if (books === null) return failure || null

  const broken = books.filter((b) => b.error)
  return (
    <div className="book-picker">
      {books.length === 0 ? (
        <p className="book-note">{NO_BOOKS}</p>
      ) : book === null ? (
        <p className="book-note">읽을 수 있는 본문이 없어요.</p>
      ) : (
        <>
          <label htmlFor="book-picker">책</label>
          <select
            id="book-picker"
            value={book}
            onChange={(e) => {
              const picked = books.find((b) => b.id === e.target.value && !b.error)
              if (picked) onPick(picked.id)
            }}
          >
            {books.map((b) => (
              <option key={b.id} value={b.id} disabled={Boolean(b.error)}>
                {bookOptionLabel(b)}
              </option>
            ))}
          </select>
        </>
      )}
      {broken.length > 0 && (
        <ul className="book-errors" aria-label="본문을 읽지 못한 책">
          {broken.map((b) => (
            <li key={b.id}>
              <strong>{b.name}</strong>: {b.error}
            </li>
          ))}
        </ul>
      )}
      {failure}
    </div>
  )
}

function Page({
  route,
  book,
  books,
  listError,
  onRetryBooks,
  onJobEnd,
}: {
  route: Route
  book: BookId | null
  // 받은 책 목록 전체(본문을 읽지 못한 책도 든다). 목록을 받지 못했으면 []이다.
  books: BookSummary[]
  listError: string | null
  onRetryBooks: () => void
  onJobEnd: () => void
}) {
  if (isBookRoute(route)) {
    // 책 목록을 받지 못하면 책 화면은 그 오류를 보인다. 다른 화면은 그대로 쓴다.
    if (listError) {
      return (
        <div className="page">
          <ErrorBox message={`책 목록을 읽지 못했어요: ${listError}`} onRetry={onRetryBooks} />
        </div>
      )
    }
    if (book === null) {
      return (
        <div className="page">
          <Empty>{books.length > 0 ? NO_READABLE_BOOKS : NO_BOOKS}</Empty>
        </div>
      )
    }
  }
  const readable = readableBooks(books)
  // 책마다 모으는 화면(그림, 검수 대기열)에 빠진 책을 알리는 데 쓴다.
  const unreadable = books.filter((b) => b.error).map((b) => b.name)
  switch (route.page) {
    case 'dashboard':
      return <Dashboard key={route.book} book={route.book} />
    case 'canon':
      return <Canon key={route.kind} kind={route.kind} selectedId={route.id} book={book} />
    case 'scenes':
      return <Scenes key={route.book} book={route.book} chapter={route.chapter} sceneId={route.sceneId} />
    case 'images':
      return <Images books={readable} unreadable={unreadable} listError={listError} />
    case 'lexicon':
      return <Lexicon filter={route.filter} />
    case 'quiz':
      return <Quiz key={route.book} book={route.book} chapter={route.chapter} />
    case 'jobs':
      return <Jobs book={book} books={books} listError={listError} onJobEnd={onJobEnd} />
    case 'queue':
      return <Queue books={readable} unreadable={unreadable} listError={listError} />
    case 'repo':
      return <Repo />
  }
}
