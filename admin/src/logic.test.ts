import { describe, expect, it } from 'vitest'
import { bookOptionLabel, chooseBook, readableBooks, readStoredBook, storeBook } from './bookChoice.ts'
import { checkForm, emptyEntry, entryToForm, fieldHint, fieldsOf, firstCitation, formToEntry } from './canonForm.ts'
import { citationLabel } from './citations.ts'
import { splitIds } from './ids.ts'
import {
  bookChoiceProblem,
  bookChoices,
  buildJobOptions,
  currentSourceLabel,
  describeOptions,
  droppedChapters,
  EMPTY_JOB_FORM,
  jobBookLabel,
  NO_SOURCE_BOOKS,
  pickBookChoice,
  readChapterRange,
  type JobForm,
} from './jobForm.ts'
import { countByFilter, matchesFilter, matchesQuery, searchKey } from './lexiconFilter.ts'
import { countStatuses, formToEdit, questionToForm, revertStatus, toEdit } from './quizForm.ts'
import { parseRoute, redirectHref, routeHref, switchBook } from './route.ts'
import type { BookId, BookSummary, Character, Era, LexiconEntry, Place, QuizQuestion, Thing } from './types.ts'

// 저장된 항목. 절 인용에 책이 붙어 있다.
const adam: Character = {
  id: 'adam',
  name: '아담',
  aliases: ['사람'],
  status: 'approved',
  facts: {
    firstAppearance: 'genesis 1:26',
    gender: '남',
    years: { born: 0, died: 930 },
    relations: [{ type: '아내', to: 'eve' }],
    attire: [{ from: 'genesis 3:21', description: '가죽옷' }],
    notes: '흙으로 지어진 사람',
    sources: ['genesis 1:26-27', 'genesis 2:7'],
  },
  design: { build: '건장함', face: '', hair: '검은 머리', skin: '', ageNotes: '', notes: '' },
  refs: ['adam-1.png'],
}

const eden: Place = {
  id: 'eden',
  name: '에덴',
  aliases: [],
  status: 'approved',
  facts: { firstAppearance: 'genesis 2:8', description: '동쪽의 동산', sources: ['genesis 2:8', 'genesis 2:10-14'] },
  location: { lat: 31.02, lng: 47.43, certainty: '추정' },
  design: { landscape: '강이 흐르는 평야', notes: '' },
}

const flood: Era = {
  id: 'flood',
  name: '홍수',
  status: 'draft',
  range: { from: 'genesis 6:9', to: 'genesis 8:22' },
  years: { from: 1656, to: null },
  facts: { description: '홍수', present: ['방주(6:14-16)'], absent: [], sources: ['genesis 6:9'] },
  design: { visualNotes: '' },
}

const ark: Thing = {
  id: 'ark',
  name: '방주',
  aliases: [],
  status: 'rejected',
  facts: { description: '잣나무로 만든 배', details: ['길이 300규빗', '삼층'], sources: ['genesis 6:14-16'] },
  design: { visualNotes: '네모난 상자 모양' },
}

