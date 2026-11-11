# Domain: hook-context

Summary: hook 캡슐의 상태별 내용·문자 예산과 MEMORY.md/PLAN.md 인덱스 형식·검사 규칙. hook 문구나 인덱스 CLI를 바꿀 때 읽는다.

## Scope

hook 진입점 `scripts/cairn-state.mjs`, 순수 렌더링 `scripts/cairn-state-context.mjs`, 인덱스 검사·재생성·hook snapshot `scripts/cairn-index.mjs`, 등록 `hooks/hooks.json`. goal 상태 자체는 `goal-state.md`, 설치본의 hook 등록 경로는 `lifecycle-install.md`.

## Facts

### 이벤트와 캡슐

- hook은 5개다: SessionStart, UserPromptSubmit(UPS), PostToolUse(편집 도구 matcher), Stop, SubagentStop. 모두 `cairn-state.mjs <event>`, timeout 10초. 출처: `hooks/hooks.json`.
- 모든 캡슐은 `Cairn kernel: root MEMORY.md is optional; read it when present.`(ko 판 있음)로 시작한다. 이 문장은 테스트가 고정한다. 출처: `cairn-state-context.mjs:95-97`, `test/token-efficiency.test.mjs` "hook context is a compact phase capsule without dropping recovery state", `test/goal-state.test.mjs` "automatic context hooks do not initialize an uninitialized repository".
- 상태별 본문(`cairn-state-context.mjs:33-130`):
  - idle: cairn-plan 로드 지침. UPS에는 대상이 확정된 Git/GitHub 작업과 상담은 goal 없이 처리한다는 문장이 붙는다.
  - active: plan id, task roadmap(3개 이하면 전부, 넘으면 개수 요약과 현재 위치), current task. UPS에만 곁가지 질문 뒤 복귀 문장이 붙는다.
  - paused/blocked: plan·task·blocker와 "자동으로 상태를 바꾸지 말고 `goal resume`".
  - foreign(다른 session 소유): goal·plan·task 상세 없이 fail-closed 문장과 `goal claim --session` 안내.
- SessionStart 끝에는 `Cairn CLI: node "<runtime scripts/cairn.mjs>" goal <command>` 한 줄이 붙는다. 저장소 경로는 넣지 않는다. 0.3.0 배포 전, 깊은 경로 worktree에서 절대 경로 2개 때문에 blocked 캡슐이 637자로 620 예산을 넘은 적이 있다. 출처: `cairn-state.mjs:152-157`, `docs/plan/release-0.3.0.md` Evidence.
- 다른 worktree의 stale 상태를 지운 경우 캡슐 앞에 점검 문장 1줄이 붙는다. 출처: `cairn-state.mjs:62-66`.
- PostToolUse는 소유 session의 active goal에서만 나오고, (goalId, 활성 taskId, sessionId) 조합당 1회다(guard `reminder-guard.json`). 출처: `cairn-state.mjs:69-102`.
- Stop/SubagentStop은 active goal에 미완료 task가 있으면 block한다. `stop_hook_active`인데 상태 진척이 없으면 통과시킨다(loop guard). SubagentStop은 그 agent에 배정된 task만 본다. 출처: `scripts/cairn-goal-policy.mjs:19-51`, `scripts/cairn-state-hook.mjs`.
- hook 내부 오류는 `systemMessage` JSON으로 알리고 exit 0이다. 자동 hook은 저장소를 init하지 않는다. 출처: `cairn-state.mjs:170-174`, `test/goal-state.test.mjs` "automatic context hooks do not initialize an uninitialized repository".

### 문자 예산(테스트가 강제)

