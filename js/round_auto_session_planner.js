// ROUND_AUTO_SESSION_PLANNER.JS
// GrandSlam Ultimate — 세션 플래너 엔진 v2.1 (v7.5)
//
// ★ v2.0 완전 재설계 — 손대진표 로직 100% 반영
// ★ v2.1 패치 (채코치 검수 반영):
//   1) 자유 페이즈 혼복 우선 점수 추가
//   2) C급 남자 투입 공식 → 미사용 파트너쌍 기준으로 개선
//   3) 원칙 턴 실패 시 참가자 재선발 2회 후 자유 페이즈 전환
//   4) 코트B 부족 처리 다코트 대응 강화
//   5) _spGender() U/빈값 안전 처리
//   6) BT_LIMIT 대형 클럽 대응 상향
//
// 핵심 원칙:
//   코트A(첫번째): 남자 강자 우선 (A급→B급 순, C급 제외)
//   코트Z(마지막): 여자 우선, 부족 시 C급→B급 최하위 보충
//   코트B~Y(중간): 나머지 남자 (유연하게)
//
//   원칙 페이즈: 조합 소진될 때까지 (최대 floor(totalTurns×0.67)턴)
//   자유 페이즈: 출전횟수 균등, 혼복 우선(보너스), 파트너 중복만 피하면서
//
// round_auto_view.js / round_engine.js 완전 무손.

'use strict';

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────
const SESSION_PLANNER_MAX_TURNS   = 8;
const SESSION_PLANNER_MAX_RETRIES = 30;
const SESSION_PLANNER_BT_LIMIT    = 800;  // v2.1: 대형 클럽 대응 상향

// strength 기준값
const SP_LEVEL_BASE = { A: 300, B: 200, C: 100 };

// 점수 가중치
const SP_W_PARTNER_DUP     = 1000;  // 파트너 중복 최우선
const SP_W_MATCH_LEVEL_GAP =   20;  // 상대팀 평균 strength 차이
const SP_W_TEAM_LEVEL_MIX  =   15;  // 팀 내 레벨 혼합 보너스
const SP_W_MIXED_ONE       =    6;  // v2.1: 혼복 1팀 보너스
const SP_W_MIXED_BOTH      =   10;  // v2.1: 양팀 다 혼복 추가 보너스

// 원칙 페이즈 실패 시 재선발 횟수
const SP_PRINCIPLE_RETRY   = 2;

// ─────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────

// v2.1: U/빈값 안전 처리 — F면 F, 나머지는 M (U는 M으로 처리)
function _spGender(p) { return p.gender === 'F' ? 'F' : 'M'; }

function _spStrength(p) {
  const base  = SP_LEVEL_BASE[p.level] || SP_LEVEL_BASE['B'];
  const dRank = Number(p.dRank ?? p.rank ?? 0) || 0;
  return base - dRank;
}

// 여자 또는 C급 남자 → minority (코트Z 우선)
function _spIsMinority(p) {
  return _spGender(p) === 'F' || p.level === 'C';
}

function _spTeamKey(a, b) { return [a, b].sort().join('|'); }

function _spTeamType(p1, p2) {
  const g1 = _spGender(p1), g2 = _spGender(p2);
  if (g1 === 'M' && g2 === 'M') return 'M';
  if (g1 === 'F' && g2 === 'F') return 'F';
  return 'X';
}

function _spMatchTypeValid(ht, at, cfg) {
  const { allowMixed = true, allowGenderBattle = false, allowMixedVsSame = true } = cfg;
  if (!allowMixed && (ht === 'X' || at === 'X')) return false;
  if (!allowGenderBattle && ((ht === 'M' && at === 'F') || (ht === 'F' && at === 'M'))) return false;
  if (!allowMixedVsSame && (ht === 'X') !== (at === 'X')) return false;
  return true;
}

function _spFourCombos(four) {
  return [
    { home: [four[0], four[1]], away: [four[2], four[3]] },
    { home: [four[0], four[2]], away: [four[1], four[3]] },
    { home: [four[0], four[3]], away: [four[1], four[2]] },
  ];
}