describe('canonForm', () => {
  it('항목 → 폼 → 항목이 그대로 돌아온다(폼의 책 이름 인용이 책 id로 돌아온다)', () => {
    expect(formToEntry('characters', entryToForm('characters', adam), adam, 'genesis')).toEqual(adam)
    expect(formToEntry('places', entryToForm('places', eden), eden, 'genesis')).toEqual(eden)
    expect(formToEntry('eras', entryToForm('eras', flood), flood, 'genesis')).toEqual(flood)
    expect(formToEntry('things', entryToForm('things', ark), ark, 'genesis')).toEqual(ark)
    // 고른 책이 달라도 저장된 인용의 책은 그대로다
    expect(formToEntry('characters', entryToForm('characters', adam), adam, 'exodus')).toEqual(adam)
  })

  it('폼에는 절 인용을 책 이름으로 보인다', () => {
    const form = entryToForm('characters', adam)
    expect(form['facts.firstAppearance']).toBe('창세기 1:26')
    expect(form['facts.sources']).toBe('창세기 1:26-27\n창세기 2:7')
    expect(form['facts.attire']).toEqual([{ from: '창세기 3:21', description: '가죽옷' }])
    expect(form['facts.notes']).toBe('흙으로 지어진 사람')
    expect(entryToForm('eras', flood)['range.to']).toBe('창세기 8:22')
  })

  it('폼 값을 항목 형식으로 바꾼다', () => {
    const form = entryToForm('characters', adam)
    expect(form['facts.years.born']).toBe('0')

    form['facts.years.died'] = ''
    form['facts.sources'] = ' 1:26 \n\n2:7 '
    form['facts.relations'] = [
      { type: '아내', to: 'eve' },
      { type: '', to: '' },
    ]
    const out = formToEntry('characters', form, adam, 'genesis')
    expect(out.facts.years).toEqual({ born: 0, died: null })
    expect(out.facts.sources).toEqual(['genesis 1:26', 'genesis 2:7'])
    expect(out.facts.relations).toEqual([{ type: '아내', to: 'eve' }])
    expect(out.status).toBe('approved')
  })

  it('세 모양의 인용을 받아 책 id 모양으로 저장하고, 책 없는 인용에는 고른 책을 붙인다', () => {
    const form = entryToForm('characters', adam)
    form['facts.firstAppearance'] = '2:1'
    form['facts.attire'] = [
      { from: '3:21', description: '가죽옷' },
      { from: '창세기 3:7', description: '무화과나무 잎 치마' },
    ]
    form['facts.sources'] = '2:1-3\ngenesis 3:21\n사무엘상 3:4\npsalms 119:105'
    const out = formToEntry('characters', form, adam, 'exodus')
    expect(out.facts.firstAppearance).toBe('exodus 2:1')
    expect(out.facts.attire).toEqual([
      { from: 'exodus 3:21', description: '가죽옷' },
      { from: 'genesis 3:7', description: '무화과나무 잎 치마' },
    ])
    expect(out.facts.sources).toEqual(['exodus 2:1-3', 'genesis 3:21', '1-samuel 3:4', 'psalms 119:105'])

    const era = entryToForm('eras', flood)
    era['range.from'] = '6:9'
    expect(formToEntry('eras', era, flood, 'genesis').range).toEqual({ from: 'genesis 6:9', to: 'genesis 8:22' })
  })

  it('새 항목 초기값은 초안이고 비어 있다', () => {
    for (const kind of ['characters', 'places', 'eras', 'things'] as const) {
      const e = emptyEntry(kind)
      expect(e.status).toBe('draft')
      expect(formToEntry(kind, entryToForm(kind, e), e, 'genesis')).toEqual(e)
    }
    expect(emptyEntry('places').location).toEqual({ lat: null, lng: null, certainty: '불명' })
  })

  it('checkForm은 잘못된 값을 잡는다', () => {
    expect(checkForm('characters', entryToForm('characters', adam), 'genesis')).toEqual([])
    // 세 모양의 인용과 세 자리 장을 다 받는다
    const mixed = entryToForm('characters', adam)
    mixed['facts.firstAppearance'] = '2:7'
    mixed['facts.sources'] = 'genesis 1:26\n사무엘상 3:4\n2:7-8\npsalms 119:105\n시편 119:105'
    expect(checkForm('characters', mixed, 'genesis')).toEqual([])
    // 책 없는 인용은 고른 책이 있어야 한다
    expect(checkForm('characters', mixed, null)).toEqual([
      '첫 등장: 절 인용 형식이 아니에요 (2:7)',
      '근거 절: 절 인용 형식이 아니에요 (2:7-8)',
    ])
    // 그 책에 없는 장
    const outside = entryToForm('places', eden)
    outside['facts.firstAppearance'] = '창세기 51:1'
    expect(checkForm('places', outside, 'genesis')).toEqual(['첫 등장: 절 인용 형식이 아니에요 (창세기 51:1)'])

    const form = entryToForm('characters', emptyEntry('characters'))
    form.id = 'Adam'
    form['facts.years.born'] = '1.5'
    form['facts.attire'] = [{ from: '3장', description: '가죽옷' }]
    const problems = checkForm('characters', form, 'genesis')
    expect(problems.some((p) => p.startsWith('id'))).toBe(true)
    expect(problems.some((p) => p.startsWith('이름'))).toBe(true)
    expect(problems.some((p) => p.startsWith('첫 등장'))).toBe(true)
    expect(problems.some((p) => p.startsWith('태어난 해'))).toBe(true)
    expect(problems.some((p) => p.startsWith('옷차림 1행'))).toBe(true)
    expect(problems.some((p) => p.startsWith('근거 절'))).toBe(true)
  })

  it('firstCitation은 종류마다 맞는 절을 고르고, 목록에는 책 이름으로 보인다', () => {
    expect(firstCitation('characters', adam)).toBe('genesis 1:26')
    expect(firstCitation('eras', flood)).toBe('genesis 6:9')
    expect(firstCitation('things', ark)).toBe('genesis 6:14-16')
    expect(citationLabel(firstCitation('characters', adam))).toBe('창세기 1:26')
  })

  it('절 인용 칸의 안내에는 고른 책으로 든 예가 붙는다', () => {
    const field = (path: string) => fieldsOf('characters').find((f) => f.path === path)!
    expect(fieldHint(field('facts.firstAppearance'), 'exodus')).toBe('예: 2:7(출애굽기), 출애굽기 2:7, exodus 2:7')
    expect(fieldHint(field('facts.sources'), 'genesis')).toBe('한 줄에 하나. 예: 2:7(창세기), 창세기 2:7, genesis 2:7')
    expect(fieldHint(field('facts.sources'), null)).toBe('한 줄에 하나. 예: 창세기 2:7, genesis 2:7')
    expect(fieldHint(field('id'), 'genesis')).toBe('영문 소문자, 숫자, -')
    expect(fieldHint(field('facts.gender'), 'genesis')).toBeUndefined()
  })
})

