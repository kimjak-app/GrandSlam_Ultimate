// ========================================
// TOURNAMENT.JS - backward-compat bridge
// ========================================

function initTournament() { return tournamentViewInitTournament(); }
function tourPick(cb) { return tournamentViewTourPick(cb); }
function upCnt() { return tournamentViewUpCnt(); }
function renderManualTeamsPreview() { return tournamentViewRenderManualTeamsPreview(); }
function setOpt(k, v, el) { return tournamentViewSetOpt(k, v, el); }
function initPointsAndRules() { return tournamentViewInitPointsAndRules(); }
function makeBracket() { return tournamentViewMakeBracket(); }
function autoResolveByes_FirstRoundOnly(size) { return tournamentViewAutoResolveByes_FirstRoundOnly(size); }
function renderWingTree(matches) { return tournamentViewRenderWingTree(matches); }
function getMatchBoxHtml(idx, m, round, isFinal = false) { return tournamentViewGetMatchBoxHtml(idx, m, round, isFinal); }
function getEmptyBoxHtml(idx, round, isFinal = false) { return tournamentViewGetEmptyBoxHtml(idx, round, isFinal); }
function updateScoreBoard() { return tournamentViewUpdateScoreBoard(); }
function parseTeamToPlayers(teamName) { return tournamentEngineParseTeamToPlayers(teamName); }
function bufferTournamentMatch(type, teamA, teamB, winnerTeamName) { return tournamentEngineBufferTournamentMatch(type, teamA, teamB, winnerTeamName); }
function commitTournamentIfNeeded() { return tournamentEngineCommitTournamentIfNeeded(); }
function win(round, matchIdx, teamIdx, name, el) { return tournamentViewWin(round, matchIdx, teamIdx, name, el); }
function registerLosers(teamName) { return tournamentViewRegisterLosers(teamName); }
function injectPartner(name, chipElement) { return tournamentViewInjectPartner(name, chipElement); }
function showSinglePrelimUI(a, b) { return tournamentViewShowSinglePrelimUI(a, b); }
function resolveSinglePrelim(winnerName) { return tournamentViewResolveSinglePrelim(winnerName); }
function resetPage() { return tournamentViewResetPage(); }

window.initTournament = initTournament;
window.tourPick = tourPick;
window.upCnt = upCnt;
window.renderManualTeamsPreview = renderManualTeamsPreview;
window.setOpt = setOpt;
window.initPointsAndRules = initPointsAndRules;
window.makeBracket = makeBracket;
window.autoResolveByes_FirstRoundOnly = autoResolveByes_FirstRoundOnly;
window.renderWingTree = renderWingTree;
window.getMatchBoxHtml = getMatchBoxHtml;
window.getEmptyBoxHtml = getEmptyBoxHtml;
window.updateScoreBoard = updateScoreBoard;
window.parseTeamToPlayers = parseTeamToPlayers;
window.bufferTournamentMatch = bufferTournamentMatch;
window.commitTournamentIfNeeded = commitTournamentIfNeeded;
window.win = win;
window.registerLosers = registerLosers;
window.injectPartner = injectPartner;
window.showSinglePrelimUI = showSinglePrelimUI;
window.resolveSinglePrelim = resolveSinglePrelim;
window.resetPage = resetPage;
