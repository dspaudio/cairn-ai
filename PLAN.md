# PLAN

작업 계획의 색인입니다. 각 줄은 `docs/plan/`의 계획 하나를 가리키며, 상세 내용과 증거는 계획에 있습니다. 계획 규칙은 `cairn-plan` 스킬에 있습니다. `cairn plan index`와 `cairn plan check`로 관리합니다.

## Active Plans

## Superseded Plans

- [Cairn 0.2.0 설치본 런타임 릴리스](docs/plan/release-0.2.0-installed-runtime.md): 후속 0.2.1·0.2.2 릴리스로 대체된 미완료 릴리스 계획입니다. 활성 작업으로 취급하지 않습니다.

## Completed Plans

최신 항목이 위에 오며 계획당 한 줄입니다. `cairn plan index --archive`는 오래된 항목을 `docs/plan/ARCHIVE.md`로 옮깁니다.

- [Cairn 0.6.0 릴리스](docs/plan/release-0.6.0.md): dev·main PR을 CI 통과 후 병합하고 exact main tarball을 npm `latest` 0.6.0으로 게시해 digest와 격리 설치를 확인했습니다.
- [메모리·계획 인덱스 재활용과 측정·감사 잔여 수정](docs/plan/memory-plan-index-reuse.md): 메모리·계획 인덱스 CLI와 hook 주입, goal 이력 집계, 감사 잔여 F6·F10·F11 수정, 이 저장소 `docs/memory` 노트 6개.
- [Cairn 0.5.0 릴리스](docs/plan/release-0.5.0.md): dev·main PR을 CI 통과 후 병합하고 exact main tarball을 npm `latest` 0.5.0으로 게시해 digest·격리 설치를 확인한 뒤 로컬 설치본을 올렸습니다.
- [모델 위임 규칙 4가지 개선](docs/plan/delegation-model-identity-rules.md): 실제 모델 ID 기록(`--effective-model`), 모델·effort 변경 시 새 dispatch, task list main 전담, 설계 strongest 게이트(`--host`)를 반영.
- [Cairn 0.4.1 릴리스](docs/plan/release-0.4.1.md): dev·main PR을 CI 통과 후 병합하고 exact main tarball을 npm `latest` 0.4.1로 게시해 registry digest와 격리 설치를 확인했습니다.
- [Heavy Path 설계 모델 위임](docs/plan/heavy-design-model-routing.md): Heavy Path 설계를 strongest 모델 위임 task로 분리하고 모델 기록 누락을 완료 게이트로 차단; `npm run check` 통과.
- [Cairn 0.4.0 릴리스](docs/plan/release-0.4.0.md): dev·main PR을 CI 통과 후 병합하고 exact main tarball을 npm `latest` 0.4.0으로 게시해 digest와 격리 설치의 Heavy effort 게이트를 검증했습니다.
- [작업별 모델 결정](docs/plan/per-task-model-routing.md): 모델 상속 고정을 fast/balanced/stronger/strongest 4-tier 작업별 결정으로 바꾸고 호스트별 매핑과 host 옵션 전달 규칙을 반영했습니다.
- [dispatch 시 추론 강도 실제 적용과 검증](docs/plan/dispatch-effort-enforcement.md): host 옵션으로 effort를 넘기는 규칙·Effective 판정, `goal assign --effort`, Heavy 완료 게이트, stats·Stop 경고를 구현했습니다.
- [Cairn 0.3.0 릴리스](docs/plan/release-0.3.0.md): SessionStart 캡슐 예산 hotfix와 함께 main에 병합하고 exact main tarball을 npm `latest` 0.3.0으로 게시해 digest와 격리 설치를 검증했습니다.
- [Cairn 오버헤드 축소와 task DAG](docs/plan/cairn-overhead-reduction.md): goal 증거로 task 재검증 면제, `goal finish`/`stats`/`ready`, PostToolUse 1회 알림, SKILL.md 축소, `dependsOn`/`writeScope` 병렬 task.
- [Cairn 0.2.7 릴리스](docs/plan/release-0.2.7.md): state/lifecycle 계약 hardening과 module split을 dev·main에 승격하고 exact main tarball을 npm `latest` 0.2.7로 게시했습니다.
- [경로별 추론 강도 변경 보존 및 PR 게시](docs/plan/publish-path-reasoning-effort-routing.md): dirty `dev` 변경을 backup·stash로 보존하고 최신 `origin/dev` 기반 브랜치에 3-way 재적용·검증한 뒤 draft PR을 만들었습니다.
- [Cairn 0.2.5 hotfix 릴리스](docs/plan/release-0.2.5.md): dev·main PR을 exact head CI 성공 후 병합하고 exact main tarball을 npm `latest` 0.2.5로 게시해 digest와 격리 설치/CLI를 검증했습니다.
- [Cairn 0.2.5 공용 설정 upgrade hotfix](docs/plan/upgrade-shared-config-ownership.md): 공유 `config.toml`을 mutable merge surface로 바꾸고 boundary trivia·concurrent edit·crash recovery·0.2.4→0.2.5 upgrade를 검증.
- [Cairn 0.2.4 릴리스](docs/plan/release-0.2.4.md): dev·main PR을 exact head CI 성공 후 병합하고 exact main tarball을 npm `latest` 0.2.4로 게시해 digest와 격리 설치/CLI를 검증했습니다.
- [clean uninstall과 프롬프트 캐시 복원력](docs/plan/clean-uninstall-prompt-cache-resilience.md): 빈 managed cache root 정리, unmanaged 보존, completed-task evidence 갱신, 7문장 recovery kernel과 bounded reference 복원.
- [Cairn 0.2.3 릴리스](docs/plan/release-0.2.3.md): dev/main PR 승격, npm 배포, npm 설치본 재설치와 실제 upgrade smoke 증거를 갱신하고 goal을 명시적으로 완료했습니다.
- [경로별 추론 강도 라우팅](docs/plan/path-reasoning-effort-routing.md): 모델은 상속하고 Light=`medium`, Heavy=`high`, 최종 검토=`xhigh`를 task별로 적용하며 경로 변경 시 effort profile 등을 재계산합니다.
- [단계별 복잡도 재평가](docs/plan/staged-complexity-reassessment.md): 요청·계획·코드 체크포인트에서 경로를 재평가하고 변경 시 plan artifact·goal task roadmap·Codex UI plan을 `goal replan`으로 동기화합니다.
