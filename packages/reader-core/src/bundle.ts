import { bookByName, getBook, isBookId, type BookId } from './books.ts'
import type { Bundle } from './types.ts'

// 묶음의 책 id. bookId가 있으면 알려진 책일 때만 그것이다(모르는 책이면 이름이 맞아도 undefined다).
// bookId가 없는 옛 묶음은 book(한국어 이름)으로 찾는다. 찾지 못하면 undefined다.
function bundleBookId(bundle: Bundle): BookId | undefined {
  if (bundle.bookId === undefined) return bookByName(bundle.book)?.id
  return typeof bundle.bookId === 'string' && isBookId(bundle.bookId) ? bundle.bookId : undefined
}

// 묶음 본체가 이 앱이 읽을 수 있는 형식인지 본다. 아니면 오류를 던진다. 형식은 docs/content-bundle.md에 있다.
export function validateBundle(value: unknown): Bundle {
  if (typeof value !== 'object' || value === null) throw new Error('묶음이 비어 있습니다')
  const bundle = value as Bundle
  if (bundle.schemaVersion !== 1) throw new Error(`묶음 형식이 다릅니다 (schemaVersion ${String(bundle.schemaVersion)})`)
  if (!Array.isArray(bundle.chapters) || bundle.chapters.length === 0) throw new Error('묶음에 장이 없습니다')
  // 책: bookId가 없는 옛 묶음은 book(한국어 이름)으로 찾는다. 찾지 못하면 받지 않는다.
  // bookId가 있는데 모르는 책이면 이름이 맞아도 받지 않는다(이름으로 bookId를 대신하지 않는다).
  const bookId = bundleBookId(bundle)
  if (!bookId) throw new Error('묶음의 책을 알 수 없습니다')
  // bookId와 book(이름)이 둘 다 있으면 같은 책이어야 한다.
  if (bundle.bookId !== undefined && typeof bundle.book === 'string' && getBook(bookId).name !== bundle.book) {
    throw new Error(`묶음의 책 이름(${bundle.book})이 bookId(${bookId})와 다릅니다`)
  }
  return bundle
}

// 인물·시대·물건·낭독 길이·장면 낭독·원어·사전·퀴즈·출처는 나중에 더한 키라 옛 묶음에는 없다. 없으면 빈 값으로 채워 화면이 그대로 그려지게 한다.
// 책 id(bookId)도 옛 묶음에는 없어서 book(한국어 이름)으로 찾아 채운다. 책을 알 수 없으면 오류를 던진다(받을 묶음인지는 validateBundle이 본다).
export function fillMissing(bundle: Bundle): Bundle {
  const bookId = bundleBookId(bundle)
  if (!bookId) throw new Error('묶음의 책을 알 수 없습니다')
  return {
    ...bundle,
    bookId,
    characters: Array.isArray(bundle.characters) ? bundle.characters : [],
    eras: Array.isArray(bundle.eras) ? bundle.eras : [],
    things: Array.isArray(bundle.things) ? bundle.things : [],
    lexicon: bundle.lexicon && typeof bundle.lexicon === 'object' ? bundle.lexicon : {},
    sources: Array.isArray(bundle.sources) ? bundle.sources : [],
    chapters: bundle.chapters.map((chapter) => ({
      ...chapter,
      original: Array.isArray(chapter.original) ? chapter.original : null,
      quiz: Array.isArray(chapter.quiz) ? chapter.quiz : [],
      verses: chapter.verses.map((verse) => ({ ...verse, audioMs: verse.audioMs ?? null })),
      scenes: chapter.scenes.map((scene) => ({
        ...scene,
        characters: Array.isArray(scene.characters) ? scene.characters : [],
        audio: scene.audio ?? null,
        audioMs: scene.audioMs ?? null,
      })),
    })),
  }
}
