import { describe, expect, it } from 'vitest'
import { checkForm, emptyEntry, entryToForm, formToEntry, firstCitation } from './canonForm.ts'
import { buildJobOptions, describeOptions, EMPTY_JOB_FORM } from './jobForm.ts'
import { parseRoute, routeHref } from './route.ts'
import type { Character, Era, Place, Thing } from './types.ts'

const adam: Character = {
  id: 'adam',
  name: '아담',
  aliases: ['사람'],
  status: 'approved',
  facts: {
    firstAppearance: '1:26',
    gender: '남',
    years: { born: 0, died: 930 },
    relations: [{ type: '아내', to: 'eve' }],
    attire: [{ from: '3:21', description: '가죽옷' }],
    notes: '흙으로 지어진 사람',
    sources: ['1:26-27', '2:7'],
  },
  design: { build: '건장함', face: '', hair: '검은 머리', skin: '', ageNotes: '', notes: '' },
  refs: ['adam-1.png'],
}

const eden: Place = {
  id: 'eden',
  name: '에덴',
  aliases: [],
  status: 'approved',
  facts: { firstAppearance: '2:8', description: '동쪽의 동산', sources: ['2:8', '2:10-14'] },
  location: { lat: 31.02, lng: 47.43, certainty: '추정' },
  design: { landscape: '강이 흐르는 평야', notes: '' },
}

const flood: Era = {
  id: 'flood',
  name: '홍수',
  status: 'draft',
  range: { from: '6:9', to: '8:22' },
  years: { from: 1656, to: null },
  facts: { description: '홍수', present: ['방주(6:14-16)'], absent: [], sources: ['6:9'] },
  design: { visualNotes: '' },
}

const ark: Thing = {
  id: 'ark',
  name: '방주',
  aliases: [],
  status: 'rejected',
  facts: { description: '잣나무로 만든 배', details: ['길이 300규빗', '삼층'], sources: ['6:14-16'] },
  design: { visualNotes: '네모난 상자 모양' },
}

describe('canonForm', () => {
  it('항목 → 폼 → 항목이 그대로 돌아온다', () => {
    expect(formToEntry('characters', entryToForm('characters', adam), adam)).toEqual(adam)
    expect(formToEntry('places', entryToForm('places', eden), eden)).toEqual(eden)
    expect(formToEntry('eras', entryToForm('eras', flood), flood)).toEqual(flood)
    expect(formToEntry('things', entryToForm('things', ark), ark)).toEqual(ark)
  })

  it('폼 값을 항목 형식으로 바꾼다', () => {
    const form = entryToForm('characters', adam)
    expect(form['facts.years.born']).toBe('0')
    expect(form['facts.sources']).toBe('1:26-27\n2:7')

    form['facts.years.died'] = ''
    form['facts.sources'] = ' 1:26 \n\n2:7 '
    form['facts.relations'] = [
      { type: '아내', to: 'eve' },
      { type: '', to: '' },
    ]
    const out = formToEntry('characters', form, adam)
    expect(out.facts.years).toEqual({ born: 0, died: null })
    expect(out.facts.sources).toEqual(['1:26', '2:7'])
    expect(out.facts.relations).toEqual([{ type: '아내', to: 'eve' }])
    expect(out.status).toBe('approved')
  })

  it('새 항목 초기값은 초안이고 비어 있다', () => {
    for (const kind of ['characters', 'places', 'eras', 'things'] as const) {
      const e = emptyEntry(kind)
      expect(e.status).toBe('draft')
      expect(formToEntry(kind, entryToForm(kind, e), e)).toEqual(e)
    }
    expect(emptyEntry('places').location).toEqual({ lat: null, lng: null, certainty: '불명' })
  })

  it('checkForm은 잘못된 값을 잡는다', () => {
    expect(checkForm('characters', entryToForm('characters', adam))).toEqual([])
    const form = entryToForm('characters', emptyEntry('characters'))
    form.id = 'Adam'
    form['facts.years.born'] = '1.5'
    form['facts.attire'] = [{ from: '3장', description: '가죽옷' }]
    const problems = checkForm('characters', form)
    expect(problems.some((p) => p.startsWith('id'))).toBe(true)
    expect(problems.some((p) => p.startsWith('이름'))).toBe(true)
    expect(problems.some((p) => p.startsWith('첫 등장'))).toBe(true)
    expect(problems.some((p) => p.startsWith('태어난 해'))).toBe(true)
    expect(problems.some((p) => p.startsWith('옷차림 1행'))).toBe(true)
    expect(problems.some((p) => p.startsWith('근거 절'))).toBe(true)
  })

  it('firstCitation은 종류마다 맞는 절을 고른다', () => {
    expect(firstCitation('characters', adam)).toBe('1:26')
    expect(firstCitation('eras', flood)).toBe('6:9')
    expect(firstCitation('things', ark)).toBe('6:14-16')
  })
})

describe('jobForm', () => {
  it('단계마다 쓰는 옵션만 보낸다', () => {
    const form = { chapter: '3', scenes: 'a, b c', force: true, allowDraft: true, dryRun: true, limit: '2' }
    expect(buildJobOptions('build', form)).toEqual({ ok: true, options: {} })
    expect(buildJobOptions('source', form)).toEqual({ ok: true, options: {} })
    expect(buildJobOptions('canon', form)).toEqual({ ok: true, options: { chapter: 3, dryRun: true } })
    expect(buildJobOptions('tts', form)).toEqual({ ok: true, options: { chapter: 3, force: true, limit: 2, dryRun: true } })
    expect(buildJobOptions('images', form)).toEqual({
      ok: true,
      options: { chapter: 3, scenes: ['a', 'b', 'c'], force: true, allowDraft: true, dryRun: true, limit: 2 },
    })
  })

  it('장 번호가 필요한 단계에서 빠지면 오류', () => {
    expect(buildJobOptions('canon', { ...EMPTY_JOB_FORM, chapter: '' }).ok).toBe(false)
    expect(buildJobOptions('images', { ...EMPTY_JOB_FORM, limit: '0' }).ok).toBe(false)
  })

  it('옵션 설명', () => {
    expect(describeOptions({})).toBe('—')
    expect(describeOptions({ chapter: 1, dryRun: true })).toBe('1장 · 미리 보기')
  })
})

describe('route', () => {
  it('해시를 읽는다', () => {
    expect(parseRoute('')).toEqual({ page: 'dashboard' })
    expect(parseRoute('#/')).toEqual({ page: 'dashboard' })
    expect(parseRoute('#/canon/places')).toEqual({ page: 'canon', kind: 'places', id: null })
    expect(parseRoute('#/canon/eras/flood')).toEqual({ page: 'canon', kind: 'eras', id: 'flood' })
    expect(parseRoute('#/canon/unknown')).toEqual({ page: 'canon', kind: 'characters', id: null })
    expect(parseRoute('#/scenes/3/s3-1')).toEqual({ page: 'scenes', chapter: 3, sceneId: 's3-1' })
    expect(parseRoute('#/scenes/x')).toEqual({ page: 'scenes', chapter: 1, sceneId: null })
    expect(parseRoute('#/jobs')).toEqual({ page: 'jobs' })
    expect(parseRoute('#/nothing')).toEqual({ page: 'dashboard' })
  })

  it('경로를 만들고 다시 읽으면 같다', () => {
    const routes = [
      { page: 'canon', kind: 'characters', id: 'adam' },
      { page: 'scenes', chapter: 2, sceneId: null },
      { page: 'queue' },
    ] as const
    for (const r of routes) expect(parseRoute(routeHref(r))).toEqual(r)
  })
})