const jobForm = (overrides: Partial<JobForm> = {}): JobForm => ({ ...EMPTY_JOB_FORM, ...overrides })

describe('jobForm', () => {
  it('단계마다 쓰는 옵션만 보낸다', () => {
    const form = jobForm({
      book: 'genesis',
      chapter: '3',
      chapters: '1-10',
      scenes: 'a, b c',
      force: true,
      allowDraft: true,
      dryRun: true,
      limit: '2',
    })
    expect(buildJobOptions('build', form)).toEqual({ ok: true, options: {} })
    expect(buildJobOptions('source', form)).toEqual({ ok: true, options: { book: 'genesis', chapters: '1-10' } })
    expect(buildJobOptions('canon', form)).toEqual({ ok: true, options: { book: 'genesis', chapter: 3, dryRun: true } })
    expect(buildJobOptions('tts', form)).toEqual({
      ok: true,
      options: { book: 'genesis', chapter: 3, force: true, limit: 2, dryRun: true },
    })
    expect(buildJobOptions('images', form)).toEqual({
      ok: true,
      options: { book: 'genesis', chapter: 3, scenes: ['a', 'b', 'c'], force: true, allowDraft: true, dryRun: true, limit: 2 },
    })
  })

  it('scenario와 review-text의 옵션', () => {
    const form = jobForm({
      book: 'genesis',
      chapter: '3',
      scenes: 'genesis-03-01 genesis-03-02',
      force: true,
      allowDraft: true,
      dryRun: true,
      limit: '2',
    })
    expect(buildJobOptions('scenario', form)).toEqual({ ok: true, options: { book: 'genesis', chapter: 3, force: true, dryRun: true } })
    expect(buildJobOptions('review-text', form)).toEqual({
      ok: true,
      options: { book: 'genesis', chapter: 3, scenes: ['genesis-03-01', 'genesis-03-02'], dryRun: true },
    })
    expect(buildJobOptions('review-text', { ...form, scenes: '' })).toEqual({
      ok: true,
      options: { book: 'genesis', chapter: 3, dryRun: true },
    })
    expect(buildJobOptions('scenario', { ...form, chapter: '' }).ok).toBe(false)
    expect(buildJobOptions('review-text', { ...form, chapter: '' }).ok).toBe(false)
  })

  it('original·original-gloss·quiz의 옵션', () => {
    const form = jobForm({ book: 'genesis', chapter: '4', scenes: 'a', force: true, allowDraft: true, dryRun: true, limit: '20' })
    expect(buildJobOptions('original', form)).toEqual({ ok: true, options: { book: 'genesis' } })
    // original은 책을 고르지 않으면("모든 책") 본문이 있는 모든 책이다
    expect(buildJobOptions('original', { ...form, book: '' })).toEqual({ ok: true, options: {} })
    expect(buildJobOptions('original-gloss', form)).toEqual({ ok: true, options: { limit: 20, force: true, dryRun: true } })
    expect(buildJobOptions('original-gloss', { ...form, chapter: '' }).ok).toBe(true)
    expect(buildJobOptions('quiz', form)).toEqual({ ok: true, options: { book: 'genesis', chapter: 4, force: true, dryRun: true } })
    expect(buildJobOptions('quiz', { ...form, chapter: '' }).ok).toBe(false)
  })

  it('장 단계와 source는 책을 골라야 한다', () => {
    for (const stage of ['source', 'canon', 'scenario', 'review-text', 'images', 'tts', 'quiz'] as const) {
      expect(buildJobOptions(stage, jobForm())).toEqual({ ok: false, error: '책을 고르세요' })
    }
    expect(buildJobOptions('canon', jobForm({ book: 'genesys' }))).toEqual({ ok: false, error: '모르는 책이에요 (genesys)' })
  })

  it('장 번호는 그 책의 장 수까지', () => {
    expect(buildJobOptions('canon', jobForm({ book: 'ruth', chapter: '4' })).ok).toBe(true)
    expect(buildJobOptions('canon', jobForm({ book: 'ruth', chapter: '5' }))).toEqual({ ok: false, error: '룻기는 4장까지 있어요' })
    expect(buildJobOptions('quiz', jobForm({ book: 'psalms', chapter: '150' })).ok).toBe(true)
  })

  it('source의 장 범위: 비우면 책 전체, 모양과 그 책의 장 수를 본다', () => {
    expect(buildJobOptions('source', jobForm({ book: 'exodus' }))).toEqual({ ok: true, options: { book: 'exodus' } })
    expect(buildJobOptions('source', jobForm({ book: 'exodus', chapters: ' 3 ' }))).toEqual({
      ok: true,
      options: { book: 'exodus', chapters: '3' },
    })
    expect(buildJobOptions('source', jobForm({ book: 'exodus', chapters: '1~10' }))).toEqual({
      ok: false,
      error: '장 범위는 3-7이나 3처럼 써요',
    })
    expect(buildJobOptions('source', jobForm({ book: 'exodus', chapters: '35-41' }))).toEqual({
      ok: false,
      error: '장 범위가 맞지 않아요: 35-41 (출애굽기 1~40장)',
    })
    expect(buildJobOptions('source', jobForm({ book: 'exodus', chapters: '7-3' })).ok).toBe(false)
    expect(buildJobOptions('source', jobForm({ book: 'exodus', chapters: '0' })).ok).toBe(false)
  })

  it('장 번호가 필요한 단계에서 빠지면 오류', () => {
    expect(buildJobOptions('canon', jobForm({ book: 'genesis', chapter: '' })).ok).toBe(false)
    expect(buildJobOptions('images', jobForm({ book: 'genesis', limit: '0' })).ok).toBe(false)
  })

  it('단계마다 고를 수 있는 책', () => {
    const withSource = ['genesis', 'exodus'] as const
    expect(bookChoices('canon', withSource)).toEqual([
      { value: 'genesis', label: '창세기' },
      { value: 'exodus', label: '출애굽기' },
    ])
    expect(bookChoices('original', withSource)).toEqual([
      { value: '', label: '모든 책' },
      { value: 'genesis', label: '창세기' },
      { value: 'exodus', label: '출애굽기' },
    ])
    // source는 본문이 없는 책도 고른다
    const source = bookChoices('source', withSource)
    expect(source.length).toBe(66)
    expect(source[0]).toEqual({ value: 'genesis', label: '창세기' })
    expect(source.at(-1)).toEqual({ value: 'revelation', label: '요한계시록' })
    expect(bookChoices('build', withSource)).toEqual([])
    expect(bookChoices('original-gloss', withSource)).toEqual([])
  })

  it('본문이 있는 책이 없으면 장 단계와 original은 고를 책이 없고 안내를 보인다', () => {
    for (const stage of ['canon', 'scenario', 'review-text', 'images', 'tts', 'quiz', 'original'] as const) {
      expect(bookChoices(stage, [])).toEqual([])
      expect(bookChoiceProblem(stage, bookChoices(stage, []))).toBe(NO_SOURCE_BOOKS)
    }
    expect(NO_SOURCE_BOOKS).toBe('본문이 있는 책이 없어요. 먼저 source를 실행하세요.')
    // source는 언제나 고를 수 있고, 책을 받지 않는 단계는 안내가 없다
    expect(bookChoiceProblem('source', bookChoices('source', []))).toBeNull()
    expect(bookChoiceProblem('build', bookChoices('build', []))).toBeNull()
    expect(bookChoiceProblem('original-gloss', bookChoices('original-gloss', []))).toBeNull()
    expect(bookChoiceProblem('canon', bookChoices('canon', ['genesis']))).toBeNull()
  })

  it('source 폼의 지금 본문과, 장 범위로 받으면 없어질 장', () => {
    const book = (overrides: Partial<BookSummary> = {}): BookSummary => ({
      id: 'genesis',
      name: '창세기',
      chapters: 50,
      sourceChapters: 10,
      sourceRange: { from: 1, to: 10 },
      ...overrides,
    })
    expect(currentSourceLabel(book())).toBe('1~10장 (10장)')
    expect(currentSourceLabel(book({ sourceChapters: 1, sourceRange: { from: 3, to: 3 } }))).toBe('3장 (1장)')
    expect(currentSourceLabel(undefined)).toBe('없음')
    expect(currentSourceLabel(book({ sourceChapters: 0, sourceRange: null, error: '깨짐' }))).toBe('읽지 못함')

    const current = { from: 1, to: 10 }
    expect(droppedChapters(readChapterRange('11-20'), current)).toBe('1~10장')
    expect(droppedChapters(readChapterRange('3-7'), current)).toBe('1~2장, 8~10장')
    expect(droppedChapters(readChapterRange('10'), current)).toBe('1~9장')
    expect(droppedChapters(readChapterRange('2-12'), current)).toBe('1장')
    // 지금 본문을 다 덮거나, 범위·본문이 없으면 없어질 장이 없다
    expect(droppedChapters(readChapterRange('1-10'), current)).toBeNull()
    expect(droppedChapters(readChapterRange(' 1-50 '), current)).toBeNull()
    expect(droppedChapters(readChapterRange(''), current)).toBeNull()
    expect(droppedChapters(readChapterRange('1~10'), current)).toBeNull()
    expect(droppedChapters(readChapterRange('3-7'), null)).toBeNull()
  })

  it('책 칸의 값: 고른 책, 이 단계에 없으면 머리에서 고른 책, 그것도 없으면 첫 책', () => {
    const original = bookChoices('original', ['genesis', 'exodus'])
    expect(pickBookChoice(original, null, 'exodus')).toBe('exodus')
    expect(pickBookChoice(original, '', 'exodus')).toBe('')
    expect(pickBookChoice(original, 'genesis', 'exodus')).toBe('genesis')
    // canon에는 "모든 책"이 없다
    const canon = bookChoices('canon', ['genesis', 'exodus'])
    expect(pickBookChoice(canon, '', 'exodus')).toBe('exodus')
    expect(pickBookChoice(canon, 'leviticus', null)).toBe('genesis')
    expect(pickBookChoice([], 'genesis', 'genesis')).toBe('')
  })

  it('옵션 설명과 책 칸', () => {
    expect(describeOptions({})).toBe('—')
    expect(describeOptions({ book: 'genesis', chapter: 1, dryRun: true })).toBe('1장 · 미리 보기')
    expect(describeOptions({ book: 'genesis', chapters: '1-10' })).toBe('1~10장')
    expect(jobBookLabel({ book: 'exodus', chapter: 1 })).toBe('출애굽기')
    // 책 없는 작업(original의 모든 책, build, original-gloss)은 모든 책을 함께 다룬다
    expect(jobBookLabel({})).toBe('모든 책')
    expect(jobBookLabel({ limit: 3 })).toBe('모든 책')
  })
})

