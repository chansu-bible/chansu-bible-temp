// 성경 66권. id는 파일 이름과 장면 id에 쓰는 영어 소문자, name은 개역한글 책 이름,
// osis는 원어 자료 파일 이름(OSHB의 Gen.xml 등)이다. 장마다 절 수는 본문에서 센다.
export type Testament = 'old' | 'new'

export const BOOKS = [
  { id: 'genesis', name: '창세기', testament: 'old', chapters: 50, osis: 'Gen' },
  { id: 'exodus', name: '출애굽기', testament: 'old', chapters: 40, osis: 'Exod' },
  { id: 'leviticus', name: '레위기', testament: 'old', chapters: 27, osis: 'Lev' },
  { id: 'numbers', name: '민수기', testament: 'old', chapters: 36, osis: 'Num' },
  { id: 'deuteronomy', name: '신명기', testament: 'old', chapters: 34, osis: 'Deut' },
  { id: 'joshua', name: '여호수아', testament: 'old', chapters: 24, osis: 'Josh' },
  { id: 'judges', name: '사사기', testament: 'old', chapters: 21, osis: 'Judg' },
  { id: 'ruth', name: '룻기', testament: 'old', chapters: 4, osis: 'Ruth' },
  { id: '1-samuel', name: '사무엘상', testament: 'old', chapters: 31, osis: '1Sam' },
  { id: '2-samuel', name: '사무엘하', testament: 'old', chapters: 24, osis: '2Sam' },
  { id: '1-kings', name: '열왕기상', testament: 'old', chapters: 22, osis: '1Kgs' },
  { id: '2-kings', name: '열왕기하', testament: 'old', chapters: 25, osis: '2Kgs' },
  { id: '1-chronicles', name: '역대상', testament: 'old', chapters: 29, osis: '1Chr' },
  { id: '2-chronicles', name: '역대하', testament: 'old', chapters: 36, osis: '2Chr' },
  { id: 'ezra', name: '에스라', testament: 'old', chapters: 10, osis: 'Ezra' },
  { id: 'nehemiah', name: '느헤미야', testament: 'old', chapters: 13, osis: 'Neh' },
  { id: 'esther', name: '에스더', testament: 'old', chapters: 10, osis: 'Esth' },
  { id: 'job', name: '욥기', testament: 'old', chapters: 42, osis: 'Job' },
  { id: 'psalms', name: '시편', testament: 'old', chapters: 150, osis: 'Ps' },
  { id: 'proverbs', name: '잠언', testament: 'old', chapters: 31, osis: 'Prov' },
  { id: 'ecclesiastes', name: '전도서', testament: 'old', chapters: 12, osis: 'Eccl' },
  { id: 'song-of-songs', name: '아가', testament: 'old', chapters: 8, osis: 'Song' },
  { id: 'isaiah', name: '이사야', testament: 'old', chapters: 66, osis: 'Isa' },
  { id: 'jeremiah', name: '예레미야', testament: 'old', chapters: 52, osis: 'Jer' },
  { id: 'lamentations', name: '예레미야애가', testament: 'old', chapters: 5, osis: 'Lam' },
  { id: 'ezekiel', name: '에스겔', testament: 'old', chapters: 48, osis: 'Ezek' },
  { id: 'daniel', name: '다니엘', testament: 'old', chapters: 12, osis: 'Dan' },
  { id: 'hosea', name: '호세아', testament: 'old', chapters: 14, osis: 'Hos' },
  { id: 'joel', name: '요엘', testament: 'old', chapters: 3, osis: 'Joel' },
  { id: 'amos', name: '아모스', testament: 'old', chapters: 9, osis: 'Amos' },
  { id: 'obadiah', name: '오바댜', testament: 'old', chapters: 1, osis: 'Obad' },
  { id: 'jonah', name: '요나', testament: 'old', chapters: 4, osis: 'Jonah' },
  { id: 'micah', name: '미가', testament: 'old', chapters: 7, osis: 'Mic' },
  { id: 'nahum', name: '나훔', testament: 'old', chapters: 3, osis: 'Nah' },
  { id: 'habakkuk', name: '하박국', testament: 'old', chapters: 3, osis: 'Hab' },
  { id: 'zephaniah', name: '스바냐', testament: 'old', chapters: 3, osis: 'Zeph' },
  { id: 'haggai', name: '학개', testament: 'old', chapters: 2, osis: 'Hag' },
  { id: 'zechariah', name: '스가랴', testament: 'old', chapters: 14, osis: 'Zech' },
  { id: 'malachi', name: '말라기', testament: 'old', chapters: 4, osis: 'Mal' },
  { id: 'matthew', name: '마태복음', testament: 'new', chapters: 28, osis: 'Matt' },
  { id: 'mark', name: '마가복음', testament: 'new', chapters: 16, osis: 'Mark' },
  { id: 'luke', name: '누가복음', testament: 'new', chapters: 24, osis: 'Luke' },
  { id: 'john', name: '요한복음', testament: 'new', chapters: 21, osis: 'John' },
  { id: 'acts', name: '사도행전', testament: 'new', chapters: 28, osis: 'Acts' },
  { id: 'romans', name: '로마서', testament: 'new', chapters: 16, osis: 'Rom' },
  { id: '1-corinthians', name: '고린도전서', testament: 'new', chapters: 16, osis: '1Cor' },
  { id: '2-corinthians', name: '고린도후서', testament: 'new', chapters: 13, osis: '2Cor' },
  { id: 'galatians', name: '갈라디아서', testament: 'new', chapters: 6, osis: 'Gal' },
  { id: 'ephesians', name: '에베소서', testament: 'new', chapters: 6, osis: 'Eph' },
  { id: 'philippians', name: '빌립보서', testament: 'new', chapters: 4, osis: 'Phil' },
  { id: 'colossians', name: '골로새서', testament: 'new', chapters: 4, osis: 'Col' },
  { id: '1-thessalonians', name: '데살로니가전서', testament: 'new', chapters: 5, osis: '1Thess' },
  { id: '2-thessalonians', name: '데살로니가후서', testament: 'new', chapters: 3, osis: '2Thess' },
  { id: '1-timothy', name: '디모데전서', testament: 'new', chapters: 6, osis: '1Tim' },
  { id: '2-timothy', name: '디모데후서', testament: 'new', chapters: 4, osis: '2Tim' },
  { id: 'titus', name: '디도서', testament: 'new', chapters: 3, osis: 'Titus' },
  { id: 'philemon', name: '빌레몬서', testament: 'new', chapters: 1, osis: 'Phlm' },
  { id: 'hebrews', name: '히브리서', testament: 'new', chapters: 13, osis: 'Heb' },
  { id: 'james', name: '야고보서', testament: 'new', chapters: 5, osis: 'Jas' },
  { id: '1-peter', name: '베드로전서', testament: 'new', chapters: 5, osis: '1Pet' },
  { id: '2-peter', name: '베드로후서', testament: 'new', chapters: 3, osis: '2Pet' },
  { id: '1-john', name: '요한일서', testament: 'new', chapters: 5, osis: '1John' },
  { id: '2-john', name: '요한이서', testament: 'new', chapters: 1, osis: '2John' },
  { id: '3-john', name: '요한삼서', testament: 'new', chapters: 1, osis: '3John' },
  { id: 'jude', name: '유다서', testament: 'new', chapters: 1, osis: 'Jude' },
  { id: 'revelation', name: '요한계시록', testament: 'new', chapters: 22, osis: 'Rev' },
] as const satisfies readonly { id: string; name: string; testament: Testament; chapters: number; osis: string }[]