function _spShuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─────────────────────────────────────────────
// 조합 점수 (낮을수록 좋음)
//
//   ① 파트너 중복 × 1000  최우선
//   ② 상대팀 strength 차이 × 20
//   ③ 팀 내 레벨 혼합 × -15  (혼합될수록 좋음)
//   ④ v2.1: 혼복 보너스 (자유 페이즈 전용)
//      혼복 1팀: -6, 양팀 혼복: -10 추가
// ─────────────────────────────────────────────
function _spComboScore(combo, partnerUsed, isFreePhase) {
  const hk = _spTeamKey(combo.home[0].name, combo.home[1].name);
  const ak = _spTeamKey(combo.away[0].name, combo.away[1].name);

  // ① 파트너 중복
  const dup = ((partnerUsed.get(hk) || 0) + (partnerUsed.get(ak) || 0)) * SP_W_PARTNER_DUP;

  // ② 상대팀 평균 strength 차이
  const hAvg     = (_spStrength(combo.home[0]) + _spStrength(combo.home[1])) / 2;
  const aAvg     = (_spStrength(combo.away[0]) + _spStrength(combo.away[1])) / 2;
  const matchGap = (Math.abs(hAvg - aAvg) / 100) * SP_W_MATCH_LEVEL_GAP;

  // ③ 팀 내 레벨 혼합 보너스
  const hGap = Math.abs(_spStrength(combo.home[0]) - _spStrength(combo.home[1]));
  const aGap = Math.abs(_spStrength(combo.away[0]) - _spStrength(combo.away[1]));
  const mix  = -((hGap + aGap) / 100) * SP_W_TEAM_LEVEL_MIX;

  // ④ v2.1: 자유 페이즈 혼복 보너스
  let mixedBonus = 0;
  if (isFreePhase) {
    const ht = _spTeamType(combo.home[0], combo.home[1]);
    const at = _spTeamType(combo.away[0], combo.away[1]);
    const isMixedHome = ht === 'X';
    const isMixedAway = at === 'X';
    if (isMixedHome && isMixedAway) {
      mixedBonus = -(SP_W_MIXED_ONE + SP_W_MIXED_BOTH); // 양팀 혼복: 더 큰 보너스
    } else if (isMixedHome || isMixedAway) {
      mixedBonus = -SP_W_MIXED_ONE; // 한팀 혼복: 소폭 보너스
    }
  }

  return dup + matchGap + mix + mixedBonus;
}

// ─────────────────────────────────────────────
// 코트 내 최적 팀 조합 선택
// ─────────────────────────────────────────────
function _spBestCombo(group, partnerUsed, cfg, fallback, isFreePhase = false) {
  const valid = _spFourCombos(group)
    .filter(c => {
      const ht = _spTeamType(c.home[0], c.home[1]);
      const at = _spTeamType(c.away[0], c.away[1]);
      if (!_spMatchTypeValid(ht, at, cfg)) return false;
      if (!fallback) {
        const hk = _spTeamKey(c.home[0].name, c.home[1].name);
        const ak = _spTeamKey(c.away[0].name, c.away[1].name);
        if ((partnerUsed.get(hk) || 0) >= 1) return false;
        if ((partnerUsed.get(ak) || 0) >= 1) return false;
      }
      return true;
    })
    .map(c => ({ ...c, score: _spComboScore(c, partnerUsed, isFreePhase) }))
    .sort((a, b) => a.score - b.score);

  return valid.length > 0 ? valid[0] : null;
}

// ─────────────────────────────────────────────
// v2.1: C급 남자 투입 공식 개선
//   여자 미사용 파트너쌍 수 기준으로 가능 턴 추정
//   Math.floor(usableFemalePairs / 2) ≈ 가능한 턴 수
//   이 값 < 남은 턴 수 → C급 남자 투입
// ─────────────────────────────────────────────
function _spEstimateFemaleTurns(females, partnerUsed) {
  // 여자들 사이 미사용 파트너쌍 수 계산
  let usablePairs = 0;
  for (let i = 0; i < females.length - 1; i++) {
    for (let j = i + 1; j < females.length; j++) {
      const key = _spTeamKey(females[i].name, females[j].name);
      if ((partnerUsed.get(key) || 0) === 0) usablePairs++;
    }
  }
  // 한 턴에 2쌍 필요 → 가능 턴 수 추정
  return Math.floor(usablePairs / 2);
}

