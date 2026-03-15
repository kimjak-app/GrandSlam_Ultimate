// ========================================
// GAME_ENGINE.JS - 게임 데이터/로직 처리
// ========================================

function validateSaveInput(isPracticeMode, hs, as, matchType, homeTeam, awayTeam) {
  if (isPracticeMode === 'practice') return '지금은 연습 모드입니다! 기록이 저장되지 않습니다. 🧪';
  if (!hs || !as || hs == as) return '점수 확인!';

  const max = matchType === 'double' ? 2 : 1;
  if (homeTeam.length !== max || awayTeam.length !== max) return '팀 선택 먼저!';

  return '';
}

function materializeHiddenPlayers(teamNames) {
  teamNames.forEach(name => {
    if (HIDDEN_PLAYERS.includes(name) && !players.find(p => p.name === name)) {
      players.push(ensure({ name, isGuest: true }));
    }
  });
}

function createMatchLogEntry(matchType, homeTeam, awayTeam, hs, as) {
  const homeScore = parseInt(hs, 10);
  const awayScore = parseInt(as, 10);
  const { ts, ds } = nowISO();

  return {
    id: `${ts}-${Math.floor(Math.random() * 100000)}`,
    ts,
    date: ds,
    type: matchType,
    home: [...homeTeam],
    away: [...awayTeam],
    hs: homeScore,
    as: awayScore,
    winner: homeScore > awayScore ? 'home' : 'away',
  };
}

function snapshotSaveState() {
  return {
    prevPlayers: players.map(p => Object.assign({}, p)),
    prevMatchLogLength: matchLog.length,
  };
}

function applyMatchAndAppendLog(matchType, homeTeam, awayTeam, winner, logEntry) {
  applyMatchToPlayers(matchType, [...homeTeam], [...awayTeam], winner);
  matchLog.unshift(logEntry);
}

function rollbackSaveState(snapshot) {
  players.forEach((p, i) => {
    if (snapshot.prevPlayers[i]) Object.assign(p, snapshot.prevPlayers[i]);
  });
  matchLog = matchLog.slice(snapshot.prevMatchLogLength > 0 ? 0 : 1);
}

function renamePlayerEverywhere(oldName, newName) {
  const p = players.find(x => x.name === oldName);
  if (!p) return false;

  p.name = newName.trim();
  matchLog.forEach(l => {
    if (Array.isArray(l.home)) l.home = l.home.map(n => n === oldName ? p.name : n);
    if (Array.isArray(l.away)) l.away = l.away.map(n => n === oldName ? p.name : n);
  });
  return true;
}

function createPlayer(name, isGuest, gender, level) {
  if (!name || players.find(p => p.name === name)) return false;
  players.push(ensure({ name, isGuest, gender, level }));
  return true;
}

function toggleGuestState(name) {
  const p = players.find(x => x.name === name);
  if (!p) return null;
  p.isGuest = !p.isGuest;
  return p;
}

function cycleLevel(name) {
  const p = players.find(x => x.name === name);
  if (!p) return null;
  const levels = ['A', 'B', 'C'];
  p.level = levels[(levels.indexOf(p.level || 'A') + 1) % levels.length];
  return p;
}

function flipGender(name) {
  const p = players.find(x => x.name === name);
  if (!p) return null;
  p.gender = p.gender === 'F' ? 'M' : 'F';
  return p;
}

function pickTeams(name, matchType, homeTeam, awayTeam) {
  const max = matchType === 'double' ? 2 : 1;
  let h = [...homeTeam];
  let a = [...awayTeam];

  if (h.includes(name)) h = h.filter(x => x !== name);
  else if (a.includes(name)) a = a.filter(x => x !== name);
  else if (h.length < max) h.push(name);
  else if (a.length < max) a.push(name);
  else return { homeTeam, awayTeam, changed: false };

  return { homeTeam: h, awayTeam: a, changed: true };
}

function autoMixedDoubleTeams() {
  const pool = players.filter(p => !p.isGuest && (!p.status || p.status === 'active'));
  const males = pool.filter(p => p.gender !== 'F').sort((a, b) => (b.score || 0) - (a.score || 0));
  const females = pool.filter(p => p.gender === 'F').sort((a, b) => (b.score || 0) - (a.score || 0));

  if (males.length < 2 || females.length < 2) {
    return {
      ok: false,
      message: `혼성 복식을 위해 남자 2명 이상, 여자 2명 이상이 필요해요.\n현재: 남자 ${males.length}명, 여자 ${females.length}명`,
    };
  }

  return {
    ok: true,
    homeTeam: [males[0].name, females[1].name],
    awayTeam: [males[1].name, females[0].name],
    message: `혼성 자동 배치 완료!\n[남] ${males[0].name} + [여] ${females[1].name}\nvs\n[남] ${males[1].name} + [여] ${females[0].name}`,
  };
}

function resetAllScoresKeepPlayersData() {
  const scoreFields = [
    'score', 'wins', 'losses', 'last',
    'dScore', 'dWins', 'dLosses', 'lastD',
    'sScore', 'sWins', 'sLosses', 'lastS',
    'weekly', 'wWins', 'wLosses',
    'wdScore', 'wsScore', 'wdWins', 'wdLosses', 'wsWins', 'wsLosses',
    'lastW', 'lastWD', 'lastWS',
    'mScore', 'mWins', 'mLosses', 'lastM'
  ];

  players.forEach(p => {
    scoreFields.forEach(field => {
      p[field] = 0;
    });
  });
  matchLog = [];
}

function resetWeeklyOnlyData() {
  players.forEach(p => {
    ['weekly', 'wdScore', 'wsScore', 'wWins', 'wLosses', 'wdWins', 'wdLosses', 'wsWins', 'wsLosses', 'lastW', 'lastWD', 'lastWS'].forEach(f => p[f] = 0);
  });
}

window.GameEngine = {
  validateSaveInput,
  materializeHiddenPlayers,
  createMatchLogEntry,
  snapshotSaveState,
  applyMatchAndAppendLog,
  rollbackSaveState,
  renamePlayerEverywhere,
  createPlayer,
  toggleGuestState,
  cycleLevel,
  flipGender,
  pickTeams,
  autoMixedDoubleTeams,
  resetAllScoresKeepPlayersData,
  resetWeeklyOnlyData,
};
