/**
 * Handles incoming telemetry keys and values streamed from the Arduino.
 * Fully hardened with whitespace trimming, UI loading hooks, and menu selection parsing.
 */
function handleTelemetry(key, val) {
    switch (key) {
        case 'STATUS':
            gameState.systemState = val;
            if (typeof updateUIState === 'function') updateUIState();
            break;

        case 'GAME':
            gameState.currentGame = val;
            if (typeof updateUIState === 'function') updateUIState();
            break;

        case 'MENU':
            gameState.menuSelection = parseInt(val, 10) || 1;
            if (typeof updateMenuSelection === 'function') {
                updateMenuSelection(gameState.menuSelection);
            }
            break;

        case 'SCORE':
            gameState.currentScore = parseInt(val, 10) || 0;
            if (typeof updateScoreDisplay === 'function') updateScoreDisplay(gameState.currentScore);
            break;

        case 'BEST':
            gameState.bestScore = parseInt(val, 10) || 0;
            if (typeof updateBestScoreDisplay === 'function') updateBestScoreDisplay(gameState.bestScore);
            break;

        case 'XP':
            gameState.totalXP = parseInt(val, 10) || 0;
            if (typeof updateXPBadge === 'function') updateXPBadge(gameState.totalXP);
            break;

        case 'PING':
            if (typeof resetConnectionWatchdog === 'function') resetConnectionWatchdog();
            break;

        case 'FRAME':
            if (typeof renderMatrixFrame === 'function') renderMatrixFrame(val);
            break;

        case 'MSG':
            if (val.startsWith('STARTING:')) {
                const gameName = val.substring(val.indexOf(':') + 1);
                if (typeof showLoadingOverlay === 'function') {
                    showLoadingOverlay(`Launching ${gameName}...`);
                }
            } else if (val.startsWith('STARTED:')) {
                if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
                const gameName = val.substring(val.indexOf(':') + 1);
                if (typeof activateGameView === 'function') activateGameView(gameName);
            } else if (val.startsWith('FPS:')) {
                const fpsVal = val.substring(val.indexOf(':') + 1);
                if (typeof updateDebugFPS === 'function') updateDebugFPS(fpsVal);
            } else {
                if (typeof appendTerminalLog === 'function') {
                    appendTerminalLog(`[Arduino]: ${val}`);
                }
            }
            break;

        default:
            console.warn(`[Serial Warning] Unhandled telemetry key: ${key} = ${val}`);
            break;
    }
}

function processIncomingLine(line) {
    line = line.trim();
    if (!line) return;

    const separatorIndex = line.indexOf(':');
    if (separatorIndex !== -1) {
        const key = line.substring(0, separatorIndex).trim();
        const val = line.substring(separatorIndex + 1).trim();
        handleTelemetry(key, val);
    } else {
        if (typeof appendTerminalLog === 'function') {
            appendTerminalLog(`[Raw]: ${line}`);
        }
    }
}

/**
 * Handles incoming menu selection changes from the physical buttons on the shield
 */
function updateMenuSelection(selection) {
    console.log("Menu Selection Index:", selection);
    
    // Example UI hook to highlight matching game elements in your HTML DOM:
    // document.querySelectorAll('.game-item').forEach((el, index) => {
    //     if (index + 1 === selection) {
    //         el.classList.add('selected');
    //     } else {
    //         el.classList.remove('selected');
    //     }
    // });
}