// ─────────────────────────────────────────────
// 원칙 페이즈 — 코트Z 그룹 선발
//
//   여자 우선, 출전횟수 적은 순, 강자 우선
//   v2.1: C급 남자 투입 공식 → 미사용 파트너쌍 기준
// ─────────────────────────────────────────────
function _spSelectCourtZ(participants, playCount, partnerUsed, remainingTurns) {
  const females = participants
    .filter(p => _spGender(p) === 'F')
    .sort((a, b) => (playCount[a.name] || 0) - (playCount[b.name] || 0) || _spStrength(b) - _spStrength(a));
  const cMales  = participants
    .filter(p => _spGender(p) === 'M' && p.level === 'C')
    .sort((a, b) => (playCount[a.name] || 0) - (playCount[b.name] || 0) || _spStrength(b) - _spStrength(a));

  // v2.1: 미사용 파트너쌍 기준으로 가능 턴 수 추정
  const estimatedTurns = _spEstimateFemaleTurns(females, partnerUsed);
  const needCMale      = estimatedTurns < remainingTurns;

  let courtZGroup = [];

  if (females.length >= 4 && !needCMale) {
    // 여자만으로 구성
    courtZGroup = females.slice(0, 4);

  } else if (females.length >= 4 && needCMale && cMales.length > 0) {
    // C급 남자 투입: 출전 많은 여자 1명 대기
    const femSorted = females.slice().sort(
      (a, b) => (playCount[b.name] || 0) - (playCount[a.name] || 0) || _spStrength(a) - _spStrength(b)
    );
    const cMale = cMales[0];
    courtZGroup  = [cMale, ...females.filter(f => f.name !== femSorted[0].name).slice(0, 3)];

  } else if (females.length >= 4 && needCMale && cMales.length === 0) {
    // C급 남자 없음 → 여자만으로 구성
    courtZGroup = females.slice(0, 4);

  } else {
    // 여자 4명 미만: 여자 전원 + C급 남자 보충
    courtZGroup = [...females, ...cMales].slice(0, 4);
    // 그래도 4명 미만이면 B급 최하위로 보충
    if (courtZGroup.length < 4) {
      const bMales = participants
        .filter(p => _spGender(p) === 'M' && p.level === 'B' && !courtZGroup.some(q => q.name === p.name))
        .sort((a, b) => (playCount[a.name] || 0) - (playCount[b.name] || 0) || _spStrength(a) - _spStrength(b));
      courtZGroup = [...courtZGroup, ...bMales].slice(0, 4);
    }
  }

  return courtZGroup;
}

// ─────────────────────────────────────────────
// 원칙 페이즈 — 코트A 그룹 선발
// ─────────────────────────────────────────────
function _spSelectCourtA(participants, playCount, courtZNames) {
  const eligible = participants
    .filter(p => _spGender(p) === 'M' && p.level !== 'C' && !courtZNames.has(p.name))
    .sort((a, b) => (playCount[a.name] || 0) - (playCount[b.name] || 0) || _spStrength(b) - _spStrength(a));
  return eligible.slice(0, 4);
}

// ─────────────────────────────────────────────
// 원칙 페이즈 — 중간 코트 선발
// ─────────────────────────────────────────────
function _spSelectMiddleCourts(participants, playCount, usedNames, courtCount) {
  const remaining = participants
    .filter(p => !usedNames.has(p.name))
    .sort((a, b) => (playCount[a.name] || 0) - (playCount[b.name] || 0) || _spStrength(b) - _spStrength(a));

  const groups = [];
  for (let i = 0; i < courtCount - 2; i++) {
    groups.push(remaining.slice(i * 4, (i + 1) * 4));
  }
  return groups;
}