describe('route', () => {
  // 본문이 있는 책
  const books = ['genesis', 'exodus'] as const
  const parse = (hash: string, book: BookId = 'genesis') => parseRoute(hash, books, book)
  const redirect = (hash: string, book: BookId = 'genesis') => redirectHref(hash, parse(hash, book))

  it('책을 가리는 화면의 주소를 읽는다', () => {
    expect(parse('#/genesis/dashboard')).toEqual({ page: 'dashboard', book: 'genesis' })
    expect(parse('#/exodus/dashboard')).toEqual({ page: 'dashboard', book: 'exodus' })
    expect(parse('#/exodus/scenes/3/exodus-03-01')).toEqual({ page: 'scenes', book: 'exodus', chapter: 3, sceneId: 'exodus-03-01' })
    expect(parse('#/exodus/scenes/x')).toEqual({ page: 'scenes', book: 'exodus', chapter: 1, sceneId: null })
    expect(parse('#/exodus/quiz/4')).toEqual({ page: 'quiz', book: 'exodus', chapter: 4 })
    expect(parse('#/exodus/quiz')).toEqual({ page: 'quiz', book: 'exodus', chapter: 1 })
    expect(parse('#/exodus/quiz/0')).toEqual({ page: 'quiz', book: 'exodus', chapter: 1 })
    expect(parse('#/exodus')).toEqual({ page: 'dashboard', book: 'exodus' })
  })

  it('옛 주소와 책이 없는 주소는 고른 책으로 읽는다', () => {
    expect(parse('', 'exodus')).toEqual({ page: 'dashboard', book: 'exodus' })
    expect(parse('#/', 'exodus')).toEqual({ page: 'dashboard', book: 'exodus' })
    expect(parse('#/scenes/4', 'exodus')).toEqual({ page: 'scenes', book: 'exodus', chapter: 4, sceneId: null })
    expect(parse('#/scenes/3/genesis-03-01')).toEqual({ page: 'scenes', book: 'genesis', chapter: 3, sceneId: 'genesis-03-01' })
    expect(parse('#/quiz/4', 'exodus')).toEqual({ page: 'quiz', book: 'exodus', chapter: 4 })
    expect(parse('#/nothing')).toEqual({ page: 'dashboard', book: 'genesis' })
  })

  it('모르는 책이나 본문이 없는 책은 고른 책으로 읽는다', () => {
    expect(parse('#/nobook/scenes/4', 'exodus')).toEqual({ page: 'scenes', book: 'exodus', chapter: 4, sceneId: null })
    expect(parse('#/nobook/quiz/2')).toEqual({ page: 'quiz', book: 'genesis', chapter: 2 })
    expect(parse('#/leviticus/dashboard', 'exodus')).toEqual({ page: 'dashboard', book: 'exodus' })
  })

  it('모든 책이 함께 쓰는 화면의 주소를 읽는다', () => {
    expect(parse('#/canon/places')).toEqual({ page: 'canon', kind: 'places', id: null })
    expect(parse('#/canon/eras/flood')).toEqual({ page: 'canon', kind: 'eras', id: 'flood' })
    expect(parse('#/canon/unknown')).toEqual({ page: 'canon', kind: 'characters', id: null })
    expect(parse('#/jobs')).toEqual({ page: 'jobs' })
    expect(parse('#/images')).toEqual({ page: 'images' })
    expect(parse('#/queue')).toEqual({ page: 'queue' })
    expect(parse('#/repo')).toEqual({ page: 'repo' })
    expect(parse('#/lexicon')).toEqual({ page: 'lexicon', filter: 'draft' })
    expect(parse('#/lexicon/none')).toEqual({ page: 'lexicon', filter: 'none' })
    expect(parse('#/lexicon/odd')).toEqual({ page: 'lexicon', filter: 'draft' })
  })

  it('경로를 만들고 다시 읽으면 같다', () => {
    const routes = [
      { page: 'dashboard', book: 'exodus' },
      { page: 'canon', kind: 'characters', id: 'adam' },
      { page: 'scenes', book: 'genesis', chapter: 2, sceneId: null },
      { page: 'scenes', book: 'exodus', chapter: 3, sceneId: 'exodus-03-02' },
      { page: 'queue' },
      { page: 'images' },
      { page: 'lexicon', filter: 'approved' },
      { page: 'lexicon', filter: 'all' },
      { page: 'quiz', book: 'exodus', chapter: 7 },
    ] as const
    for (const r of routes) expect(parse(routeHref(r))).toEqual(r)
    expect(routeHref({ page: 'images' })).toBe('#/images')
    expect(routeHref({ page: 'dashboard', book: 'genesis' })).toBe('#/genesis/dashboard')
    expect(routeHref({ page: 'scenes', book: 'genesis', chapter: 4, sceneId: 'genesis-04-01' })).toBe('#/genesis/scenes/4/genesis-04-01')
    expect(routeHref({ page: 'quiz', book: 'genesis', chapter: 4 })).toBe('#/genesis/quiz/4')
  })

  it('옛 주소와 고를 수 없는 책의 주소는 고른 책의 주소로 바꿔 쓴다', () => {
    expect(redirect('')).toBe('#/genesis/dashboard')
    expect(redirect('#/')).toBe('#/genesis/dashboard')
    expect(redirect('#/', 'exodus')).toBe('#/exodus/dashboard')
    expect(redirect('#/scenes/4')).toBe('#/genesis/scenes/4')
    expect(redirect('#/scenes/4/genesis-04-02')).toBe('#/genesis/scenes/4/genesis-04-02')
    expect(redirect('#/quiz/4', 'exodus')).toBe('#/exodus/quiz/4')
    expect(redirect('#/nobook/scenes/4', 'exodus')).toBe('#/exodus/scenes/4')
    expect(redirect('#/leviticus/quiz/2')).toBe('#/genesis/quiz/2')
    expect(redirect('#/exodus')).toBe('#/exodus/dashboard')
  })

  it('맞는 주소와 모든 책이 함께 쓰는 화면의 주소는 그대로 둔다', () => {
    expect(redirect('#/genesis/dashboard')).toBeNull()
    expect(redirect('#/exodus/scenes/4/exodus-04-01')).toBeNull()
    expect(redirect('#/exodus/quiz/4')).toBeNull()
    expect(redirect('#/canon/places')).toBeNull()
    expect(redirect('#/canon/unknown')).toBeNull()
    expect(redirect('#/lexicon')).toBeNull()
    expect(redirect('#/jobs')).toBeNull()
  })

  it('머리에서 책을 바꾸면 같은 종류의 화면으로 가고, 장면·퀴즈는 새 책의 1장이다', () => {
    expect(switchBook({ page: 'dashboard', book: 'genesis' }, 'exodus')).toEqual({ page: 'dashboard', book: 'exodus' })
    expect(switchBook({ page: 'scenes', book: 'genesis', chapter: 4, sceneId: 'genesis-04-02' }, 'exodus')).toEqual({
      page: 'scenes',
      book: 'exodus',
      chapter: 1,
      sceneId: null,
    })
    expect(switchBook({ page: 'quiz', book: 'genesis', chapter: 4 }, 'exodus')).toEqual({ page: 'quiz', book: 'exodus', chapter: 1 })
    const canon = { page: 'canon', kind: 'places', id: 'eden' } as const
    expect(switchBook(canon, 'exodus')).toBe(canon)
  })
})

