# Domain: release-process

Summary: 버전 표면, dev→main PR 승격, exact-main tarball 게시와 npm 대화형 인증, 게시 후 검증·로컬 업그레이드 절차. 릴리스 전에 읽는다.

## Scope

`cairn-ai` npm 패키지 릴리스. 설치·업그레이드 내부 동작은 `lifecycle-install.md`. 개별 릴리스의 PR 번호·digest는 각 `docs/plan/release-*.md`에 있다.

## Facts

### 버전 표면과 검사

- 버전 문자열은 `package.json`, `.codex-plugin/plugin.json`과 테스트 5개 파일의 기대값에 있다: `test/contract-parity.test.mjs`, `test/installed-plugin.test.mjs`, `test/lifecycle.test.mjs`, `test/lifecycle-transaction.test.mjs`, `test/packed-install.test.mjs`. `test/index-context.test.mjs`의 `0.5.0`은 주석이라 바꾸지 않는다. 확인: `grep -rn '0\.5\.0' package.json .codex-plugin test`.
- `npm run check`는 핵심 스크립트 `node --check`, JSON 파싱, `npm test`(`node --test`)를 실행한다. `prepack`이 `npm run check`라서 `npm pack`·`npm publish`도 전체 테스트를 돌린다. 로컬 pack 검증에 `--ignore-scripts`를 쓰지 않는다. 출처: `package.json` `scripts`.
- CI(`.github/workflows/ci.yml`)는 ubuntu·windows·macos × Node 18·current 매트릭스에서 `npm run check`, CLI smoke, `toolcheck --json`, `npm pack --dry-run --ignore-scripts`를 실행한다. 여기서 `--ignore-scripts`는 같은 job에서 check가 이미 돌았기 때문이다. 브랜치 보호의 필수 상태는 요약 job `check` 하나다.
- 배포 파일은 `package.json` `files`가 정한다. 저장소의 `docs/memory`, `docs/plan`, `MEMORY.md`, `PLAN.md`는 패키지에 들어가지 않는다.

### 절차(0.4.x~0.5.0에서 반복된 형태)

1. 기능 브랜치에서 버전을 올리고 `npm run check`를 통과시킨 뒤 커밋·push한다.
2. 기능 브랜치 → `dev` PR. exact head의 CI가 통과하면 head SHA를 고정해 병합한다.
3. `dev` → `main` PR도 같은 방식이다. `dev`·`main`은 PR 필수와 `check` 상태 검사로 보호된다(관리자 직접 push는 우회 경고가 남는다, `docs/plan/release-0.3.0.md`).
4. 병합된 `main` SHA의 clean detached worktree에서 `npm pack`을 한 번만 한다. 같은 tarball로 `npm publish --dry-run`과 실제 publish를 한다.
5. 게시 뒤 `npm view cairn-ai@<v> dist --json`의 shasum·integrity와 `latest`를 tarball과 대조한다.
6. 격리된 prefix·cache·HOME·`CAIRN_HOME`에 registry 버전을 설치해 새 기능을 확인한다.
7. 사용자가 요청한 경우에만 로컬 설치본을 올린다: `npm install -g cairn-ai@<v>` → `cairn upgrade` → `cairn doctor`.
8. `main`의 병합 커밋을 `dev`에 다시 합친다. 빠뜨리면 hotfix가 `dev`에 없게 된다(`docs/plan/release-0.3.0.md` 후속).

출처: `docs/plan/release-0.5.0.md`, `docs/plan/release-0.4.1.md`, `docs/plan/release-0.2.7.md` "Execution Contracts".

### npm 인증(사용자 메모로 확인된 사실)

- `npm publish`와 `npm login`은 대화형 인증(OTP·브라우저 승인)이 필요하다. 에이전트의 비대화형 셸에서 실행하면 EOTP로 실패한다(0.4.1, 0.5.0에서 발생). 토큰이 만료되면 `npm whoami`가 401이고, publish는 PUT E404로 보인다.
- 그래서 `npm login --auth-type=web`과 `npm publish <정확한 tarball 경로>`는 사용자의 터미널에서 실행한다. pack 전에 `npm whoami`를 먼저 확인한다.
- 게시 직후 registry 조회는 수 분간 404일 수 있다. 재게시하지 말고 반영을 기다린다. 출처: `docs/plan/release-0.5.0.md` Evidence `npm-publish`.

### 알려진 위험

- Windows + Node current에서 `test/lifecycle-transaction.test.mjs` "a stale lifecycle observer never displaces a confirmed live lifecycle owner"가 1회 실패한 적이 있다(lock 대기 1초에 1018ms). lock 코드를 건드리지 않았다면 실패 job만 재실행한다. 출처: `docs/plan/release-0.5.0.md` Evidence `dev-pr`.
- 깊은 경로 worktree에서 pack하면 hook 예산 테스트가 경로 길이에 걸릴 수 있다(0.3.0 hotfix). 캡슐에 절대 경로를 넣지 않는 규칙이 이 사고에서 나왔다(`hook-context.md`).

## Policy

- 게시된 npm 버전은 되돌릴 수 없다. unpublish, dist-tag 이동, 맹목적 재게시로 복구하지 않는다. 문제가 있으면 증거를 보존하고 새 corrective 버전을 계획한다(`docs/plan/release-0.2.7.md`).
- publish 응답이 모호하면 재시도하기 전에 registry부터 조회한다.
- 커밋·push·PR·게시·설치본 업그레이드는 사용자가 요청한 범위에서만 한다.

## References

- `npm run check`, `npm pack --dry-run`, `npm view cairn-ai@<v> version dist --json`
