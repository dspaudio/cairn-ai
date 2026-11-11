# Domain: lifecycle-install

Summary: install·upgrade·doctor·uninstall 트랜잭션, 설치 경로와 runtime locator, 공유 config.toml, CLI help·exit 규약. 설치·CLI를 바꿀 때 읽는다.

## Scope

`scripts/cairn-lifecycle*.mjs`, `scripts/cairn-paths.mjs`(runtime locator), `scripts/cairn.mjs`의 명령 분기, `scripts/cairn-cleanup.mjs`의 CLI. goal 상태 정리 규칙은 `goal-state.md`, 릴리스 절차는 `release-process.md`.

## Facts

### 설치 경로와 소유권

- 설치 루트는 `$CODEX_HOME`(기본 `~/.codex`)`/plugins/cache/cairn/`이다. versioned runtime은 `cairn/<version>/`, 소유권 manifest는 `.cairn/lifecycle.json`, 트랜잭션 journal은 `.cairn/transaction.json`과 `.cairn/transactions/`, lifecycle lock은 `.cairn/lifecycle.lock`(기본 대기 60초, `CAIRN_LIFECYCLE_LOCK_TIMEOUT_MS`)이다. 출처: `scripts/cairn-lifecycle.mjs:30-56`, `scripts/cairn-lifecycle-lock.mjs:6`.
- 호스트별 표면:
  - Claude Code: `~/.claude/commands`, `~/.claude/agents`, runtime locator `~/.claude/cairn/runtime.json`, 얇은 Claude plugin(설치 루트의 `claude/`).
  - Antigravity: `~/.gemini/config`, `~/.gemini/antigravity-cli`. 예전 `~/.agents`에서는 이전한다.
  - 각 경로는 `CLAUDE_HOME`, `ANTIGRAVITY_HOME`, `ANTIGRAVITY_CLI_HOME`, `CODEX_CONFIG_PATH`로 바꿀 수 있다. 테스트는 모두 이 env로 격리한다.
- 트랜잭션은 단계 `codex → claude → antigravity → config → cleanup` 순으로 대상을 교체하고, 실패하면 이전 runtime과 manifest를 복구한다. 중단된 journal은 다음 lifecycle 실행이 복구한다. 출처: `cairn-lifecycle.mjs:55`, `test/lifecycle-transaction.test.mjs` "upgrade failure restores…", "the next lifecycle run recovers a crash journal…".
- 관리 대상 파일·트리는 설치 digest와 다르면 upgrade·uninstall이 거부하고 보존한다(`Managed artifact was modified`, `Refusing to uninstall modified managed artifacts`). manifest 형태가 잘못되거나 허용 목록 밖을 가리켜도 fail-closed다. 출처: `scripts/cairn-lifecycle-integrity.mjs:31-45`, `test/lifecycle-transaction.test.mjs` 404~471행 케이스들.
- 예외: 공유 `config.toml`은 mutable merge surface다. Cairn 소유 section(`[marketplaces.cairn]`, `[plugins."cairn@cairn"]`, `cairn@cairn:` hook trust)만 재조정·제거한다. section 뒤의 빈 줄·주석(boundary trivia)과 사용자 section은 보존한다. symlink config는 거부한다. 출처: `scripts/cairn-lifecycle-config.mjs:6-40`, `scripts/cairn-lifecycle-transaction-targets.mjs:9-59`, `docs/plan/upgrade-shared-config-ownership.md`.
- 정확히 일치하는 0.2.2 legacy 트리만 adoption한다(`scripts/release-integrity-0.2.2.json` SHA-256 목록). 수정되거나 파일이 더 있으면 건드리지 않고 거부한다. 출처: `test/lifecycle-transaction.test.mjs` "an exact legacy 0.2.2 tree…" 외 3개.
- 설치 cache 안의 CLI로 install·upgrade하면 `Run install or upgrade from the Cairn package/global source, not from the installed cache.`로 거부한다. 출처: `scripts/cairn-lifecycle-commands.mjs:32-34`, `test/installed-plugin.test.mjs:113-116`.

### hook 등록과 runtime 해석