// ─────────────────────────────────────────────
// 그룹에서 매치 생성
// ─────────────────────────────────────────────
function _spMakeMatch(group, courtNo, partnerUsed, cfg, fallback, isFreePhase = false) {
  if (!group || group.length !== 4) return null;
  const best = _spBestCombo(group, partnerUsed, cfg, fallback, isFreePhase);
  if (!best) return null;

  const hk = _spTeamKey(best.home[0].name, best.home[1].name);
  const ak = _spTeamKey(best.away[0].name, best.away[1].name);
  partnerUsed.set(hk, (partnerUsed.get(hk) || 0) + 1);
  partnerUsed.set(ak, (partnerUsed.get(ak) || 0) + 1);

  return {
    home:    best.home.map(p => p.name),
    away:    best.away.map(p => p.name),
    type:    _spTeamType(best.home[0], best.home[1]),
    courtNo,
  };
}

// ─────────────────────────────────────────────
// 원칙 페이즈 — 1턴 생성
//
// v2.1: 코트B 부족 처리 다코트 대응 강화
//   - 부족 인원 수 계산 후 필요한 만큼 C급 남자 순차 이동
//   - 코트Z 재보충: 여자 → B급 하위 순
//   - 중간 코트 전체 순회
// ─────────────────────────────────────────────
function _spPrincipleTurn(participants, courtCount, playCount, partnerUsed, remainingTurns, cfg, fallback) {
  // 코트Z 선발
  let courtZGroup = _spSelectCourtZ(participants, playCount, partnerUsed, remainingTurns);
  if (courtZGroup.length < 4) return null;

  let courtZNames = new Set(courtZGroup.map(p => p.name));

  // v2.1: 코트B 부족 처리 — 필요한 만큼 C급 남자 순차 이동
  if (courtCount > 2) {
    const courtAEligible = participants.filter(
      p => _spGender(p) === 'M' && p.level !== 'C' && !courtZNames.has(p.name)
    );
    const needed       = (courtCount - 1) * 4;
    const shortfall    = needed - courtAEligible.length;

    if (shortfall > 0) {
      // 코트Z에서 C급 남자를 필요한 만큼 꺼냄
      const cMalesInZ = courtZGroup
        .filter(p => _spGender(p) === 'M' && p.level === 'C')
        .slice(0, shortfall);

      if (cMalesInZ.length > 0) {
        let newCourtZ = courtZGroup.filter(p => !cMalesInZ.some(c => c.name === p.name));

        // 코트Z 재보충: 여자 우선 → B급 최하위 순
        const available = participants
          .filter(p => !courtZNames.has(p.name) && !cMalesInZ.some(c => c.name === p.name));

        const extraFemales = available
          .filter(p => _spGender(p) === 'F')
          .sort((a, b) => (playCount[a.name] || 0) - (playCount[b.name] || 0) || _spStrength(b) - _spStrength(a));
        const extraBMales  = available
          .filter(p => _spGender(p) === 'M' && p.level === 'B')
          .sort((a, b) => (playCount[a.name] || 0) - (playCount[b.name] || 0) || _spStrength(a) - _spStrength(b));

        const replenish = [...extraFemales, ...extraBMales];
        while (newCourtZ.length < 4 && replenish.length > 0) {
          newCourtZ.push(replenish.shift());
        }

        if (newCourtZ.length === 4) {
          courtZGroup = newCourtZ;
          courtZNames = new Set(courtZGroup.map(p => p.name));

          // C급 남자들을 중간 코트들에 분배
          const courtAGroup = _spSelectCourtA(participants, playCount, courtZNames);
          const usedNames   = new Set([...courtZNames, ...courtAGroup.map(p => p.name)]);
          const midGroups   = _spSelectMiddleCourts(participants, playCount, usedNames, courtCount);

          // v2.1: 중간 코트 전체 순회하며 C급 남자 배치
          let cMaleIdx = 0;
          for (let i = 0; i < midGroups.length && cMaleIdx < cMalesInZ.length; i++) {
            if (midGroups[i].length < 4) {
              midGroups[i].push(cMalesInZ[cMaleIdx++]);
            }
          }

          return _spBuildTurnFromGroups(courtZGroup, courtAGroup, midGroups, courtCount, partnerUsed, cfg, fallback);
        }
      }
    }
  }

  // 일반 처리
  const courtAGroup = _spSelectCourtA(participants, playCount, courtZNames);
  if (courtAGroup.length < 4 && courtCount > 1) return null;

  const usedNames = new Set([...courtZNames, ...courtAGroup.map(p => p.name)]);
  const midGroups = _spSelectMiddleCourts(participants, playCount, usedNames, courtCount);

  return _spBuildTurnFromGroups(courtZGroup, courtAGroup, midGroups, courtCount, partnerUsed, cfg, fallback);
}

