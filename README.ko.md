# hwpkit

**한글 문서(`.hwp` / `.hwpx`)를 Claude · Cowork · Codex · Cursor · Gemini CLI · 명령줄에서 읽고 쓰고 미리보는 도구 — 전부 로컬에서, 서버도 업로드도 없이.**

[![CI](https://github.com/yuyu04/hwpkit/actions/workflows/ci.yml/badge.svg)](https://github.com/yuyu04/hwpkit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-339933)](https://nodejs.org)
[![English](https://img.shields.io/badge/docs-English-lightgrey)](README.md)

Claude과 그 위에 올라간 문서 도구들(**Claude Cowork** 등)은 `.docx` · `.pptx` · `.xlsx` ·
`.pdf` · 마크다운은 다루지만 **`.hwp` / `.hwpx`는 못 다룹니다.** 런타임에 HWP 라이브러리가
없기 때문입니다. hwpkit이 그 구멍을 메웁니다. [rhwp](https://github.com/edwardkim/rhwp)
엔진(WebAssembly 컴파일)과 작은 Node.js 스크립트를 **에이전트 스킬 / 플러그인**으로 묶어,
전부 내 환경 안에서 돌아가게 합니다.

<p align="center">
  <img src="docs/images/sample-hwp-p1.png" width="600"
       alt="hwpkit이 생성한 한글 문서: 제목 위계, 양쪽 정렬 본문, 불릿, 번호 목록, 네이티브 HWP 표">
</p>

<p align="center">
  <em><a href="examples/sample.md">examples/sample.md</a> → <a href="examples/sample.hwp">sample.hwp</a>를 <code>hwp-preview.mjs</code>로 렌더한 결과 — 한컴오피스 없이 만들었습니다.</em>
</p>

## 무엇을 하나

| | |
| --- | --- |
| **읽기** | `.hwp` / `.hwpx` → 텍스트(표 안의 내용까지). Claude가 한글 문서를 요약·인용·번역·분석할 수 있게 됩니다. |
| **쓰기** | 마크다운 → `.hwp` / `.hwpx`. 제목 위계, 본문 타이포그래피, 불릿, 번호 목록, 문장 중간 강조, 네이티브 HWP 표까지. |
| **미리보기** | `.hwp` / `.hwpx` → SVG 또는 PNG. **한컴오피스 없이** macOS · Linux에서 바로 봅니다. |

모든 변환은 로컬(Cowork VM 또는 내 컴퓨터)에서 일어납니다. 서버도 업로드도 없고 문서가
환경 밖으로 나가지 않습니다.

## 빠른 시작

### Claude Cowork

Cowork는 Node.js가 설치된 리눅스 VM에서 돌아가므로 hwpkit 스크립트가 그 안에서 실행됩니다.
두 가지 방법이 있고 **방법 A가 가장 확실합니다.**

**방법 A — 작업 폴더에 클론해서 스크립트 실행 (권장)**

1. Cowork에 접근 권한을 준 폴더에서:
   ```bash
   git clone https://github.com/yuyu04/hwpkit
   ```
   (`node_modules`와 rhwp WASM이 함께 커밋돼 있어 **`npm install`이 필요 없습니다**.)
2. 그다음 이렇게 요청하면 됩니다:
   - **읽기:** *"이 hwp를 hwpkit/scripts/hwp-read.mjs로 읽어줘"*
   - **쓰기:** *"이 내용을 마크다운으로 정리한 뒤 hwpkit/scripts/hwp-write.mjs로 hwp로 저장해줘"*

**방법 B — Cowork 플러그인으로 설치 (스킬이 자동 발동)**

Cowork → **Customize → Plugins → add a custom plugin**에서 GitHub 소스 `yuyu04/hwpkit`을
넣습니다. 설치하면 `.hwp` / `.hwpx`를 읽거나 만들어 달라고 할 때 스킬이 자동으로 발동하므로
스크립트 경로를 말할 필요가 없습니다.

> GitHub 저장소로 플러그인을 추가하는 기능은 아직 베타입니다. 연결이 안 되면 저장소를 ZIP으로
> 받아 "upload a custom plugin file"로 올리거나, 방법 A를 쓰세요.

### Claude Code

```bash
git clone https://github.com/yuyu04/hwpkit
claude --plugin-dir ./hwpkit
```

### MCP 클라이언트 전부 (Gemini CLI, Codex, Cursor, VS Code, Claude Code…)

hwpkit은 stdio MCP 서버를 함께 제공합니다. Model Context Protocol을 말하는 도구면 어디든
붙습니다. 로컬 프로세스로 돌기 때문에 HTTP도 네트워크도 없고 문서가 그 자리에 남습니다.

```json
{
  "mcpServers": {
    "hwpkit": {
      "command": "node",
      "args": ["/hwpkit/절대경로/scripts/hwp-mcp.mjs"]
    }
  }
}
```

쓰는 클라이언트의 MCP 설정에 넣으면 됩니다 (Gemini CLI `settings.json`, Cursor, VS Code,
Claude Code — 또는 `claude mcp add hwpkit -- node /절대경로/scripts/hwp-mcp.mjs`).
Codex도 같은 명령을 stdio 서버로 받습니다. 도구 세 개가 나타납니다: `hwp_read`,
`hwp_write`, `hwp_preview`.

이 서버는 **dual-era**입니다. 구버전 `initialize` 핸드셰이크와 stateless인 `2026-07-28`
개정판(`server/discover`, 요청별 `_meta`)에 모두 응답하므로, 그 변경의 어느 쪽에 있는
클라이언트든 동작합니다. 의존성은 0개입니다 — 약 4MB짜리 SDK를 끌어오는 대신 와이어
프로토콜을 직접 구현해서, 오프라인·무설치 약속을 그대로 지킵니다.

스펙만 보고 만든 게 아니라 실제 클라이언트로 확인했습니다. Gemini CLI 0.47.0이 접속되며
(아직 구버전 `initialize`, `2025-11-25`로 붙습니다 — dual-era가 필요한 이유입니다),
Antigravity에서는 모델이 `hwp_write` → `hwp_read` 왕복을 표 내용까지 정상 수행했습니다.
`test/mcp.test.mjs`가 실제 stdio로 양쪽 시대를 검증합니다.

### 에이전트 지시문 (Codex, Cursor, Aider…)

스크립트가 그냥 CLI라서, 셸 명령을 실행할 수 있는 에이전트면 어디서든 hwpkit을 씁니다.
크로스툴 표준인 [AGENTS.md](AGENTS.md)가 사용법을 알려줍니다 — 명령, 지원하는 마크다운
범위, `.hwp`와 `.hwpx` 중 무엇을 고를지, 그리고 결과를 짐작하지 말고 미리보기로 확인하라는 것까지.

```bash
git clone https://github.com/yuyu04/hwpkit
```

Codex, Cursor, Aider, Zed, Windsurf 등은 `AGENTS.md`를 자동으로 읽습니다.
**Gemini CLI**는 `settings.json`에 한 줄이 필요합니다:

```json
{ "context": { "fileName": ["GEMINI.md", "AGENTS.md"] } }
```

ChatGPT 웹 앱은 로컬 도구에 접근하지 못합니다. 원격 HTTPS 엔드포인트만 연결되는데, 그건
문서를 업로드한다는 뜻입니다. 그 선택은 각자의 몫이고, hwpkit은 그 경로를 기본 제공하지 않습니다.

### 명령줄에서 바로

```bash
git clone https://github.com/yuyu04/hwpkit && cd hwpkit
# 의존성은 이미 포함돼 있어 npm install은 선택입니다

node scripts/hwp-read.mjs    report.hwp              # 읽기   → 표준출력
node scripts/hwp-write.mjs   report.md report.hwp    # 쓰기   → .hwp
node scripts/hwp-write.mjs   report.md report.hwpx   # 쓰기   → .hwpx
node scripts/hwp-preview.mjs report.hwp out/ --png   # 미리보기 → SVG + PNG
```

Node.js 18 이상이 필요합니다.

## 한컴오피스 없이 HWP 미리보기

HWP는 윈도우 밖에서 열어보기가 까다롭습니다. rhwp가 자체 레이아웃 엔진을 갖고 있어서,
Node가 도는 곳이면 어디서든 페이지를 이미지로 만들 수 있습니다. 결과물 확인, 코드 리뷰,
CI 비교, 혹은 남이 보낸 `.hwp`가 뭔지 그냥 볼 때 유용합니다.

```bash
node scripts/hwp-preview.mjs report.hwp out/            # SVG, 의존성 없음
node scripts/hwp-preview.mjs report.hwp out/ --png      # + PNG (Chrome을 래스터라이저로 사용)
node scripts/hwp-preview.mjs report.hwp out/ --pages 2-4 --scale 3
```

SVG는 Node만 있으면 됩니다. `--png`은 설치된 Chrome/Chromium/Edge를 **래스터라이저로만**
씁니다(스크립트 실행도, 네트워크도 없음). 자동으로 못 찾으면 `CHROME_PATH`로 알려주세요.

이건 한컴의 렌더러가 아니라 rhwp의 렌더러입니다. 폰트와 페이지 나눔이 비슷하지만 동일하지는
않습니다. 최종 확인은 한글에서 직접 열어보시는 게 가장 확실합니다.

## 지원하는 마크다운 (쓰기)

| 마크다운 | 결과 |
| --- | --- |
| `#` `##` `###` | 제목. 위계에 따라 크기(22 / 17 / 14 / 11.5pt), 굵게 |
| 일반 줄 | 문단(맑은 고딕 10pt, 줄간격 160%). 연속된 줄은 한 문단으로 이어집니다 |
| `- 항목` / `* 항목` | 불릿 문단(`• 항목`), 들여쓰기. 들여쓰기 깊이로 중첩 |
| `1. 항목` | 번호 목록, 들여쓰기 |
| `**굵게**` `*기울임*` `` `코드` `` | 문자 서식 (`.hwp` 전용 — 한계 참고) |
| `[텍스트](url)` `![대체](src)` | 보이는 텍스트만 남김 |
| `\| a \| b \|` | 실제 HWP 표. `---` 구분 줄은 무시 |

## 동작 방식

- `vendor/rhwp/` — WebAssembly로 컴파일된 rhwp 엔진(MIT). Node에는 `<canvas>`가 없어
  가벼운 글자폭 측정 shim을 함께 씁니다. 정확한 글리프 폭은 레이아웃 힌트에만 영향을 주고,
  이 값은 HWP 뷰어가 열 때 다시 계산합니다.
- `scripts/hwp-read.mjs` — 문서를 열어 렌더된 레이아웃에서 텍스트를 재구성합니다.
- `scripts/hwp-write.mjs` — 마크다운을 엔진의 편집 API로 문서에 쌓고 `.hwp` / `.hwpx`로 내보냅니다.
- `scripts/hwp-preview.mjs` — 페이지를 SVG(선택적으로 PNG)로 렌더합니다.
- `scripts/hwp-fix-tables.mjs` — 갓 만든 `.hwp` 표의 `CTRL_HEADER`를 올바른 48바이트
  레이아웃으로 다시 씁니다(한컴 데스크톱이 저장 시 하는 보정을 JS로 옮긴 것). 이걸 해야
  한글에서 표가 제대로 렌더·고정됩니다.

```bash
npm test    # 마크다운 → .hwp/.hwpx → 재읽기 왕복, 용지 설정, SVG 렌더 검증
```

## 한계

- **문장 중간 강조는 `.hwp`에서만 됩니다.** rhwp의 HWPX 라이터가 문단을 문자 런 하나로
  합치기 때문에 `.hwpx`에서는 중간 `**굵게**`가 사라집니다(제목·폰트·크기·간격·들여쓰기는
  그대로 적용됩니다). 강조가 중요하면 `.hwp`를 쓰세요.
- **표 안 글자는 문서 기본 폰트를 따릅니다** — rhwp가 갓 만든 셀의 서식을 바꾸지 못합니다.
  한글에서 정상적으로 보이지만 원하는 폰트는 아닙니다.
- **읽기는 레이아웃을 읽는 순서대로 평탄화**합니다. 마크다운 표로 복원하지 않고, 다단·중첩
  표는 선형 텍스트로 나옵니다.
- 이미지 삽입과 서식 유지형 템플릿 채우기는 아직 구현되지 않았습니다.
- 같은 마크다운이라도 `.hwp`와 `.hwpx`의 페이지 나눔이 조금 다를 수 있습니다.

## 포맷 배경

`.hwpx`는 국가 개방표준(**OWPML / KS X 6101**)으로, `.docx`처럼 XML을 담은 ZIP입니다.
구형 `.hwp`는 OLE 복합 바이너리이며 한컴이 2010년에 규격을 공개했습니다. 이 규격을 바탕으로
상호운용 가능한 리더·라이터를 만드는 것은 이미 널리 이뤄져 왔습니다(LibreOffice, pyhwp,
hwp.js, ONLYOFFICE).

## 기여

특히 **문제가 된 문서 샘플과 함께 올려주는 버그 리포트**가 큰 도움이 됩니다. HWP는 실무에서
방언이 많습니다. [CONTRIBUTING.md](CONTRIBUTING.md)를 참고하세요.

## 라이선스

MIT — [LICENSE](LICENSE) 참고. rhwp 엔진 등 포함된 구성요소는 각자의 라이선스를 따릅니다
([THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)). "HWP", "한글", "한컴"은 (주)한글과컴퓨터의
상표이며, 이 프로젝트는 한컴과 무관한 독립적인 HWP 호환 도구입니다.
