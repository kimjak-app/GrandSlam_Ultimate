# AGENTS.md

이 문서는 `C:\dev\GrandSlam_Ultimate`에서 작업하는 Codex/에이전트용 실행 규칙입니다.

## 1) 프로젝트 개요

- 앱 형태: 번들러 없는 SPA (`index.html` + 다수의 전역 스크립트)
- 스타일: `css/style.css`
- 핵심 스크립트: `js/*.js` (도메인별 분리)
- 데이터 계층: Firebase Firestore (`js/api.js`, `index.html` 내 Firebase 초기화)
- 규칙/도메인 상수: `js/rules/tennis.js`, `js/state.js`

## 2) 현재 구조(역할 기준)

- 진입/부트스트랩
  - `index.html`: 화면 마크업, 스크립트 로드 순서, 일부 인라인 스크립트
  - `js/main.js`: `DOMContentLoaded`, 전역 이벤트 바인딩, 홈 렌더 트리거
- 전역 상태/공통
  - `js/state.js`: 전역 상태 변수와 앱 공통 상태
  - `js/ui.js`: 공통 UI 유틸/헬퍼
  - `js/api.js`: Firestore 입출력 및 동기화
- 도메인별 패턴(권장)
  - `*_engine.js`: 순수/핵심 로직
  - `*_view.js`: 화면 렌더링/DOM 업데이트
  - `*.js`(예: `game.js`, `round.js`): 화면 진입, 이벤트 핸들링, 오케스트레이션
- 도메인 묶음
  - 게임: `game_engine.js`, `game_view.js`, `game.js`
  - 대진/라운드: `round_engine.js`, `round_view.js`, `round_auto_view.js`, `round.js`
  - 토너먼트: `tournament_engine.js`, `tournament_view.js`, `tournament.js`
  - 통계: `stats_calc.js`, `stats_view.js`, `stats.js`
  - 회계: `treasurer_calc.js`, `treasurer_view.js`, `treasurer.js`
  - 교류전: `exchange_engine.js`, `exchange_view.js`, `exchange.js` (+ `index.html` 인라인 일부)
  - 클럽/관리: `club*.js`, `admin.js`, `regions.js`, `ladder.js`

## 3) Codex 작업 원칙

- 최소 변경 원칙
  - 요청 범위를 벗어나는 리팩터링 금지
  - 기존 전역 변수/함수명/DOM id를 임의 변경하지 않기
- 의존 순서 보존
  - `index.html`의 `<script src="...">` 순서는 런타임 의존성에 중요함
  - 파일 추가/재배치 시 로딩 순서까지 함께 검토
- 도메인 분리 유지
  - 로직 추가: 우선 `*_engine.js` 또는 `*_calc.js`
  - 렌더링 변경: `*_view.js`
  - 버튼 이벤트/흐름 제어: 해당 도메인 `*.js`
- 전역 상태 취급
  - 상태 필드는 `js/state.js`에 정의하고, 읽기/쓰기 위치를 명확히 유지
  - 저장/동기화가 필요한 상태는 `js/api.js` 경유
- UI 변경 시
  - 화면 id(`view-*`, `ex-view-*`)와 네비게이션 연동(`showView`, `switchView`) 확인
  - 숨김/표시 스타일(`display:none`)과 초기 렌더 타이밍(`DOMContentLoaded`) 점검
- 데이터 변경 시
  - Firestore 스키마 호환성 유지(기존 필드명 보존, 마이그레이션 없는 파괴적 변경 금지)
  - `matchLog` 정규화/중복 제거 규칙(`normalizeMatchLog`)과 충돌 여부 확인

## 4) 수정 절차(체크리스트)

1. 변경 대상 도메인 파일 확인 (`engine/view/domain` 중 어디인지 결정)
2. 관련 DOM id와 호출 경로(`index.html` + 해당 js) 추적
3. 전역 상태 영향(`state.js`)과 저장 영향(`api.js`) 검토
4. 코드 수정
5. 최소 수동 검증:
   - 앱 로드/첫 화면 진입
   - 수정한 화면 진입/이탈
   - 저장/동기화 기능 영향(해당 시)
   - 콘솔 에러 유무

## 5) 금지/주의 사항

- 대규모 포맷팅/정렬 변경으로 불필요한 diff 만들지 말 것
- 인라인 스크립트 영역 수정 시 같은 기능이 `js/*.js`에 중복되지 않도록 확인
- UTF-8 인코딩 유지(한글 깨짐 방지)
- 사용자 요청 없는 비파괴 원칙 위반 작업(`reset`, 대량 삭제) 금지

## 6) 새 기능 추가 가이드

- 가능하면 기존 패턴 준수:
  - 계산/규칙은 `*_engine.js` 또는 `*_calc.js`
  - 렌더링은 `*_view.js`
  - 화면 이벤트는 도메인 `*.js`
- 신규 파일 추가 시:
  - `index.html` 스크립트 로드 순서에 반영
  - 기존 전역 함수명과 충돌 여부 확인
  - 필요한 상태 키는 `state.js`에 명시
  - 필요한 저장 로직은 `api.js`에 추가

## 7) 빠른 참조

- 메인 진입: `index.html`, `js/main.js`
- 전역 상태: `js/state.js`
- 데이터 계층: `js/api.js`
- 공통 UI: `js/ui.js`
- 도메인 규칙: `js/rules/tennis.js`