function _spBuildTurnFromGroups(courtZGroup, courtAGroup, midGroups, courtCount, partnerUsed, cfg, fallback) {
  const matches = [];

  // 코트A (인덱스 1)
  if (courtCount >= 1) {
    const group = courtAGroup.length >= 4 ? courtAGroup : courtZGroup;
    const m     = _spMakeMatch(group, 1, partnerUsed, cfg, fallback, false);
    if (!m) return null;
    matches.push(m);
  }

  // 중간 코트들
  for (let i = 0; i < midGroups.length; i++) {
    const m = _spMakeMatch(midGroups[i], i + 2, partnerUsed, cfg, fallback, false);
    if (!m) return null;
    matches.push(m);
  }

  // 코트Z (마지막)
  if (courtCount >= 2) {
    const m = _spMakeMatch(courtZGroup, courtCount, partnerUsed, cfg, fallback, false);
    if (!m) return null;
    matches.push(m);
  }

  return matches;
}

// ─────────────────────────────────────────────
// 자유 페이즈 — 1턴 생성
//   출전횟수 균등, 혼복 우선(보너스), 파트너 중복만 피하기
// ─────────────────────────────────────────────
function _spFreeTurn(participants, courtCount, partnerUsed, cfg, fallback) {
  const results = [];
  let btSteps   = 0;

  // minority를 뒤쪽에 배치해서 마지막 코트로 자연스럽게
  const sorted = participants.slice().sort(
    (a, b) => (_spIsMinority(a) ? 1 : 0) - (_spIsMinority(b) ? 1 : 0) || _spStrength(b) - _spStrength(a)
  );

  function bt(remaining, courtIdx) {
    if (btSteps > SESSION_PLANNER_BT_LIMIT) return false;
    btSteps++;
    if (courtIdx === courtCount) return remaining.length === 0;

    const first = remaining[0];
    const rest  = remaining.slice(1);

    for (let i = 0; i < rest.length - 2; i++) {
      for (let j = i + 1; j < rest.length - 1; j++) {
        for (let k = j + 1; k < rest.length; k++) {
          const four = [first, rest[i], rest[j], rest[k]];
          // v2.1: isFreePhase=true 로 혼복 보너스 활성화
          const best = _spBestCombo(four, partnerUsed, cfg, fallback, true);
          if (!best) continue;

          const hk = _spTeamKey(best.home[0].name, best.home[1].name);
          const ak = _spTeamKey(best.away[0].name, best.away[1].name);
          partnerUsed.set(hk, (partnerUsed.get(hk) || 0) + 1);
          partnerUsed.set(ak, (partnerUsed.get(ak) || 0) + 1);
          results.push({
            home:    best.home.map(p => p.name),
            away:    best.away.map(p => p.name),
            type:    _spTeamType(best.home[0], best.home[1]),
            courtNo: courtIdx + 1,
          });

          const used = new Set(four.map(p => p.name));
          if (bt(remaining.filter(p => !used.has(p.name)), courtIdx + 1)) return true;

          results.pop();
          partnerUsed.set(hk, (partnerUsed.get(hk) || 0) - 1);
          partnerUsed.set(ak, (partnerUsed.get(ak) || 0) - 1);
        }
      }
    }
    return false;
  }

  return bt(sorted, 0) ? results : null;
}