| 대상 | 상한 | 강제 지점 |
| --- | --- | --- |
| UPS idle (노트 9999개 포함) | 620 | `test/token-efficiency.test.mjs:48`, `test/index-context.test.mjs` "idle UserPromptSubmit … 620" |
| UPS active (20 task, 최대 id 포함) | 700 | `test/token-efficiency.test.mjs:73,197` |
| paused/blocked SessionStart (노트 없음) | 620 | `test/state-recovery-hardening.test.mjs:50,83` |
| 병렬 active hook / 병렬 줄 | 820 / 160 | `test/goal-dag.test.mjs:256-257` |
| memory 블록 / plan 줄 | 640 / 320 | `contextLimits`(`cairn-state-context.mjs:1-13`), `test/index-context.test.mjs` |

### 인덱스 주입

- SessionStart idle은 memory 블록과 plan 줄을 싣는다. SessionStart active·paused·blocked·foreign은 memory 블록만 싣는다. UPS idle은 노트가 1개 이상일 때 개수 문장 1개만 싣는다. 그 밖의 UPS는 디스크를 읽지 않는다. 출처: `cairn-state.mjs:144-150`.
- memory 블록: 항목이 8개 이하이고 640자 이하면 `- name: summary` 줄(줄 84자, 이름 32자 clip)로 싣는다. 넘치면 이름만 쉼표로 이어 싣고 ` +N more in MEMORY.md`를 붙인다. 미색인 노트는 이름만 싣고 `(index out of date: run cairn memory index)`를 붙인다.
- hook이 보여 주는 summary는 `MEMORY.md` 줄의 문구다. 노트 본문은 읽지 않는다. 노트 이름·summary·plan 이름의 제어문자와 줄 구분자(C0, DEL, C1, U+2028, U+2029)는 렌더링 때 공백으로 바뀌어 한 항목이 한 줄에 머문다. clip은 서로게이트 쌍을 자르지 않는다. 출처: `cairn-index.mjs` `memorySnapshot`, `cairn-state-context.mjs` `plainText`·`clipText`, `test/index-context.test.mjs` "SessionStart replaces control characters …".
- plan 줄: 파일 수, Active 이름 최대 3개, Completed 앞 3개, `ARCHIVE.md`가 있으면 `older:` 구. 320자를 넘으면 최근 완료 이름을 뒤에서부터 뺀다. foreign에는 plan 이름을 싣지 않는다(소유자 작업 노출 금지). 출처: `cairn-state-context.mjs:172-196`, `test/index-context.test.mjs` "foreign SessionStart … never plan names".
- 노트·계획이 없는 저장소의 출력은 0.5.0과 바이트 단위로 같다. `hookIndexSnapshot`은 throw하지 않고 쓰지 않는다. symlink, FIFO, 256 KiB를 넘는 인덱스는 해당 블록만 뺀다. 출처: `test/index-context.test.mjs` 1·11·12번 케이스, `cairn-index.mjs:293-310`.

### 인덱스 형식과 CLI