export type Book = (typeof BOOKS)[number]
export type BookId = Book['id']

const byId = new Map<string, Book>(BOOKS.map((book) => [book.id, book]))
const byName = new Map<string, Book>(BOOKS.map((book) => [book.name, book]))
const order = new Map<string, number>(BOOKS.map((book, index) => [book.id, index]))

export function findBook(id: string): Book | undefined {
  return byId.get(id)
}

export function isBookId(value: string): value is BookId {
  return byId.has(value)
}

export function getBook(id: BookId): Book {
  const book = byId.get(id)
  if (!book) throw new Error(`알 수 없는 책입니다: ${id}`)
  return book
}

export function bookByName(name: string): Book | undefined {
  return byName.get(name)
}

// 성경 순서(0부터)
export function bookOrder(id: BookId): number {
  return order.get(id) ?? -1
}

// 책에 그 장이 있는지 본다. 장 번호는 1부터 그 책의 장 수까지의 정수다(창세기는 1~50장).
export function hasChapter(id: BookId, chapter: number): boolean {
  return Number.isInteger(chapter) && chapter >= 1 && chapter <= getBook(id).chapters
}

// 장 번호를 그 책의 장 수 자리수로 채운 파일 줄기: genesis-04, psalms-119, obadiah-1
export function chapterStem(id: BookId, chapter: number): string {
  const book = getBook(id)
  if (!hasChapter(id, chapter)) throw new Error(`${book.name}에는 ${chapter}장이 없습니다`)
  return `${book.id}-${String(chapter).padStart(String(book.chapters).length, '0')}`
}

// index는 1부터 센 장면 순서
export function sceneIdOf(book: BookId, chapter: number, index: number): string {
  return `${chapterStem(book, chapter)}-${String(index).padStart(2, '0')}`
}

// 장면 파일이 없는 장에 묶음이 넣는 장 하나짜리 장면
export function fallbackSceneIdOf(book: BookId, chapter: number): string {
  return `${chapterStem(book, chapter)}-00`
}

export function verseAudioName(book: BookId, chapter: number, verse: number): string {
  return `${chapterStem(book, chapter)}-${String(verse).padStart(3, '0')}.mp3`
}

export function quizQuestionId(book: BookId, chapter: number, number: number): string {
  return `${chapterStem(book, chapter)}-q${number}`
}

// "genesis-04" → { book: 'genesis', chapter: 4 }. 자리수가 규칙과 다르거나 그 장이 없으면 null
export function parseChapterStem(stem: string): { book: BookId; chapter: number } | null {
  const match = /^(.+)-(\d+)$/.exec(stem)
  if (!match) return null
  const book = findBook(match[1]!)
  if (!book) return null
  const chapter = Number(match[2])
  if (!hasChapter(book.id, chapter)) return null
  return chapterStem(book.id, chapter) === stem ? { book: book.id, chapter } : null
}

// "genesis-04-03" → { book: 'genesis', chapter: 4, index: 3 }
export function parseSceneId(id: string): { book: BookId; chapter: number; index: number } | null {
  const match = /^(.+)-(\d{2})$/.exec(id)
  if (!match) return null
  const stem = parseChapterStem(match[1]!)
  return stem ? { ...stem, index: Number(match[2]) } : null
}