describe('bookChoice', () => {
  it('기억한 책에 본문이 있으면 그 책, 아니면 첫 책, 본문이 있는 책이 없으면 null', () => {
    expect(chooseBook(['genesis', 'exodus'], 'exodus')).toBe('exodus')
    expect(chooseBook(['genesis', 'exodus'], 'leviticus')).toBe('genesis')
    expect(chooseBook(['genesis', 'exodus'], null)).toBe('genesis')
    expect(chooseBook([], 'genesis')).toBeNull()
  })

  it('저장소를 쓸 수 없어도 오류 없이 지나간다', () => {
    // 시험은 브라우저 밖에서 돌아 window가 없다.
    expect(readStoredBook()).toBeNull()
    expect(() => storeBook('genesis')).not.toThrow()
  })

  it('본문을 읽지 못한 책은 목록에 표시만 하고 고를 책에서 뺀다', () => {
    const genesis: BookSummary = { id: 'genesis', name: '창세기', chapters: 50, sourceChapters: 10, sourceRange: { from: 1, to: 10 } }
    const exodus: BookSummary = {
      id: 'exodus',
      name: '출애굽기',
      chapters: 40,
      sourceChapters: 0,
      sourceRange: null,
      error: 'content/source/exodus.json: Unexpected token',
    }
    expect(readableBooks([genesis, exodus])).toEqual([genesis])
    expect(bookOptionLabel(genesis)).toBe('창세기 · 10/50장')
    expect(bookOptionLabel(exodus)).toBe('출애굽기 · 읽지 못함')
    // 기억한 책을 읽지 못하면 읽을 수 있는 첫 책을 고른다
    expect(chooseBook(readableBooks([exodus, genesis]).map((b) => b.id), 'exodus')).toBe('genesis')
    expect(chooseBook(readableBooks([exodus]).map((b) => b.id), 'exodus')).toBeNull()
  })
})