- 패키지 `hooks/hooks.json`은 Codex의 `${PLUGIN_ROOT}`를 쓴다. Claude Code는 `${CLAUDE_PLUGIN_ROOT}`만 확장한다. 그래서 install이 얇은 Claude plugin을 따로 만들고, 그 hook은 versioned runtime의 `cairn-state.mjs`를 절대 경로로 호출한다. 출처: `scripts/cairn-lifecycle-claude.mjs:6-60`.
- 설치된 skill·command·workflow 미러는 `references/cairn-runtime.json` 등 runtime locator로 `pluginRoot`, `entrypoints`, `resources`를 찾는다. 대상 저장소에서 Cairn 파일을 찾지 않는다. 출처: `scripts/cairn-paths.mjs:114-133`, `test/installed-plugin.test.mjs` "installed mirrors resolve Cairn resources through runtime locators".
- runtime에 복사되는 스크립트는 진입점 6개(`cairn.mjs`, `cairn-lifecycle.mjs`, `cairn-state.mjs`, `cairn-toolcheck.mjs`, `cairn-goal.mjs`, `cairn-cleanup.mjs`)에서 정적 import를 따라간 closure다. 출처: `scripts/cairn-paths.mjs:136-160`, `test/packed-install.test.mjs` "runtime locator includes extracted goal CLI dependency".
- 패키지에서 runtime으로 복사하는 문서는 `docs/model-guidance/`뿐이다. 저장소의 `docs/memory`, `docs/plan`은 배포되지 않는다. 출처: `scripts/cairn-lifecycle-staging.mjs:145-159`, `package.json` `files`.

### CLI help·exit 규약

| 표면 | 0 | 1 | 2 |
| --- | --- | --- | --- |
| root, `init`, `memory`, `plan` | 성공, help, version | `memory`/`plan` check 오류 | 사용법 오류 (`Cairn error: …`) |
| `cleanup` | 성공, help, version | 실행 오류 (`Cairn cleanup error: …` 한 줄) | 사용법 오류 |
| `goal`, `task` | 성공, help, version, 인자 없음 | 모든 오류 (`Cairn goal error: …`) | 사용 안 함 |
| `toolcheck` | 성공, help, version | 도구 누락·설치 거부 | 사용법 오류 |
| `install`·`upgrade`·`doctor`·`uninstall` | 성공 | 모든 오류 (`Cairn lifecycle error: …`) | — |

- `init`은 `--root` 외 인자를 받으면 아무것도 쓰지 않고 exit 2다. `init --help`는 파일을 만들지 않는다. 출처: `scripts/cairn.mjs:56-72`, `test/cli-contract-hardening.test.mjs` 199·209행.
- `goal`/`task`는 `--` 앞의 `--help`를 상태를 읽기 전에 처리한다. `--` 뒤의 `--help`는 `goal verify`로 그대로 넘긴다. 출처: `scripts/cairn-goal-cli.mjs:18-35`.
- `cleanup --check --yes`는 사용법 오류다. 출처: `scripts/cairn-cleanup.mjs:156`.
- `init` 템플릿(`INDEX_TEMPLATES`)은 짧은 인덱스다. `## Planning Rules`는 없고, 규칙은 `cairn-plan` 스킬에 있다. `init`은 기존 파일을 덮어쓰지 않는다. 출처: `scripts/cairn-state-init.mjs`, `test/contract-parity.test.mjs` "templates/MEMORY.md and templates/PLAN.md equal the English init templates".
- 남겨 둔 예외: `cairn install --help`는 도움말 대신 `Cairn lifecycle error: Lifecycle command install does not accept arguments: --help`를 stderr에 쓰고 exit 1이며 파일을 만들지 않는다(lifecycle 명령은 인자를 받지 않는다). 내부 hook 스크립트 `node scripts/cairn-state.mjs init --help`는 인자를 무시하고 초기화한다. 출처: `cairn-lifecycle.mjs:86,91-96`, `scripts/cairn-state.mjs:40-47`.

## Policy

- lifecycle 검증은 임시 HOME과 위 env로 격리한다. 실제 `~/.codex/config.toml`과 설치본에는 쓰지 않는다.
- 새 스크립트는 진입점에서 정적 import로 연결한다. 동적 import는 runtime closure에서 빠진다.
- 설치본은 upgrade 뒤 새 세션부터 hook에 반영된다. 기존 세션은 이전 버전 경로를 가리킨다(`docs/plan/release-0.5.0.md` Evidence 후속).

## References

- `node --test test/lifecycle.test.mjs test/lifecycle-transaction.test.mjs test/lifecycle-hardening.test.mjs test/installed-plugin.test.mjs test/packed-install.test.mjs test/cli-contract-hardening.test.mjs`
