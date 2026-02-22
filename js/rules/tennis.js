// ========================================
// ✅ v4.02: rules/tennis.js — 테니스 규칙 엔진
// 모든 점수 계산 상수와 로직을 이 파일 하나에서 관리
//
// 다종목 확장 시:
//   rules/badminton.js, rules/pickleball.js, rules/tabletennis.js ...
//   동일한 인터페이스(calcPoints, RULES)로 구현하면 됨
// ========================================

const TENNIS_RULES = {
  sport: "tennis",

  // ── 기본 점수 체계 ──────────────────────────────
  // Firestore 이전 후엔 clubs/{clubId}/settings.sports.tennis.scoringRule 에서 로드
  // 현재는 fallback 상수로 사용
  scoring: {
    participate: 1.0,       // 참가 기본점수
    single: {
      win:  3.0,
      loss: -0.5,
    },
    double: {
      win:  2.0,
      loss: -0.5,
    },
    mixed: {
      win:  2.0,
      loss: -0.5,
    },
  },

  // ── 토너먼트 진출 보너스 ──────────────────────────
  tournamentBonus: {
    champion:     3.0,   // 우승
    runnerUp:     2.0,   // 준우승
    semiFinal:    1.0,   // 4강
    quarterFinal: 0.5,   // 8강
  },

  // ── 라운드 로빈 순위 보너스 ──────────────────────
  roundBonus: [
    5.0,   // 1위
    4.0,   // 2위
    3.0,   // 3위
    2.5,   // 4위
    1.5,   // 5~8위 (기본)
    0.1,   // 9위 이하
  ],

  // ── 차트/누적 통계용 점수 ────────────────────────
  cumScore: {
    double: 3.0,   // 복식 승리 누적점
    single: 4.0,   // 단식 승리 누적점
  },

  // ── 경기 구조 ────────────────────────────────────
  matchTypes: ["single", "double", "mixed"],
  genderSeparated: true,
  mixedAllowed: true,
  levelSeparated: true,
};

// ── 공통 인터페이스 ──────────────────────────────────
// 사용법: calcPoints(matchType, result, clubSettings)
// clubSettings가 있으면 Firestore 설정 우선, 없으면 TENNIS_RULES fallback
function calcPoints(matchType, result, clubSettings) {
  const scoring = clubSettings?.sports?.tennis?.scoringRule?.scoring || TENNIS_RULES.scoring;
  const rule = scoring[matchType] || scoring.double;

  switch(result) {
    case 'win':  return (scoring.participate || 1.0) + rule.win;
    case 'loss': return (scoring.participate || 1.0) + rule.loss;
    case 'draw': return (scoring.participate || 1.0);
    default:     return 0;
  }
}

function getTournamentBonus(stage, clubSettings) {
  return (clubSettings?.sports?.tennis?.scoringRule?.tournamentBonus || TENNIS_RULES.tournamentBonus)[stage] || 0;
}

function getRoundWinPoint(matchType, clubSettings) {
  const scoring = clubSettings?.sports?.tennis?.scoringRule?.scoring || TENNIS_RULES.scoring;
  return (scoring[matchType] || scoring.double).win;
}

function getRoundLosePoint(matchType, clubSettings) {
  const scoring = clubSettings?.sports?.tennis?.scoringRule?.scoring || TENNIS_RULES.scoring;
  return (scoring[matchType] || scoring.double).loss;
}
