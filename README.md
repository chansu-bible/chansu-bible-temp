# chansu-bible

장면으로 읽는 성경 목업입니다. 화면 위 절반에 장면 그림, 아래 절반에 성경 본문(개역한글)이 있고, 본문을 내려 읽으면 그림이 장면에 맞춰 바뀝니다.

설계 문서: [docs/superpowers/specs/2026-10-04-scene-bible-reader-design.md](docs/superpowers/specs/2026-10-04-scene-bible-reader-design.md)

## 구조

| 폴더 | 내용 |
|---|---|
| `app/` | 읽기 화면 (React + Vite + TypeScript) |
| `pipeline/` | 콘텐츠 생성 스크립트 (Node + TypeScript) |
| `content/` | 본문, 설정집, 장면, 그림 |

## 실행

```bash
npm install
npm run dev
```

## 명령

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 묶음을 만들고 읽기 화면을 띄운다 |
| `npm test` | 전체 테스트 |
| `npm run pipeline -- source` | 개역한글 창세기 1~10장을 받아 `content/source/genesis.json`에 저장한다 |
| `npm run pipeline -- build` | 본문·장면·장소를 합쳐 `app/public/content/`에 묶음을 만든다 |
