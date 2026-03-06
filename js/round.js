// ========================================
// ROUND.JS - backward-compat bridge
// ========================================

function openRound() { return roundViewOpenRound(); }
function openRoundAuto() { return showViewUI('round-auto'); }
function setRoundOpt(opt) { return roundViewSetRoundOpt(opt); }
function setRoundMode(mode) { return roundViewSetRoundMode(mode); }
function initRoundPlayerPool() { return roundViewInitRoundPlayerPool(); }
function updateRoundCount() { return roundViewUpdateRoundCount(); }
function updateRoundManualTeamPreview() { return roundViewUpdateRoundManualTeamPreview(); }
function checkRoundGenButton() { return roundViewCheckRoundGenButton(); }
function generateRoundSchedule() { return roundViewGenerateRoundSchedule(); }
function generateRoundRobinMatches(participants, options) { return roundEngineGenerateRoundRobinMatches(participants, options); }
function renderRoundMatches() { return roundViewRenderRoundMatches(); }
function setRoundWinner(matchId, side) { return roundViewSetRoundWinner(matchId, side); }
function updateRoundRanking() { return roundViewUpdateRoundRanking(); }
function checkRoundSaveButton() { return roundViewCheckRoundSaveButton(); }
function saveRoundResults() { return roundViewSaveRoundResults(); }
function resetRound() { return roundViewResetRound(); }
function _applyRoundScore(winner, loser, mode, winPoint, losePoint) { return roundEngineApplyRoundScore(winner, loser, mode, winPoint, losePoint); }
function _applyRoundBonus(participant, mode, bonus) { return roundEngineApplyRoundBonus(participant, mode, bonus); }
function convertRoundToTournament() { return roundViewConvertRoundToTournament(); }
function saveRoundDataToLog(finishedMatches) { return roundViewSaveRoundDataToLog(finishedMatches); }
function _calcStandings(finishedMatches) { return roundEngineCalcStandings(finishedMatches); }
function _sortStandings(standings) { return roundEngineSortStandings(standings); }
function openTournamentModal(rankedParticipants) { return roundViewOpenTournamentModal(rankedParticipants); }
function toggleModalParticipant(idx) { return roundViewToggleModalParticipant(idx); }
function updateModalCount() { return roundViewUpdateModalCount(); }
function closeTournamentModal() { return roundViewCloseTournamentModal(); }
function startTournamentFromModal() { return roundViewStartTournamentFromModal(); }
function startRoundMiniTournament(rankedParticipants) { return roundViewStartRoundMiniTournament(rankedParticipants); }
function renderMiniTournament() { return roundViewRenderMiniTournament(); }
function setMiniTournamentWinner(matchId, side) { return roundViewSetMiniTournamentWinner(matchId, side); }

window.openRound = openRound;
window.openRoundAuto = openRoundAuto;
window.setRoundOpt = setRoundOpt;
window.setRoundMode = setRoundMode;
window.initRoundPlayerPool = initRoundPlayerPool;
window.updateRoundCount = updateRoundCount;
window.updateRoundManualTeamPreview = updateRoundManualTeamPreview;
window.checkRoundGenButton = checkRoundGenButton;
window.generateRoundSchedule = generateRoundSchedule;
window.generateRoundRobinMatches = generateRoundRobinMatches;
window.renderRoundMatches = renderRoundMatches;
window.setRoundWinner = setRoundWinner;
window.updateRoundRanking = updateRoundRanking;
window.checkRoundSaveButton = checkRoundSaveButton;
window.saveRoundResults = saveRoundResults;
window.resetRound = resetRound;
window._applyRoundScore = _applyRoundScore;
window._applyRoundBonus = _applyRoundBonus;
window.convertRoundToTournament = convertRoundToTournament;
window.saveRoundDataToLog = saveRoundDataToLog;
window._calcStandings = _calcStandings;
window._sortStandings = _sortStandings;
window.openTournamentModal = openTournamentModal;
window.toggleModalParticipant = toggleModalParticipant;
window.updateModalCount = updateModalCount;
window.closeTournamentModal = closeTournamentModal;
window.startTournamentFromModal = startTournamentFromModal;
window.startRoundMiniTournament = startRoundMiniTournament;
window.renderMiniTournament = renderMiniTournament;
window.setMiniTournamentWinner = setMiniTournamentWinner;
