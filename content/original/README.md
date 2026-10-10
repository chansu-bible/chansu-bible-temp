# 원어 자료

`npm run pipeline -- original`이 만든다. 한국어 뜻(`lexicon.json`의 `korean`)은 `original-gloss` 단계의 초안을 관리 도구에서 사람이 검수한 것이다.

| 파일 | 내용 | 출처와 이용 조건 |
|---|---|---|
| `<책 id>.json` | 책마다 본문에 있는 장의 절마다 히브리어 낱말, 스트롱 번호, 형태 부호(창세기는 `genesis.json`) | 본문은 웨스트민스터 레닌그라드 사본(WLC, 퍼블릭 도메인). 원형과 형태 분석은 [Open Scriptures Hebrew Bible](https://hb.openscriptures.org)(CC BY 4.0), [morphhb 커밋 3d15126f](https://github.com/openscriptures/morphhb/tree/3d15126fb1ef74867fc1434be1942e837932691f) |
| `lexicon.json` | 위 낱말에 나오는 스트롱 번호의 원형, 음역, 품사, 영어 정의, KJV 번역어, 횟수(모든 책 원어를 합친 수). 어느 책에도 나오지 않게 된 번호라도 한국어 뜻이 있으면 횟수 0으로 남긴다 | 스트롱 히브리어 사전(1894, 퍼블릭 도메인). XML판은 David Troidl, David Instone-Brewer가 정리해 Open Scriptures가 공개했다. [strongs 커밋 0acd2f25](https://github.com/openscriptures/strongs/tree/0acd2f251c2d35ff8db2dece4e0593979d3ac223)의 `hebrew/StrongHebrewG.xml` |

히브리어 절 번호는 같은 커밋의 OSHB `wlc/VerseMap.xml`(WLC와 KJV의 절 대응표)로 개역한글(KJV식) 절 번호에 맞췄고, 그래도 절 나눔이 다른 장(느헤미야 7장, 시편 72편, 아가 6장)에는 원어 자료를 넣지 않았다.

낱말은 칸틸레이션 부호와 형태소 구분(`/`)을 빼고 모음 부호는 남겼다.
