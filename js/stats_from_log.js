// ========================================
// STATS_FROM_LOG.JS - 로그 기반 통계 엔진 (검증용)
// ========================================

function _statsMetaMap(playersMeta) {
  const map = new Map();
  if (Array.isArray(playersMeta)) {
    playersMeta.forEach(p => {
      if (!p) return;
      const key = p.id || p.name;
      if (!key) return;
      map.set(key, p);
      if (p.name && key !== p.name) map.set(p.name, p);
    });
  } else if (playersMeta && typeof playersMeta === 'object') {
    Object.entries(playersMeta).forEach(([k, v]) => {
      if (!k || !v) return;
      map.set(k, v);
      if (v.name && k !== v.name) map.set(v.name, v);
    });
  }
  return map;
}

function _statsInitPlayer() {
  return {
    score: 0,
    wins: 0,
    losses: 0,
    sScore: 0,
    dScore: 0,
    wsScore: 0,
    wdScore: 0
  };
}

function _statsEnsurePlayer(outPlayers, key) {
  if (!outPlayers[key]) outPlayers[key] = _statsInitPlayer();
  return outPlayers[key];
}

function _statsCalcDeltas(type, isWin) {
  if (typeof calcDeltas === 'function') return calcDeltas(type, isWin);
  const rule = (TENNIS_RULES && TENNIS_RULES.scoring && TENNIS_RULES.scoring[type])
    ? TENNIS_RULES.scoring[type]
    : (TENNIS_RULES && TENNIS_RULES.scoring ? TENNIS_RULES.scoring.double : { win: 0, loss: 0 });
  const participate = TENNIS_RULES && TENNIS_RULES.scoring ? TENNIS_RULES.scoring.participate : 0;
  const earn = participate + (isWin ? rule.win : rule.loss);
  if (type === 'double' || type === 'mixed') return { total: earn, d: earn, s: 0 };
  return { total: earn, d: 0, s: earn };
}

function _statsGetGender(name, metaMap) {
  const m = metaMap.get(name);
  return m && (m.gender === 'F' || m.gender === 'M') ? m.gender : 'M';
}

function _statsIsDateInRange(date, weekStart, weekEnd) {
  if (!date || typeof date !== 'string') return false;
  if (weekStart && date < weekStart) return false;
  if (weekEnd && date > weekEnd) return false;
  return true;
}

function computeStats(matchLog, playersMeta, opts = {}) {
  const out = { players: {} };
  const logs = Array.isArray(matchLog) ? matchLog : [];
  const metaMap = _statsMetaMap(playersMeta);
  const weekStart = opts.weekStart || null;
  const weekEnd = opts.weekEnd || null;

  logs.forEach(m => {
    if (!m || typeof m !== 'object') return;

    if (m.type === 'bonus') {
      const point = Number(m.point || 0);
      const home = Array.isArray(m.home) ? m.home : [];
      const away = Array.isArray(m.away) ? m.away : [];
      const targets = m.winner === 'away' ? away : home;
      const inWeekly = _statsIsDateInRange(m.date, weekStart, weekEnd);
      targets.forEach(name => {
        const p = _statsEnsurePlayer(out.players, name);
        p.score += point;
        const isSingleBonus = (m.memo || '').toLowerCase().includes('single') || m.matchType === 'single';
        if (isSingleBonus) p.sScore += point;
        else p.dScore += point;
        if (inWeekly) {
          if (isSingleBonus) p.wsScore += point;
          else p.wdScore += point;
        }
      });
      return;
    }

    const type = m.type || 'double';
    const home = Array.isArray(m.home) ? m.home : [];
    const away = Array.isArray(m.away) ? m.away : [];

    const homeMixed = type === 'double' && home.length > 1 && (() => {
      const g = home.map(n => _statsGetGender(n, metaMap));
      return g.includes('M') && g.includes('F');
    })();
    const awayMixed = type === 'double' && away.length > 1 && (() => {
      const g = away.map(n => _statsGetGender(n, metaMap));
      return g.includes('M') && g.includes('F');
    })();

    const isCrossSingle = type === 'single' && home.length === 1 && away.length === 1
      && _statsGetGender(home[0], metaMap) !== _statsGetGender(away[0], metaMap);

    const isCrossDouble = type === 'double' && !homeMixed && !awayMixed && (() => {
      const hg = home.map(n => _statsGetGender(n, metaMap));
      const ag = away.map(n => _statsGetGender(n, metaMap));
      return (hg.every(g => g === 'M') && ag.every(g => g === 'F'))
        || (hg.every(g => g === 'F') && ag.every(g => g === 'M'));
    })();

    [[home, true], [away, false]].forEach(([arr, isHomeSide]) => {
      const isW = isHomeSide ? m.winner === 'home' : m.winner === 'away';
      const d = _statsCalcDeltas(type, isW);
      const inWeekly = _statsIsDateInRange(m.date, weekStart, weekEnd);

      arr.forEach(name => {
        const p = _statsEnsurePlayer(out.players, name);

        p.score += d.total;
        p.wins += isW ? 1 : 0;
        p.losses += isW ? 0 : 1;

        if (type === 'double') {
          if (!isCrossDouble) p.dScore += d.d;
        } else if (!isCrossSingle) {
          p.sScore += d.s;
        }

        if (inWeekly) {
          if (type === 'double') {
            if (!isCrossDouble) p.wdScore += d.d;
          } else if (!isCrossSingle) {
            p.wsScore += d.s;
          }
        }
      });
    });
  });

  return out;
}