const entry = (strong: string, korean: LexiconEntry['korean'], overrides: Partial<LexiconEntry> = {}): LexiconEntry => ({
  strong,
  lemma: 'רֵאשִׁית',
  xlit: 'rêʼshîyth',
  pos: 'n-f',
  definition: 'the first, in place, time, order or rank',
  usage: 'beginning, chief(-est)',
  count: 1,
  korean,
  ...overrides,
})

describe('lexiconFilter', () => {
  const draft = entry('H7225', { meaning: '처음, 시작', note: '1:1의 "태초"', status: 'draft' })
  const approved = entry('H776', { meaning: '땅', note: '', status: 'approved' }, { lemma: 'אֶרֶץ', xlit: 'ʼerets', definition: 'the earth' })
  const none = entry('H1', null, { lemma: 'אָב', xlit: 'ʼâb', definition: 'father', usage: 'chief' })

  it('거르기와 수', () => {
    expect(countByFilter([draft, approved, none])).toEqual({ draft: 1, approved: 1, none: 1, all: 3 })
    expect([draft, approved, none].filter((e) => matchesFilter(e, 'none'))).toEqual([none])
    expect([draft, approved, none].filter((e) => matchesFilter(e, 'all')).length).toBe(3)
  })

  it('발음 부호를 빼고 찾는다', () => {
    expect(searchKey('rêʼshîyth')).toBe('reshiyth')
    expect(searchKey('רֵאשִׁית')).toBe('ראשית')
    expect(searchKey('땅 Earth')).toBe('땅 earth')
  })

  it('번호·히브리어·음역·영어·한국어로 찾는다', () => {
    expect(matchesQuery(draft, '')).toBe(true)
    expect(matchesQuery(draft, 'h7225')).toBe(true)
    expect(matchesQuery(draft, '7225')).toBe(true)
    expect(matchesQuery(draft, 'ראשית')).toBe(true)
    expect(matchesQuery(draft, 'reshiyth')).toBe(true)
    expect(matchesQuery(draft, 'Rank')).toBe(true)
    expect(matchesQuery(draft, 'beginning')).toBe(true)
    expect(matchesQuery(draft, '시작')).toBe(true)
    expect(matchesQuery(draft, '태초')).toBe(true)
    expect(matchesQuery(approved, '시작')).toBe(false)
    expect(matchesQuery(none, '아버지')).toBe(false)
    expect(matchesQuery(none, 'ab')).toBe(true)
  })
})