- 한 줄 형식: `- [<name>](docs/<memory|plan>/<name>.md): <summary>`. 상한은 summary 120자, 줄 200자, name 64자, 루트 120줄/16384바이트, 인덱스 읽기 256 KiB, Completed 20개다. 출처: `INDEX_LIMITS`(`cairn-index.mjs:10-21`).
- memory summary 원천: 노트 첫 20줄(4096바이트) 안의 `Summary:` 줄 → 기존 인덱스 문구 → `## Scope` 첫 줄 → 첫 본문 줄 → H1. `Summary:`가 없으면 `summary-missing` 경고가 난다.
- `cairn memory|plan check [--strict]`, `cairn memory index [--dry-run]`, `cairn plan index [--dry-run] [--archive]`는 JSON 보고 1개를 낸다. exit 0은 오류 없음(`--strict`면 경고도 없음), 1은 오류, 2는 사용법 오류다. 출처: `scripts/cairn.mjs:34-54`, `test/index.test.mjs`.
- 오류: `index-missing`, `unindexed`, `dead-link`, `duplicate`, `stale-summary`, `control-character`(인덱스 항목 summary에 제어문자·줄 구분자), `unsafe-name`(공백·`()[]<>`·백틱·C0·DEL·C1·U+2028/2029가 든 이름이나 64자 초과), `unsafe-path`, `unclosed-fence`(`index`만: 삽입 지점이 닫히지 않은 코드 펜스 안이면 아무것도 쓰지 않음). 경고(`--strict`에서만 실패): `summary-missing`, `summary-too-long`, `entry-too-long`, `root-too-long`, `nested-ignored`, `skipped-non-regular`, `completed-overflow`, `legacy-planning-rules`.
- 항목은 인덱스 섹션의 목록 줄이다: memory는 `## Domain Knowledge`, plan은 제목이 `Plans`로 끝나는 섹션(`Active`·`Superseded`·`Completed Plans` 등). 그런 섹션이 없는 예전 파일만 파일 전체 목록 줄을 항목으로 본다. 다른 섹션(`## Policy` 등)의 참조와 한 줄의 두 번째 이후 참조는 "언급"이다. 언급은 `unindexed`를 막기만 하고 `duplicate`·`dead-link`·`stale-summary` 대상도, `index`가 고치는 대상도 아니다. 출처: `cairn-index.mjs` `indexReferences`, `test/index.test.mjs` "… treat note references outside ## Domain Knowledge as mentions …".
- 코드 펜스는 연 문자(백틱/틸드)와 길이를 기억하고, 같은 문자로 같거나 긴 줄에서만 닫힌다.
- `index`는 새 항목 추가, 바뀐 `Summary:` 반영, 인덱스 섹션 안의 Cairn placeholder 줄 제거만 한다. `Summary:` 반영은 참조 뒤 summary 부분만 바꾸고(앞의 라벨과 구분자 유지), 참조가 둘 이상인 줄은 건드리지 않는다. 생성하는 summary의 제어문자는 공백으로 바꾼다. `--archive`일 때만 Completed 21번째 이후 항목(빈 줄 뒤 들여쓴 문단 포함)과 `## Planning Rules` 본문을 `docs/plan/ARCHIVE.md`로 원문 이동한다. 규칙 본문은 원래 제목 줄 없이 `## Legacy Planning Rules` 아래에 들어간다. 죽은 링크는 지우지 않는다. `docs/plan/ARCHIVE.md`는 첫 `## ` 제목 앞의 항목만 색인된 것으로 보고, 상대 링크(`(<name>.md)`)도 그 영역에서만 plan 항목이다.
- `plan index`는 새 계획을 체크박스로 배치한다. 체크박스가 있고 전부 체크됐으면 Completed 맨 위, 아니면 Active 끝이다. 상태 체크박스를 갱신하지 않은 완료 계획은 Active로 들어가므로 손으로 옮긴다. 출처: `cairn-index.mjs:791-807`.

## Policy

- UPS는 프롬프트마다 누적된다. 새 문구는 SessionStart나 참조 파일에 넣고, active UPS에는 싣지 않는다. 0.5.0 기준 en active UPS는 691자로 여유가 없었다(설계 기록 `docs/plan/memory-plan-index-reuse.md` 0절).
- hook의 노트 줄은 `- name: ` 포함 84자에서 잘린다. `Summary:`는 핵심을 앞에 쓴다. 이 저장소 노트 6개는 SessionStart에서 모두 뒷부분("…때 읽는다")이 잘린다(ko 실측 1056자).
- 노트의 `Summary:`를 고치면 `cairn memory index`를 실행한다. 실행하지 않으면 hook이 옛 문구를 계속 보여 준다.
- 예산 테스트를 바꿔야 하면 계획에 계약 변경 사유를 먼저 기록한다.

## References

- `node --test test/token-efficiency.test.mjs test/index-context.test.mjs test/index.test.mjs`
- `printf '{"cwd":"<repo>","session_id":"x"}' | CAIRN_HOME=<임시 경로> node scripts/cairn-state.mjs session-start`
