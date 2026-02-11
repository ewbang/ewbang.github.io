// 全局错误处理，捕获工作线程错误
window.addEventListener('error', (event) => {
        if (event.message && (event.message.includes('worker') || event.filename.includes('worker'))) {
        console.error('[Rapfi] 捕获到工作线程错误:', event.error || event.message);
        rapfiThinking = false;
        if (typeof clearThinkingTimer === 'function') clearThinkingTimer();
        showToast('AI引擎出现工作线程错误，已切换至备用方案');
        if (typeof fallbackToJSAI === 'function') {
            fallbackToJSAI();
        }
    }
});

window.addEventListener('unhandledrejection', (event) => {
        if (event.reason && (event.reason.message || '').includes('worker')) {
        console.error('[Rapfi] 捕获到未处理的 Promise 拒绝:', event.reason);
        rapfiThinking = false;
        if (typeof clearThinkingTimer === 'function') clearThinkingTimer();
        showToast('AI引擎出现异步错误，已切换至备用方案');
        if (typeof fallbackToJSAI === 'function') {
            fallbackToJSAI();
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const gameState = {
        board: Array(15).fill().map(() => Array(15).fill(null)),
        currentPlayer: 'black',
        gameOver: false,
        moveHistory: [],
        moveCount: 0,
        forbiddenEnabled: true,
        showForbidden: true,
        showNumber: true,
        mode: 'pvp',
        aiTimeLimit: 3000
    };

    const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];
    const GRID_SIZE = 520 / 14;

    // DOM元素
    const boardGrid = document.getElementById('board-grid');
    const coordLeft = document.getElementById('coord-left');
    const coordBottom = document.getElementById('coord-bottom');
    const undoBtn = document.getElementById('undo-btn');
    const resetBtn = document.getElementById('reset-btn');
    const saveBtn = document.getElementById('save-btn');
    const winnerModal = document.getElementById('winner-modal');
    const winnerTitle = document.getElementById('winner-title');
    const winnerText = document.getElementById('winner-text');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const forbiddenModal = document.getElementById('forbidden-modal');
    const forbiddenText = document.getElementById('forbidden-text');
    const forbiddenCloseBtn = document.getElementById('forbidden-close-btn');
    const rulesBtn = document.getElementById('rules-btn');
    const rulesModal = document.getElementById('rules-modal');
    const rulesCloseBtn = document.getElementById('rules-close-btn');
    const forbiddenToggle = document.getElementById('forbidden-toggle');
    const showForbiddenToggle = document.getElementById('show-forbidden-toggle');
    const showNumberToggle = document.getElementById('show-number-toggle');
    const blackPlayer = document.getElementById('black-player');
    const whitePlayer = document.getElementById('white-player');
    const blackStatus = document.getElementById('black-status');
    const whiteStatus = document.getElementById('white-status');
    const toast = document.getElementById('toast');
    const positionCodeDisplay = document.getElementById('position-code-display');
    const copyCodeBtn = document.getElementById('copy-code-btn');
    const positionCodeInput = document.getElementById('position-code-input');
    const applyCodeBtn = document.getElementById('apply-code-btn');
    const gameModeGroup = document.getElementById('game-mode-group');
    const analysisDepthEl = document.getElementById('analysis-depth');
    const analysisEvalEl = document.getElementById('analysis-eval');
    const analysisSpeedEl = document.getElementById('analysis-speed');
    const analysisNodesEl = document.getElementById('analysis-nodes');
    const analysisTimeEl = document.getElementById('analysis-time');
    const analysisLineEl = document.getElementById('analysis-line');

    // === Rapfi WASM AI 引擎 ===
    let rapfiReady = false;
    let rapfiThinking = false;
    let rapfiModule = null;
    let rapfiMoveExpectedCount = -1; // 用于验证响应是否对应当前局面
    let rapfiResponseTimer = null;
    let rapfiRetryCount = 0;
    let rapfiRestartAttempts = 0;
    const RAPFI_MAX_RESTARTS = 3;
    let rapfiThinkingStartTime = 0;
    let rapfiThinkingIntervalId = null;

    function clearThinkingTimer() {
        if (rapfiThinkingIntervalId) {
            clearInterval(rapfiThinkingIntervalId);
            rapfiThinkingIntervalId = null;
        }
    }

    function startThinkingTimer(statusEl) {
        clearThinkingTimer();
        if (!statusEl) return;
        rapfiThinkingStartTime = Date.now();
        statusEl.textContent = '思考中';
        rapfiThinkingIntervalId = setInterval(() => {
            if (!rapfiThinking) {
                clearThinkingTimer();
                return;
            }
            const ms = Date.now() - rapfiThinkingStartTime;
            statusEl.textContent = ms < 1 ? '思考中' : '思考中 ' + ms + 'ms';
        }, 10);
    }

    function resetAnalysisDisplay() {
        if (analysisDepthEl) analysisDepthEl.textContent = '0-0';
        if (analysisEvalEl) analysisEvalEl.textContent = '—';
        if (analysisSpeedEl) analysisSpeedEl.textContent = '0';
        if (analysisNodesEl) analysisNodesEl.textContent = '0';
        if (analysisTimeEl) analysisTimeEl.textContent = '0.0秒';
        if (analysisLineEl) analysisLineEl.textContent = '';
    }

    function updateAnalysisFromMessage(line) {
        if (!line || typeof line !== 'string' || !line.startsWith('MESSAGE ')) return;
        const s = line.slice(8).trim();
        const depthMatch = s.match(/Depth\s+(\d+-\d+)/);
        const evalMatch = s.match(/Eval\s+(-?\d+)/);
        const timeMatch = s.match(/Time\s+(\d+)ms/);
        const speedMatch = s.match(/Speed\s+(\d+)/);
        const nodeMatch = s.match(/Node\s+([\dKkMm]+)/);
        const parts = s.split(/\s*\|\s*/);
        let lineText = '';
        if (parts.length > 0) {
            const last = parts[parts.length - 1].trim();
            if (/[A-Oa-o]\d+/.test(last) && !/^Time\s+\d+ms$/.test(last)) lineText = last;
        }
        if (analysisDepthEl && depthMatch) analysisDepthEl.textContent = depthMatch[1];
        if (analysisEvalEl && evalMatch) analysisEvalEl.textContent = evalMatch[1];
        if (analysisSpeedEl && speedMatch) analysisSpeedEl.textContent = speedMatch[1];
        if (analysisNodesEl && nodeMatch) analysisNodesEl.textContent = nodeMatch[1];
        if (analysisTimeEl && timeMatch) {
            const ms = parseInt(timeMatch[1], 10);
            analysisTimeEl.textContent = (ms / 1000).toFixed(1) + '秒';
        }
        if (analysisLineEl && lineText) analysisLineEl.textContent = lineText;
    }

    function loadRapfiEngine() {
        // 检查是否支持 SharedArrayBuffer
        if (typeof SharedArrayBuffer === 'undefined') {
            console.warn('[Rapfi] SharedArrayBuffer 不可用，正在尝试加载 COI Service Worker');
            // 尝试加载 COI Service Worker 来启用 SharedArrayBuffer
            loadCOIServiceWorker();
            return;
        }

        // 如果已经跨源隔离，则直接加载引擎
        if (window.crossOriginIsolated !== false) {
            initializeRapfiEngine();
        } else {
            // 否则先尝试加载 COI Service Worker
            loadCOIServiceWorker();
        }
    }

    function loadCOIServiceWorker() {
        // 检查是否已经有 controller，如果没有则注册 COI Service Worker
        if ('serviceWorker' in navigator && !navigator.serviceWorker.controller) {
            const swScript = document.createElement('script');
            swScript.src = 'coi-serviceworker.min.js';
            swScript.onload = () => {
                // 在 Service Worker 注册后刷新页面以应用 COOP/COEP 头部
                if (!window.crossOriginIsolated) {
                    console.log('[Rapfi] 正在刷新页面以启用跨源隔离...');
                    setTimeout(() => window.location.reload(), 500);
                } else {
                    // 如果已经跨源隔离，则初始化引擎
                    initializeRapfiEngine();
                }
            };
            swScript.onerror = () => {
                console.warn('[Rapfi] COI Service Worker 加载失败，尝试直接加载引擎');
                initializeRapfiEngine();
            };
            document.head.appendChild(swScript);
        } else {
            // 如果已经有 controller 或不支持 service worker，则直接初始化
            initializeRapfiEngine();
        }
    }

    function initializeRapfiEngine() {
        const script = document.createElement('script');
        script.src = 'ai/rapfi-multi-simd128.js';
        script.onload = () => {
            // 设置 Rapfi 配置
            const config = {
                locateFile: (path) => {
                    // 确保引擎相关的文件（.wasm/.data/worker/js）都从 ai/ 目录加载
                    // 如果是绝对 URL 或以协议开头，则直接返回原路径
                    if (/^([a-z]+:)?\/\//i.test(path) || path.startsWith('/')) return path;
                    return 'ai/' + path;
                },
                noExitRuntime: true,
                onReceiveStdout: (line) => handleRapfiOutput(line),
                onReceiveStderr: (line) => {
                    console.error('[Rapfi] 错误:', line);
                    // 若 stderr 中出现 Worker/线程相关的错误信息，主动回退到内置 AI
                    if (/worker/i.test(line) || /sent an error/i.test(line) || /Uncaught Event/i.test(line)) {
                        rapfiReady = false;
                        rapfiThinking = false;
                        fallbackToJSAI();
                    }
                },
                onExit: (code) => {
                    rapfiReady = false;
                    rapfiThinking = false;
                    clearThinkingTimer();
                    console.log(`[Rapfi] 引擎退出 (代码: ${code})`);
                    const isNormalExit = (code === 0);
                    // 引擎在返回落子后可能会自行 exit(0)，此时自动重启以便下一手继续使用
                    if (rapfiRestartAttempts < RAPFI_MAX_RESTARTS) {
                        rapfiRestartAttempts++;
                        setTimeout(() => {
                            initializeRapfiEngine();
                        }, 800);
                    } else {
                        showToast('AI引擎不可用，请刷新页面重试');
                        fallbackToJSAI();
                    }
                },
                // 添加错误处理
                onAbort: (what) => {
                    console.error('[Rapfi] 引擎异常终止:', what);
                    rapfiReady = false;
                    showToast('AI引擎异常终止，请刷新页面重试');
                }
            };

            // 为了避免在非严格跨源隔离或受限环境中产生 Worker 错误，强制禁用多线程（单线程运行）
            // 这会牺牲多线程性能，但能提高兼容性并避免未捕获的 Worker 异常。
            config.PTHREAD_POOL_SIZE = 0;
            console.warn('[Rapfi] 强制禁用多线程（PTHREAD_POOL_SIZE=0），以提高兼容性并避免 Worker 错误');

            Rapfi(config).then((module) => {
                rapfiModule = module;
                rapfiReady = true;
                rapfiRestartAttempts = 0;
                console.log('[Rapfi] 引擎加载成功');
                showToast('AI引擎加载完成');
                // 若引擎是重启的且当前轮到 AI，自动重新请求落子，避免卡住
                if (!gameState.gameOver && isAITurn()) {
                    setTimeout(() => triggerAIMove(), 500);
                }
                // 打印 module 的可枚举属性，便于调试
                try { console.log('[Rapfi] module keys:', Object.keys(module)); } catch (e) { console.warn('[Rapfi] 无法列出 module 属性', e); }
                // 包装 sendCommand 以记录并捕获异常
                if (module && typeof module.sendCommand === 'function') {
                    const _orig = module.sendCommand.bind(module);
                    module.sendCommand = function(cmd) {
                        try {
                            console.log('[Rapfi] SEND ->', cmd);
                            _orig(cmd);
                        } catch (err) {
                            console.error('[Rapfi] sendCommand 异常:', err);
                            rapfiReady = false;
                            rapfiThinking = false;
                            clearThinkingTimer();
                            fallbackToJSAI();
                        }
                    };
                }
            }).catch((err) => {
                console.error('[Rapfi] 初始化失败:', err);
                showToast('AI引擎初始化失败，请刷新重试');
            });
        };
        script.onerror = (e) => {
            console.error('[Rapfi] 脚本加载失败:', e);
            showToast('AI引擎脚本加载失败，请检查网络连接');
        };
        document.body.appendChild(script);
    }

    function sendRapfiCommand(cmd) {
        console.log('[Rapfi] >', cmd);
        if (rapfiModule) rapfiModule.sendCommand(cmd);
    }

    function handleRapfiOutput(line) {
        console.log('[Rapfi] <', line);
        // 将输出同时添加到局面分析面板（浮动面板日志）
        // 解析 MESSAGE 并更新界面上的局势分析展示
        updateAnalysisFromMessage(line);
        // 收到任何引擎输出时清除超时/重试计时器
        if (rapfiResponseTimer) {
            clearTimeout(rapfiResponseTimer);
            rapfiResponseTimer = null;
            rapfiRetryCount = 0;
        }
        
        // 检查是否是错误消息
        if (line.includes('error') || line.includes('Error') || line.includes('ERROR')) {
            console.error('[Rapfi] 引擎错误:', line);
            rapfiThinking = false;
            clearThinkingTimer();
            fallbackToJSAI();
            return;
        }
        
        const moveMatch = line.match(/^\s*(\d+)\s*,\s*(\d+)\s*$/);
        if (moveMatch && rapfiThinking) {
            const col = parseInt(moveMatch[1]); // Rapfi x = col
            const row = parseInt(moveMatch[2]); // Rapfi y = row

            // 验证响应对应当前局面（防止过期响应）
            if (gameState.moveHistory.length !== rapfiMoveExpectedCount) {
                console.warn('[Rapfi] 局面已变化，忽略过期响应');
                rapfiThinking = false;
                clearThinkingTimer();
                return;
            }

            // 先按 (col, row) 解析，若该格被占则尝试 (row, col) 以兼容不同引擎
            let r = row, c = col;
            if (r >= 0 && r < 15 && c >= 0 && c < 15 && !gameState.board[r][c]) {
                // 有禁手规则时，黑棋不允许走禁手点（包括 AI）；引擎不识别禁手，重试会得到同一落子且引擎会 exit，故直接代选合法点
                if (gameState.currentPlayer === 'black' && gameState.forbiddenEnabled && checkForbidden(r, c)) {
                    rapfiThinking = false;
                    clearThinkingTimer();
                    const fallback = pickLegalBlackMove();
                    if (fallback) {
                        showToast('引擎返回禁手点，已自动选择合法落子');
                        makeMove(fallback.row, fallback.col, true);
                    } else {
                        fallbackToJSAI();
                    }
                    return;
                }
                rapfiThinking = false;
                clearThinkingTimer();
                makeMove(r, c, true);
                return;
            }
            // 尝试另一种坐标顺序 (引擎可能返回 row,col)
            const r2 = parseInt(moveMatch[1]); const c2 = parseInt(moveMatch[2]);
            if (r2 >= 0 && r2 < 15 && c2 >= 0 && c2 < 15 && !gameState.board[r2][c2]) {
                if (gameState.currentPlayer === 'black' && gameState.forbiddenEnabled && checkForbidden(r2, c2)) {
                    rapfiThinking = false;
                    clearThinkingTimer();
                    const fallback = pickLegalBlackMove();
                    if (fallback) {
                        showToast('引擎返回禁手点，已自动选择合法落子');
                        makeMove(fallback.row, fallback.col, true);
                    } else {
                        fallbackToJSAI();
                    }
                    return;
                }
                rapfiThinking = false;
                clearThinkingTimer();
                makeMove(r2, c2, true);
                return;
            }
            // 仍无效则自动选一个合法落子，避免卡住
            rapfiThinking = false;
            clearThinkingTimer();
            const fallback = gameState.currentPlayer === 'black' ? pickLegalBlackMove() : pickLegalWhiteMove();
            if (fallback) {
                showToast('引擎返回落子无效，已自动选择合法落子');
                makeMove(fallback.row, fallback.col, true);
            } else {
                console.error('[Rapfi] 无效落子且无空位:', row, col);
                fallbackToJSAI();
            }
            return;
        }
    }

    function requestRapfiMove() {
        if (!rapfiReady) {
            fallbackToJSAI();
            return;
        }

        rapfiThinking = true;
        rapfiMoveExpectedCount = gameState.moveHistory.length;
        resetAnalysisDisplay(); // 新一轮思考前重置分析展示

        // 清除旧的计时器
        if (rapfiResponseTimer) { clearTimeout(rapfiResponseTimer); rapfiResponseTimer = null; }
        rapfiRetryCount = 0;

        // 每次请求前重新初始化引擎并同步棋盘状态
        sendRapfiCommand('START 15');
        sendRapfiCommand('INFO timeout_turn 5000');

        if (gameState.moveHistory.length === 0) {
            // 棋盘为空，AI先手
            sendRapfiCommand('BEGIN');
            // 等待引擎响应，若无响应则重试 BEGIN，最多重试 2 次
            rapfiResponseTimer = setTimeout(function retryBegin() {
                if (!rapfiThinking) return;
                rapfiRetryCount++;
                console.warn('[Rapfi] BEGIN 无响应，尝试重试 #' + rapfiRetryCount);
                sendRapfiCommand('BEGIN');
                if (rapfiRetryCount >= 2) {
                    console.error('[Rapfi] 多次重试无响应，回退至内置 JS AI');
                    fallbackToJSAI();
                    rapfiThinking = false;
                    rapfiResponseTimer = null;
                    return;
                }
                rapfiResponseTimer = setTimeout(retryBegin, 1200);
            }, 1200);
        } else {
            // 使用 BOARD 命令同步完整棋盘状态
            // Rapfi 协议为 x,y,player（x=列 col，y=行 row），与返回的落子格式一致
            sendRapfiCommand('BOARD');
            for (const move of gameState.moveHistory) {
                const field = (move.player === 'black') ? 1 : 2; // 1=black 2=white
                sendRapfiCommand(`${move.col},${move.row},${field}`);
            }
            sendRapfiCommand('DONE');
            // 等待引擎响应，若无响应则重试 BOARD/DONE 顺序
            rapfiResponseTimer = setTimeout(function retryBoard() {
                if (!rapfiThinking) return;
                rapfiRetryCount++;
                console.warn('[Rapfi] BOARD/DONE 无响应，尝试重发 (retry #' + rapfiRetryCount + ')');
                // 重新发送同步命令
                sendRapfiCommand('START 15');
                sendRapfiCommand('INFO timeout_turn 5000');
                sendRapfiCommand('BOARD');
                for (const move of gameState.moveHistory) {
                    const field = (move.player === 'black') ? 1 : 2;
                    sendRapfiCommand(`${move.col},${move.row},${field}`);
                }
                sendRapfiCommand('DONE');
                if (rapfiRetryCount >= 2) {
                    console.error('[Rapfi] 多次重试无响应，回退至内置 JS AI');
                    fallbackToJSAI();
                    rapfiThinking = false;
                    rapfiResponseTimer = null;
                    return;
                }
                rapfiResponseTimer = setTimeout(retryBoard, 1200);
            }, 1200);
        }
    }

    /** 统计 (row,col) 八邻域内已有棋子的个数 */
    function countNeighbors(row, col) {
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const r = row + dr, c = col + dc;
                if (r >= 0 && r < 15 && c >= 0 && c < 15 && gameState.board[r][c] !== null) n++;
            }
        }
        return n;
    }

    /** 为黑棋选一个合法非禁手落子点；优先选与已有棋子相邻、且较靠近中心的点，避免乱走 */
    function pickLegalBlackMove() {
        const candidates = [];
        for (let r = 0; r < 15; r++) {
            for (let c = 0; c < 15; c++) {
                if (gameState.board[r][c] !== null) continue;
                if (gameState.forbiddenEnabled && checkForbidden(r, c)) continue;
                const neighbors = countNeighbors(r, c);
                const distToCenter = Math.abs(r - 7) + Math.abs(c - 7);
                candidates.push({ row: r, col: c, neighbors, distToCenter });
            }
        }
        if (candidates.length === 0) return null;
        if (candidates.length === 1) return { row: candidates[0].row, col: candidates[0].col };
        // 优先：邻域有棋子（邻居数多）> 其次靠近中心（distToCenter 小）
        candidates.sort((a, b) => {
            if (b.neighbors !== a.neighbors) return b.neighbors - a.neighbors;
            return a.distToCenter - b.distToCenter;
        });
        return { row: candidates[0].row, col: candidates[0].col };
    }

    /** 为白棋选一个空位（白无禁手），返回 { row, col } 或 null */
    function pickLegalWhiteMove() {
        for (let r = 0; r < 15; r++) {
            for (let c = 0; c < 15; c++) {
                if (gameState.board[r][c] === null) return { row: r, col: c };
            }
        }
        return null;
    }

    function fallbackToJSAI() {
        rapfiThinking = false;
        clearThinkingTimer();
        showToast('AI引擎不可用，请刷新页面重试');
        if (gameState.currentPlayer === 'black') blackStatus.textContent = '等待中';
        else whiteStatus.textContent = '等待中';
    }

    function triggerAIMove() {
        console.log('[AI] 准备触发AI移动，当前玩家:', gameState.currentPlayer, '游戏模式:', gameState.mode);
        if (gameState.currentPlayer === 'black') {
            blackStatus.classList.add('thinking');
            startThinkingTimer(blackStatus);
        } else {
            whiteStatus.classList.add('thinking');
            startThinkingTimer(whiteStatus);
        }
        // 确保引擎就绪后再请求移动
        setTimeout(() => {
            if (rapfiReady) {
                requestRapfiMove();
            } else {
                console.warn('[AI] 引擎未就绪，稍后重试');
                // 如果引擎未就绪，稍后重试
                setTimeout(() => {
                    if (rapfiReady) {
                        requestRapfiMove();
                    } else {
                        fallbackToJSAI();
                    }
                }, 1000);
            }
        }, 150);
    }

    function initBoard() {
        const cells = boardGrid.querySelectorAll('.cell, .star-point');
        cells.forEach(cell => cell.remove());

        for (let row = 0; row < 15; row++) {
            for (let col = 0; col < 15; col++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = row;
                cell.dataset.col = col;
                cell.style.left = (col * GRID_SIZE - 18) + 'px';
                cell.style.top = (row * GRID_SIZE - 18) + 'px';
                cell.addEventListener('click', () => makeMove(row, col));
                boardGrid.appendChild(cell);
            }
        }

        const starPositions = [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]];
        starPositions.forEach(([row, col]) => {
            const star = document.createElement('div');
            star.className = 'star-point';
            star.style.left = (col * GRID_SIZE) + 'px';
            star.style.top = (row * GRID_SIZE) + 'px';
            boardGrid.appendChild(star);
        });

        coordLeft.innerHTML = '';
        for (let i = 0; i < 15; i++) {
            const span = document.createElement('span');
            span.textContent = 15 - i;
            span.style.top = (i * GRID_SIZE) + 'px';
            coordLeft.appendChild(span);
        }

        coordBottom.innerHTML = '';
        for (let i = 0; i < 15; i++) {
            const span = document.createElement('span');
            span.textContent = String.fromCharCode(65 + i);
            span.style.left = (i * GRID_SIZE) + 'px';
            coordBottom.appendChild(span);
        }

        updateForbiddenPoints();
    }

    function isAITurn() {
        return (gameState.mode === 'ai_black' && gameState.currentPlayer === 'black') ||
               (gameState.mode === 'ai_white' && gameState.currentPlayer === 'white');
    }

    function makeMove(row, col, fromAI = false) {
        if (gameState.gameOver || gameState.board[row][col] !== null) return;
        if (!fromAI && isAITurn()) return;

        if (gameState.currentPlayer === 'black' && gameState.forbiddenEnabled) {
            const forbiddenType = checkForbidden(row, col);
            if (forbiddenType) {
                showForbiddenModal(forbiddenType);
                return;
            }
        }

        gameState.moveHistory.push({ row, col, player: gameState.currentPlayer });
        gameState.board[row][col] = gameState.currentPlayer;
        gameState.moveCount++;

        const prevLastMove = boardGrid.querySelector('.piece.last-move');
        if (prevLastMove) prevLastMove.classList.remove('last-move');

        renderPiece(row, col, gameState.currentPlayer, gameState.moveCount, true);
        updatePositionCodeDisplay();

        const winResult = checkWin(row, col, gameState.currentPlayer);
        if (winResult) {
            endGame(gameState.currentPlayer, winResult);
            return;
        }

        gameState.currentPlayer = gameState.currentPlayer === 'black' ? 'white' : 'black';
        updatePlayerDisplay();
        updateForbiddenPoints();

        if (!gameState.gameOver && isAITurn()) {
            triggerAIMove();
        }
    }

    function renderPiece(row, col, player, number, isLastMove = false) {
        const cell = boardGrid.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
        const piece = document.createElement('div');
        piece.className = `piece ${player}-piece`;
        piece.dataset.number = number;
        piece.textContent = gameState.showNumber ? number : '';
        if (isLastMove) piece.classList.add('last-move');
        cell.appendChild(piece);
    }

    function getPositionCode() {
        if (gameState.moveHistory.length === 0) return '';
        return gameState.moveHistory.map(m => {
            const colChar = String.fromCharCode(65 + m.col);
            const rowNum = 15 - m.row;
            return colChar + rowNum;
        }).join('');
    }

    function updatePositionCodeDisplay() {
        positionCodeDisplay.textContent = getPositionCode() || '—';
    }

    function parsePositionCode(str) {
        if (!str || typeof str !== 'string') return [];
        const s = str.replace(/\s/g, '').toUpperCase();
        const matches = s.match(/[A-O]\d{1,2}/g);
        if (!matches) return [];
        const moves = [];
        for (const m of matches) {
            const col = m.charCodeAt(0) - 65;
            const rowNum = parseInt(m.slice(1), 10);
            if (rowNum < 1 || rowNum > 15 || col < 0 || col > 14) continue;
            const row = 15 - rowNum;
            moves.push({ row, col });
        }
        return moves;
    }

    function applyPositionCode(codeStr) {
        const moves = parsePositionCode(codeStr);
        if (moves.length === 0) {
            showToast('局面代码无效或为空');
            return false;
        }
        gameState.board = Array(15).fill().map(() => Array(15).fill(null));
        gameState.moveHistory = [];
        gameState.moveCount = 0;
        gameState.currentPlayer = 'black';
        gameState.gameOver = false;

        boardGrid.querySelectorAll('.piece').forEach(p => p.remove());

        let player = 'black';
        for (const { row, col } of moves) {
            if (row < 0 || row >= 15 || col < 0 || col >= 15 || gameState.board[row][col] !== null) {
                showToast('局面代码含非法或重复落点，已还原至该手之前');
                break;
            }
            gameState.board[row][col] = player;
            gameState.moveHistory.push({ row, col, player });
            gameState.moveCount++;
            renderPiece(row, col, player, gameState.moveCount, false);
            player = player === 'black' ? 'white' : 'black';
        }
        gameState.currentPlayer = player;
        const lastMove = gameState.moveHistory[gameState.moveHistory.length - 1];
        if (lastMove) {
            const lastCell = boardGrid.querySelector(`.cell[data-row="${lastMove.row}"][data-col="${lastMove.col}"]`);
            const lastPiece = lastCell?.querySelector('.piece');
            if (lastPiece) lastPiece.classList.add('last-move');
        }
        updatePlayerDisplay();
        updateForbiddenPoints();
        updatePositionCodeDisplay();
        positionCodeInput.value = '';
        showToast('已还原局面');
        if (!gameState.gameOver && isAITurn()) {
            // 延迟触发AI移动，确保界面已更新
            setTimeout(triggerAIMove, 300);
        }
        return true;
    }

    function updatePlayerDisplay() {
        if (gameState.currentPlayer === 'black') {
            blackPlayer.classList.add('active');
            whitePlayer.classList.remove('active');
            // 当前为黑棋回合：若黑棋是 AI，由 triggerAIMove 用计时器更新 blackStatus，这里只设占位
            blackStatus.textContent = (gameState.mode === 'ai_black') ? '思考中' : '思考中...';
            blackStatus.classList.add('thinking');
            whiteStatus.textContent = '等待中';
            whiteStatus.classList.remove('thinking');
        } else {
            blackPlayer.classList.remove('active');
            whitePlayer.classList.add('active');
            blackStatus.textContent = '等待中';
            blackStatus.classList.remove('thinking');
            // 当前为白棋回合：若白棋是 AI，由 triggerAIMove 用计时器更新 whiteStatus，这里只设占位
            whiteStatus.textContent = (gameState.mode === 'ai_white') ? '思考中' : '思考中...';
            whiteStatus.classList.add('thinking');
        }
    }

    // 禁手检测
    function getCell(row, col) {
        if (row < 0 || row >= 15 || col < 0 || col >= 15) return -1;
        if (gameState.board[row][col] === 'black') return 1;
        if (gameState.board[row][col] === 'white') return 2;
        return 0;
    }

    function countPureContinuous(row, col, dx, dy) {
        let count = 1;
        for (let i = 1; i <= 6; i++) {
            if (getCell(row + i * dx, col + i * dy) === 1) count++;
            else break;
        }
        for (let i = 1; i <= 6; i++) {
            if (getCell(row - i * dx, col - i * dy) === 1) count++;
            else break;
        }
        return count;
    }

    function isLiveThree(row, col, dx, dy) {
        let count = 0, openEnds = 0, emptyInside = 0;
        let i = 1;
        while (i <= 4) {
            const cell = getCell(row + i * dx, col + i * dy);
            if (cell === 1) { count++; i++; }
            else if (cell === 0) {
                const nextCell = getCell(row + (i + 1) * dx, col + (i + 1) * dy);
                if (nextCell === 1 && emptyInside === 0) { emptyInside++; i++; }
                else { openEnds++; break; }
            } else break;
        }
        i = 1;
        while (i <= 4) {
            const cell = getCell(row - i * dx, col - i * dy);
            if (cell === 1) { count++; i++; }
            else if (cell === 0) {
                const nextCell = getCell(row - (i + 1) * dx, col - (i + 1) * dy);
                if (nextCell === 1 && emptyInside === 0) { emptyInside++; i++; }
                else { openEnds++; break; }
            } else break;
        }
        return count === 2 && openEnds === 2 && emptyInside <= 1;
    }

    function isFour(row, col, dx, dy) {
        let count = 0, openEnds = 0, emptyInside = 0;
        let i = 1;
        while (i <= 5) {
            const cell = getCell(row + i * dx, col + i * dy);
            if (cell === 1) { count++; i++; }
            else if (cell === 0) {
                const nextCell = getCell(row + (i + 1) * dx, col + (i + 1) * dy);
                if (nextCell === 1 && emptyInside === 0) { emptyInside++; i++; }
                else { openEnds++; break; }
            } else break;
        }
        i = 1;
        while (i <= 5) {
            const cell = getCell(row - i * dx, col - i * dy);
            if (cell === 1) { count++; i++; }
            else if (cell === 0) {
                const nextCell = getCell(row - (i + 1) * dx, col - (i + 1) * dy);
                if (nextCell === 1 && emptyInside === 0) { emptyInside++; i++; }
                else { openEnds++; break; }
            } else break;
        }
        return count === 3 && openEnds >= 1 && emptyInside <= 1;
    }

    function checkFive(row, col) {
        for (const [dx, dy] of DIRECTIONS) {
            if (countPureContinuous(row, col, dx, dy) === 5) return true;
        }
        return false;
    }

    function checkOverline(row, col) {
        for (const [dx, dy] of DIRECTIONS) {
            if (countPureContinuous(row, col, dx, dy) >= 6) return true;
        }
        return false;
    }

    function checkForbidden(row, col) {
        gameState.board[row][col] = 'black';
        if (checkFive(row, col)) { gameState.board[row][col] = null; return null; }
        if (checkOverline(row, col)) { gameState.board[row][col] = null; return 'overline'; }
        let fourCount = 0, threeCount = 0;
        for (const [dx, dy] of DIRECTIONS) {
            if (isFour(row, col, dx, dy)) fourCount++;
            if (isLiveThree(row, col, dx, dy)) threeCount++;
        }
        gameState.board[row][col] = null;
        if (fourCount >= 2) return 'four-four';
        if (threeCount >= 2) return 'three-three';
        return null;
    }

    function updateForbiddenPoints() {
        boardGrid.querySelectorAll('.cell').forEach(cell => cell.classList.remove('forbidden'));
        if (!gameState.forbiddenEnabled || !gameState.showForbidden || gameState.currentPlayer !== 'black') return;
        for (let row = 0; row < 15; row++) {
            for (let col = 0; col < 15; col++) {
                if (gameState.board[row][col] === null && checkForbidden(row, col)) {
                    const cell = boardGrid.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
                    if (cell) cell.classList.add('forbidden');
                }
            }
        }
    }

    function showForbiddenModal(type) {
        const messages = {
            'three-three': '三三禁手：同时形成两个活三',
            'four-four': '四四禁手：同时形成两个四',
            'overline': '长连禁手：形成六子或以上连线'
        };
        forbiddenText.textContent = messages[type] || '此处为禁手点';
        forbiddenModal.classList.add('show');
    }

    function checkWin(row, col, player) {
        for (const [dx, dy] of DIRECTIONS) {
            let positions = [[row, col]];
            let count = 1;
            for (let i = 1; i < 5; i++) {
                const newRow = row + i * dx, newCol = col + i * dy;
                if (newRow >= 0 && newRow < 15 && newCol >= 0 && newCol < 15 &&
                    gameState.board[newRow][newCol] === player) {
                    count++;
                    positions.push([newRow, newCol]);
                } else break;
            }
            for (let i = 1; i < 5; i++) {
                const newRow = row - i * dx, newCol = col - i * dy;
                if (newRow >= 0 && newRow < 15 && newCol >= 0 && newCol < 15 &&
                    gameState.board[newRow][newCol] === player) {
                    count++;
                    positions.push([newRow, newCol]);
                } else break;
            }
            if (count >= 5) return positions;
        }
        return null;
    }

    function endGame(winner, winningPositions) {
        gameState.gameOver = true;
        const winnerName = winner === 'black' ? '黑棋' : '白棋';
        winnerTitle.textContent = '🎉 恭喜获胜！';
        winnerText.textContent = `${winnerName}获得胜利！`;

        if (winningPositions) {
            winningPositions.forEach(([r, c]) => {
                const cell = boardGrid.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
                const piece = cell?.querySelector('.piece');
                if (piece) {
                    piece.classList.remove('last-move');
                    piece.classList.add('winning');
                }
            });
        }

        if (winner === 'black') {
            blackStatus.textContent = '🏆 获胜！';
            whiteStatus.textContent = '❌ 失败';
        } else {
            blackStatus.textContent = '❌ 失败';
            whiteStatus.textContent = '🏆 获胜！';
        }
        blackStatus.classList.remove('thinking');
        whiteStatus.classList.remove('thinking');

        setTimeout(() => winnerModal.classList.add('show'), 300);
    }

    function undoMove() {
        if (gameState.gameOver || gameState.moveHistory.length === 0) {
            showToast('无法悔棋');
            return;
        }

        const lastMove = gameState.moveHistory.pop();
        gameState.board[lastMove.row][lastMove.col] = null;
        gameState.moveCount--;

        const cell = boardGrid.querySelector(`.cell[data-row="${lastMove.row}"][data-col="${lastMove.col}"]`);
        cell?.querySelector('.piece')?.remove();

        boardGrid.querySelectorAll('.piece').forEach(p => p.classList.remove('last-move'));

        if (gameState.moveHistory.length > 0) {
            const newLastMove = gameState.moveHistory[gameState.moveHistory.length - 1];
            const newLastCell = boardGrid.querySelector(`.cell[data-row="${newLastMove.row}"][data-col="${newLastMove.col}"]`);
            newLastCell?.querySelector('.piece')?.classList.add('last-move');
        }

        gameState.currentPlayer = lastMove.player;
        updatePlayerDisplay();
        updateForbiddenPoints();
        updatePositionCodeDisplay();
        showToast('已悔棋');
        rapfiThinking = false;
        clearThinkingTimer();
        if (!gameState.gameOver && isAITurn()) {
            // 延迟触发AI移动，确保界面已更新
            setTimeout(triggerAIMove, 100);
        }
    }

    function resetGame() {
        gameState.board = Array(15).fill().map(() => Array(15).fill(null));
        gameState.currentPlayer = 'black';
        gameState.gameOver = false;
        gameState.moveHistory = [];
        gameState.moveCount = 0;
        rapfiThinking = false;
        clearThinkingTimer();

        boardGrid.querySelectorAll('.piece').forEach(p => p.remove());

        updatePlayerDisplay();
        updateForbiddenPoints();
        updatePositionCodeDisplay();
        winnerModal.classList.remove('show');
        showToast('游戏已重置');
        if (!gameState.gameOver && isAITurn()) {
            // 延迟触发AI移动，确保界面已更新
            setTimeout(triggerAIMove, 300);
        }
    }

    function getThemeColors() {
        const root = document.documentElement;
        const board = document.getElementById('board');
        const style = board ? getComputedStyle(board) : null;
        const getVar = (name) => {
            if (!style) return null;
            const v = style.getPropertyValue(name)?.trim();
            if (v) return v;
            return getComputedStyle(root).getPropertyValue(name)?.trim() || null;
        };
        return {
            boardBg: getVar('--board-bg') || '#d4b896',
            boardSurface: getVar('--board-surface') || '#e8d4b8',
            boardLine: getVar('--board-line') || '#6b5638',
            boardBorder: getVar('--board-border') || '#8b6f47',
            coordColor: getVar('--coord-color') || '#5a4a3a'
        };
    }

    function saveAsImage() {
        const boardContainer = document.querySelector('.board-container');
        if (!boardContainer) {
            showToast('保存失败：未找到棋盘区域');
            return;
        }
        showToast('正在生成图片...');

        const rect = boardContainer.getBoundingClientRect();
        const W = Math.round(rect.width);
        const H = Math.round(rect.height);
        const scale = window.devicePixelRatio > 1 ? Math.min(window.devicePixelRatio, 3) : 2;

        const canvas = document.createElement('canvas');
        canvas.width = W * scale;
        canvas.height = H * scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);

        const colors = getThemeColors();
        const pad = 30, coordLeftW = 32, gap = 10;
        const boardSize = 560, gridOffset = 20, gridSize = 520;
        const cellSize = gridSize / 14;
        const boardX = pad + coordLeftW + gap;
        const boardY = pad;
        const gridX = boardX + gridOffset;
        const gridY = boardY + gridOffset;
        const coordBottomTop = boardY + boardSize + 10;

        function fillRoundRect(x, y, w, h, r) {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.fill();
        }

        ctx.fillStyle = colors.boardBg;
        fillRoundRect(0, 0, W, H, 12);

        ctx.fillStyle = colors.boardSurface;
        fillRoundRect(boardX, boardY, boardSize, boardSize, 8);
        ctx.strokeStyle = colors.boardBorder;
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.strokeStyle = colors.boardLine;
        ctx.lineWidth = 1;
        for (let i = 0; i <= 14; i++) {
            const p = gridX + i * cellSize;
            ctx.beginPath();
            ctx.moveTo(p, gridY);
            ctx.lineTo(p, gridY + gridSize);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(gridX, gridY + i * cellSize);
            ctx.lineTo(gridX + gridSize, gridY + i * cellSize);
            ctx.stroke();
        }

        const starPositions = [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]];
        ctx.fillStyle = colors.boardLine;
        starPositions.forEach(([row, col]) => {
            const cx = gridX + col * cellSize;
            const cy = gridY + row * cellSize;
            ctx.beginPath();
            ctx.arc(cx, cy, 4, 0, Math.PI * 2);
            ctx.fill();
        });

        const pieceRadius = 18;
        ctx.font = '700 13px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let row = 0; row < 15; row++) {
            for (let col = 0; col < 15; col++) {
                const player = gameState.board[row][col];
                if (!player) continue;
                const cx = gridX + col * cellSize;
                const cy = gridY + row * cellSize;
                const isBlack = player === 'black';
                ctx.fillStyle = isBlack ? '#2d2d2d' : '#f5f5f5';
                ctx.strokeStyle = isBlack ? '#1a1a1a' : '#d0d0d0';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(cx, cy, pieceRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                if (gameState.showNumber) {
                    const moveIndex = gameState.moveHistory.findIndex(m => m.row === row && m.col === col);
                    const num = moveIndex >= 0 ? String(moveIndex + 1) : '';
                    ctx.fillStyle = isBlack ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.75)';
                    ctx.fillText(num, cx, cy);
                }
            }
        }

        ctx.fillStyle = colors.coordColor;
        ctx.font = '700 15px Arial, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < 15; i++) {
            const y = gridY + i * cellSize;
            ctx.fillText(String(15 - i), pad + coordLeftW, y);
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < 15; i++) {
            const x = gridX + i * cellSize;
            const y = coordBottomTop + 16;
            ctx.fillText(String.fromCharCode(65 + i), x, y);
        }

        try {
            const timestamp = new Date().toLocaleString('zh-CN').replace(/[/:]/g, '-').replace(/\s/g, '_');
            const link = document.createElement('a');
            link.download = `五子棋_${timestamp}.png`;
            link.href = canvas.toDataURL('image/png');
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast('图片已保存！');
        } catch (error) {
            console.error('保存图片失败:', error);
            showToast('保存图片失败，请重试');
        }
    }

    function showToast(message) {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
    }

    function changeBoardTheme(theme) {
        const body = document.body;
        body.classList.remove('theme-dark-wood', 'theme-light-maple', 'theme-jade-green', 'theme-dark-gray', 'theme-bamboo');
        if (theme !== 'default') body.classList.add(`theme-${theme}`);

        document.querySelectorAll('.color-option').forEach(option => {
            option.classList.remove('active');
            if (option.dataset.theme === theme) option.classList.add('active');
        });

        localStorage.setItem('boardTheme', theme);

        const themeNames = {
            'default': '金黄木色', 'dark-wood': '深棕红木', 'light-maple': '浅色枫木',
            'jade-green': '翡翠绿', 'dark-gray': '深灰黑', 'bamboo': '竹质色'
        };
        showToast(`已切换至 ${themeNames[theme]} 主题`);
    }

    // 事件监听
    undoBtn.addEventListener('click', undoMove);
    resetBtn.addEventListener('click', resetGame);
    saveBtn.addEventListener('click', saveAsImage);
    copyCodeBtn.addEventListener('click', () => {
        const code = getPositionCode();
        if (!code) { showToast('当前无局面可复制'); return; }
        navigator.clipboard.writeText(code).then(() => showToast('已复制局面代码')).catch(() => showToast('复制失败'));
    });
    applyCodeBtn.addEventListener('click', () => applyPositionCode(positionCodeInput.value.trim()));
    modalCloseBtn.addEventListener('click', resetGame);
    forbiddenCloseBtn.addEventListener('click', () => forbiddenModal.classList.remove('show'));
    rulesBtn?.addEventListener('click', () => rulesModal.classList.add('show'));
    rulesCloseBtn?.addEventListener('click', () => rulesModal.classList.remove('show'));
    rulesModal?.addEventListener('click', (e) => { if (e.target === rulesModal) rulesModal.classList.remove('show'); });

    gameModeGroup?.addEventListener('change', (e) => {
        if (e.target.name !== 'game-mode') return;
        gameState.mode = e.target.value;
        rapfiThinking = false;
        clearThinkingTimer();
        const labels = { pvp: '双人对弈', ai_black: '人机对弈（电脑先走）', ai_white: '人机对弈（玩家先走）' };
        showToast('已切换为 ' + (labels[gameState.mode] || gameState.mode));
        if (!gameState.gameOver && isAITurn()) {
            setTimeout(triggerAIMove, 100);
        }
    });

    forbiddenToggle.addEventListener('change', (e) => {
        gameState.forbiddenEnabled = e.target.checked;
        updateForbiddenPoints();
        showToast(e.target.checked ? '禁手规则已启用' : '禁手规则已关闭');
    });

    showForbiddenToggle.addEventListener('change', (e) => {
        gameState.showForbidden = e.target.checked;
        updateForbiddenPoints();
    });

    showNumberToggle.addEventListener('change', (e) => {
        gameState.showNumber = e.target.checked;
        updatePieceNumbers();
        showToast(e.target.checked ? '已显示棋子序号' : '已隐藏棋子序号');
    });

    function updatePieceNumbers() {
        boardGrid.querySelectorAll('.piece').forEach(piece => {
            piece.textContent = gameState.showNumber ? piece.dataset.number : '';
        });
    }

    document.querySelectorAll('.color-option').forEach(option => {
        option.addEventListener('click', () => changeBoardTheme(option.dataset.theme));
    });

    const savedTheme = localStorage.getItem('boardTheme');
    if (savedTheme) changeBoardTheme(savedTheme);

    const settingsPanel = document.getElementById('settings-panel');
    const settingsPanelToggle = document.getElementById('settings-panel-toggle');
    if (settingsPanel && settingsPanelToggle) {
        settingsPanelToggle.addEventListener('click', () => {
            const collapsed = settingsPanel.classList.toggle('collapsed');
            settingsPanelToggle.setAttribute('aria-expanded', !collapsed);
        });
    }

    const checkedMode = document.querySelector('input[name="game-mode"]:checked');
    if (checkedMode) gameState.mode = checkedMode.value;
    initBoard();
    updatePlayerDisplay();
    updatePositionCodeDisplay();
    loadRapfiEngine();
    
    // 如果是AI对战模式，在引擎加载完成后，如果是AI先手，则触发AI下棋
    setTimeout(() => {
        if (!gameState.gameOver && isAITurn()) {
            setTimeout(triggerAIMove, 500);
        }
    }, 1000);
    
});