// ─────────────────────────────────────────────
// 참가자 선발
// ─────────────────────────────────────────────
function _spSelectParticipants(pool, courtCount, playCount, cfg) {
  const need = courtCount * 4;
  if (pool.length < need) return null;

  const sorted = _spShuffle(pool).sort(
    (a, b) => (playCount[a.name] || 0) - (playCount[b.name] || 0) || _spStrength(b) - _spStrength(a)
  );

  let selected = sorted.slice(0, need);

  // 성별 보정
  const { allowMixed = true } = cfg;
  function canForm(arr) {
    const m = arr.filter(p => _spGender(p) === 'M').length;
    const f = arr.length - m;
    return m >= 4 || f >= 4 || (allowMixed && m >= 2 && f >= 2);
  }
  if (!canForm(selected)) {
    const rest = sorted.filter(p => !selected.some(s => s.name === p.name));
    for (const cand of rest) {
      const same = selected
        .filter(p => _spGender(p) === _spGender(cand))
        .sort((a, b) => (playCount[b.name] || 0) - (playCount[a.name] || 0));
      if (same.length > 0) {
        const ns = selected.filter(p => p.name !== same[0].name).concat(cand);
        if (canForm(ns)) { selected = ns; break; }
      }
    }
  }

  return selected;
}

// ─────────────────────────────────────────────
// 완료된 턴에서 partnerUsed / playCount 초기값 추출
//   수동 입력 후 이어 생성 시 사용
// ─────────────────────────────────────────────
function _spExtractInitialState(completedMatches) {
  const partnerUsed = new Map();
  const playCount   = {};
  (completedMatches || []).forEach(m => {
    [...(m.home || []), ...(m.away || [])].forEach(name => {
      playCount[name] = (playCount[name] || 0) + 1;
    });
    const hk = [...(m.home || [])].sort().join('|');
    const ak = [...(m.away || [])].sort().join('|');
    if (hk) partnerUsed.set(hk, (partnerUsed.get(hk) || 0) + 1);
    if (ak) partnerUsed.set(ak, (partnerUsed.get(ak) || 0) + 1);
  });
  return { partnerUsed, playCount };
}

// ─────────────────────────────────────────────
// 메인: 세션 전체 플랜 생성
//
// @param completedMatches  완료된 매치 배열 (수동입력 후 이어 생성 시)
//   → partnerUsed / playCount 초기값으로 반영
// ─────────────────────────────────────────────
function sessionPlannerGenerate(pool, courtCount, totalTurns = 6, config = {}, completedMatches = []) {
  const {
    allowMixed        = true,
    allowGenderBattle = false,
    allowMixedVsSame  = true,
  } = config;
  const cfg = { allowMixed, allowGenderBattle, allowMixedVsSame };

  if (!Array.isArray(pool) || pool.length < 4) return null;
  if (courtCount < 1) return null;
  totalTurns = Math.min(Math.max(1, totalTurns), SESSION_PLANNER_MAX_TURNS);

  const initial = _spExtractInitialState(completedMatches);

  for (let attempt = 0; attempt < SESSION_PLANNER_MAX_RETRIES; attempt++) {
    const result = _spTryGenerate(pool, courtCount, totalTurns, cfg, false, initial);
    if (result) return result;
  }

  console.warn('[session-planner] 중복 없는 플랜 실패 → fallback 모드');
  return _spTryGenerate(pool, courtCount, totalTurns, cfg, true, initial);
}