function _deriveWeeklyBoundsFromNow() {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon);
  monday.setHours(0, 0, 0, 0);

  const lastMonday = new Date(monday);
  lastMonday.setDate(monday.getDate() - 7);
  const lastSunday = new Date(monday.getTime() - 86400000);

  const toStr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const mondayStr = toStr(monday);
  const lastMondayStr = toStr(lastMonday);
  const lastSundayStr = toStr(lastSunday);

  const logs = Array.isArray(window.matchLog) ? window.matchLog : [];
  const thisWeekLogs = logs.filter(m => m && m.date >= mondayStr);
  if (thisWeekLogs.length > 0) return { weekStart: mondayStr, weekEnd: null };
  return { weekStart: lastMondayStr, weekEnd: lastSundayStr };
}

function compareLegacyVsEngine() {
  const logs = Array.isArray(window.matchLog) ? window.matchLog : [];
  const legacyPlayers = Array.isArray(window.players) ? window.players : [];
  const bounds = _deriveWeeklyBoundsFromNow();
  const engine = computeStats(logs, legacyPlayers, bounds);

  const keys = new Set([
    ...legacyPlayers.map(p => p && p.name).filter(Boolean),
    ...Object.keys(engine.players || {})
  ]);

  let mismatch = false;
  keys.forEach(playerKey => {
    const lp = legacyPlayers.find(p => p && p.name === playerKey) || {};
    const ep = (engine.players && engine.players[playerKey]) || _statsInitPlayer();

    const legacy = {
      score: Number(lp.score || 0),
      wins: Number(lp.wins || 0),
      losses: Number(lp.losses || 0),
      sScore: Number(lp.sScore || 0),
      dScore: Number(lp.dScore || 0),
      wsScore: Number(lp.wsScore || 0),
      wdScore: Number(lp.wdScore || 0)
    };
    const engineOne = {
      score: Number(ep.score || 0),
      wins: Number(ep.wins || 0),
      losses: Number(ep.losses || 0),
      sScore: Number(ep.sScore || 0),
      dScore: Number(ep.dScore || 0),
      wsScore: Number(ep.wsScore || 0),
      wdScore: Number(ep.wdScore || 0)
    };

    const same = Object.keys(legacy).every(k => legacy[k] === engineOne[k]);
    if (!same) {
      mismatch = true;
      console.warn('STAT MISMATCH', playerKey, { legacy }, { engine: engineOne });
    }
  });

  if (!mismatch) console.log('Stats parity verified: legacy == engine');
  return { ok: !mismatch, compared: keys.size, bounds };
}

window.computeStats = computeStats;

function getStatsEngine(opts = {}) {
  const engine = computeStats(window.matchLog, window.players, opts);
  window.statsEngine = engine;
  return engine;
}

function getPlayerStats(name, opts = {}) {
  if (!name) return _statsInitPlayer();
  const engine = getStatsEngine(opts);
  return (engine.players && engine.players[name]) || _statsInitPlayer();
}

window.getStatsEngine = getStatsEngine;
window.getPlayerStats = getPlayerStats;
window.compareLegacyVsEngine = compareLegacyVsEngine;
window._debugCompareStats = compareLegacyVsEngine;
