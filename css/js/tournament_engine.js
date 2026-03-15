// ========================================
// TOURNAMENT_ENGINE.JS - 토너먼트 로직/데이터 처리
// ========================================

function tournamentEngineParseTeamToPlayers(teamName) {
  const t = String(teamName || '').trim();
  if (!t || t === 'BYE' || t.includes('?')) return [];
  return t.split(',').map(s => s.trim()).filter(x => x && x !== 'BYE' && x !== '?');
}

function tournamentEngineBufferTournamentMatch(type, teamA, teamB, winnerTeamName) {
  if (teamA === 'BYE' || teamB === 'BYE' || teamA.includes('?') || teamB.includes('?')) return;
  const homeArr = tournamentEngineParseTeamToPlayers(teamA);
  const awayArr = tournamentEngineParseTeamToPlayers(teamB);
  if (!homeArr.length || !awayArr.length) return;
  const { ts, ds } = nowISO();
  tourBuffer.push({
    id: `${ts}-${Math.floor(Math.random() * 100000)}`, ts, date: ds, type,
    home: homeArr, away: awayArr, hs: 0, as: 0,
    winner: winnerTeamName === teamA ? 'home' : 'away',
    memo: 'tournament',
  });
}

async function tournamentEngineCommitTournamentIfNeeded() {
  if (!currentUserAuth || !currentLoggedPlayer) { requireAuth(() => tournamentEngineCommitTournamentIfNeeded()); return; }
  if (isPracticeMode !== 'real' || tourCommitted || !tourBuffer.length) return;

  snapshotLastRanks();
  tourBuffer.forEach(le => { applyMatchToPlayers(le.type, le.home, le.away, le.winner); matchLog.unshift(le); });

  const ok = await pushWithMatchLogAppend(tourBuffer);
  tourCommitted = ok;

  if (ok) {
    gsAlert(`토너먼트 결과 반영 완료 ✅\n(경기 ${tourBuffer.length}건 MatchLog 누적됨)`);
    updateSeason(); updateWeekly();
    renderStatsPlayerList();
    setTimeout(applyAutofitAllTables, 0);
  } else {
    gsAlert('토너먼트 결과 반영 실패 😵‍💫\n(네트워크/GAS 상태 확인 필요)');
  }
}