function _spTryGenerate(pool, courtCount, totalTurns, cfg, fallback, initial = {}) {
  // 초기값 반영 (수동입력 시 파트너/출전횟수 이어받기)
  const partnerUsed = initial.partnerUsed ? new Map(initial.partnerUsed) : new Map();
  const playCount   = { ...(initial.playCount || {}) };
  pool.forEach(p => { if (playCount[p.name] === undefined) playCount[p.name] = 0; });

  const maxPrinciple = Math.floor(totalTurns * 0.67);
  const turns        = [];
  let   inFreePhase  = false;

  for (let t = 0; t < totalTurns; t++) {
    const turnNo         = t + 1;
    const remainingTurns = totalTurns - t;

    // 참가자 선발
    let participants = _spSelectParticipants(pool, courtCount, playCount, cfg);
    if (!participants) return null;

    let matches = null;

    // 원칙 페이즈 시도
    if (!inFreePhase && turnNo <= maxPrinciple && courtCount > 1) {

      // v2.1: 원칙 턴 실패 시 재선발 최대 SP_PRINCIPLE_RETRY회 후 자유 전환
      for (let retry = 0; retry <= SP_PRINCIPLE_RETRY; retry++) {
        if (retry > 0) {
          // 재선발 시도
          participants = _spSelectParticipants(pool, courtCount, playCount, cfg);
          if (!participants) break;
        }
        matches = _spPrincipleTurn(
          participants, courtCount, playCount, partnerUsed, remainingTurns, cfg, fallback
        );
        if (matches) break;
      }

      if (!matches) {
        // 재선발 모두 실패 → 자유 페이즈 전환
        inFreePhase = true;
      }
    }

    // 자유 페이즈 (또는 1코트)
    if (!matches) {
      // 자유 페이즈에서도 참가자 재선발 (원칙 페이즈 실패 후 바뀔 수 있음)
      if (!participants) {
        participants = _spSelectParticipants(pool, courtCount, playCount, cfg);
      }
      if (!participants) return null;
      matches = _spFreeTurn(participants, courtCount, partnerUsed, cfg, fallback);
    }

    if (!matches) return null;

    participants.forEach(p => { playCount[p.name] = (playCount[p.name] || 0) + 1; });
    turns.push({ turnNo, matches, isFreePhase: inFreePhase || turnNo > maxPrinciple });
  }

  return turns;
}

// ─────────────────────────────────────────────
// View 포맷 변환
// ─────────────────────────────────────────────
function sessionPlannerToViewFormat(plannerTurns) {
  if (!Array.isArray(plannerTurns)) return [];
  return plannerTurns.map(turn => ({
    turnNo:  turn.turnNo,
    status:  'planned',
    matches: (turn.matches || []).map((m, idx) => ({
      id:      `sp-${turn.turnNo}-${idx + 1}`,
      turnNo:  turn.turnNo,
      courtNo: m.courtNo,
      home:    m.home,
      away:    m.away,
      type:    m.type,
      winner:  null,
      _source: 'session-planner',
    })),
  }));
}

// ─────────────────────────────────────────────
// 검증 유틸
// ─────────────────────────────────────────────
function sessionPlannerValidate(turns) {
  const report = {
    ok: true, partnerDups: [], conflicts: [],
    playCounts: {}, minPlay: Infinity, maxPlay: -Infinity,
  };
  const partnerMap = new Map();

  turns.forEach(turn => {
    const inTurn = new Set();
    turn.matches.forEach(m => {
      [...m.home, ...m.away].forEach(name => {
        if (inTurn.has(name)) { report.conflicts.push({ turnNo: turn.turnNo, name }); report.ok = false; }
        inTurn.add(name);
        report.playCounts[name] = (report.playCounts[name] || 0) + 1;
      });
      [[...m.home].sort(), [...m.away].sort()].forEach(team => {
        const key  = team.join('|');
        const prev = partnerMap.get(key);
        if (prev !== undefined) {
          report.partnerDups.push({ key, turns: [prev, turn.turnNo] });
          report.ok = false;
        } else {
          partnerMap.set(key, turn.turnNo);
        }
      });
    });
  });

  const counts = Object.values(report.playCounts);
  report.minPlay = Math.min(...counts);
  report.maxPlay = Math.max(...counts);
  return report;
}

// ─────────────────────────────────────────────
// 전역 노출
// ─────────────────────────────────────────────
window.sessionPlannerGenerate     = sessionPlannerGenerate;
window.sessionPlannerToViewFormat = sessionPlannerToViewFormat;
window.sessionPlannerValidate     = sessionPlannerValidate;