const question = (overrides: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id: 'genesis-04-q1',
  question: '가인은 무엇을 드렸나요?',
  options: ['땅의 소산', '양의 첫 새끼', '비둘기', '금'],
  answer: 0,
  explanation: '가인은 땅의 소산을 드렸어요.',
  verse: 3,
  status: 'reviewed',
  issues: [],
  ...overrides,
})

describe('quizForm', () => {
  it('상태만 바꾼 저장 본문과 되돌릴 상태', () => {
    const q = question()
    expect(toEdit(q, 'approved')).toEqual({
      question: q.question,
      options: q.options,
      answer: 0,
      explanation: q.explanation,
      verse: 3,
      status: 'approved',
    })
    expect(toEdit(q).status).toBe('reviewed')
    expect(revertStatus(question({ status: 'approved' }))).toBe('reviewed')
    expect(revertStatus(question({ status: 'rejected', issues: ['정답이 둘이에요.'] }))).toBe('flagged')
  })

  it('상태별 수', () => {
    const counts = countStatuses([question(), question({ status: 'approved' }), question({ status: 'approved' })])
    expect(counts).toEqual({ draft: 0, reviewed: 1, flagged: 0, approved: 2, rejected: 0 })
  })

  it('폼 → 저장 본문은 공백을 떼고 상태를 그대로 둔다', () => {
    const form = { ...questionToForm(question({ status: 'flagged' })), question: ' 고친 질문인가요? ', verse: ' 4 ' }
    form.options = form.options.map((option) => ` ${option} `)
    expect(formToEdit(form, 'flagged')).toEqual({
      ok: true,
      edit: {
        question: '고친 질문인가요?',
        options: ['땅의 소산', '양의 첫 새끼', '비둘기', '금'],
        answer: 0,
        explanation: '가인은 땅의 소산을 드렸어요.',
        verse: 4,
        status: 'flagged',
      },
    })
  })

  it('빈 칸, 겹치는 보기, 잘못된 절 번호를 잡는다', () => {
    const form = questionToForm(question())
    expect(formToEdit({ ...form, question: '  ' }, 'reviewed')).toEqual({ ok: false, error: '질문을 넣으세요' })
    expect(formToEdit({ ...form, options: ['가', '', '다', '라'] }, 'reviewed')).toEqual({ ok: false, error: '2번 보기를 넣으세요' })
    expect(formToEdit({ ...form, options: ['가', '가 ', '다', '라'] }, 'reviewed').ok).toBe(false)
    expect(formToEdit({ ...form, explanation: '' }, 'reviewed').ok).toBe(false)
    for (const verse of ['', '0', '1.5', '셋']) expect(formToEdit({ ...form, verse }, 'reviewed').ok).toBe(false)
  })
})

describe('ids', () => {
  it('쉼표·공백·줄바꿈으로 나누고 빈 것은 버린다', () => {
    expect(splitIds('adam, eve\nseth  cain,,')).toEqual(['adam', 'eve', 'seth', 'cain'])
    expect(splitIds(' , \n ')).toEqual([])
    expect(splitIds('')).toEqual([])
  })
})
