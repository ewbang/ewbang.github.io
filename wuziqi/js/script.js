document.addEventListener('DOMContentLoaded', () => {
            const gameState = {
                board: Array(15).fill().map(() => Array(15).fill(null)),
                currentPlayer: 'black',
                gameOver: false,
                moveHistory: [],
                moveCount: 0,
                forbiddenEnabled: true,
                showForbidden: true,
                showNumber: true
            };
            
            const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];
            const GRID_SIZE = 520 / 14;
            
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
            const historyList = document.getElementById('history-list');
            
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
            
            function makeMove(row, col) {
                if (gameState.gameOver || gameState.board[row][col] !== null) return;
                
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
                
                // 移除之前的last-move标记
                const prevLastMove = boardGrid.querySelector('.piece.last-move');
                if (prevLastMove) {
                    prevLastMove.classList.remove('last-move');
                }
                
                renderPiece(row, col, gameState.currentPlayer, gameState.moveCount, true);
                updateHistoryList();
                
                const winResult = checkWin(row, col, gameState.currentPlayer);
                if (winResult) {
                    endGame(gameState.currentPlayer, winResult);
                    return;
                }
                
                gameState.currentPlayer = gameState.currentPlayer === 'black' ? 'white' : 'black';
                updatePlayerDisplay();
                updateForbiddenPoints();
            }
            
            function renderPiece(row, col, player, number, isLastMove = false) {
                const cell = boardGrid.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
                const piece = document.createElement('div');
                piece.className = `piece ${player}-piece`;
                piece.dataset.number = number;
                piece.textContent = gameState.showNumber ? number : '';
                if (isLastMove) {
                    piece.classList.add('last-move');
                }
                cell.appendChild(piece);
            }
            
            function updateHistoryList() {
                historyList.innerHTML = '';
                
                if (gameState.moveHistory.length === 0) {
                    historyList.innerHTML = '<div class="history-empty">暂无记录</div>';
                    return;
                }
                
                gameState.moveHistory.forEach((move, index) => {
                    const item = document.createElement('div');
                    item.className = 'history-item';
                    if (index === gameState.moveHistory.length - 1) {
                        item.classList.add('current');
                    }
                    
                    const col = String.fromCharCode(65 + move.col);
                    const row = 15 - move.row;
                    
                    item.innerHTML = `
                        <div class="history-player-icon ${move.player}"></div>
                        <span class="history-number">#${index + 1}</span>
                        <span class="history-coord">(${col}, ${row})</span>
                    `;
                    
                    historyList.appendChild(item);
                });
                
                // 自动滚动到最新
                historyList.scrollTop = historyList.scrollHeight;
            }
            
            function updatePlayerDisplay() {
                if (gameState.currentPlayer === 'black') {
                    blackPlayer.classList.add('active');
                    whitePlayer.classList.remove('active');
                    blackStatus.textContent = '思考中...';
                    blackStatus.classList.add('thinking');
                    whiteStatus.textContent = '等待中';
                    whiteStatus.classList.remove('thinking');
                } else {
                    blackPlayer.classList.remove('active');
                    whitePlayer.classList.add('active');
                    blackStatus.textContent = '等待中';
                    blackStatus.classList.remove('thinking');
                    whiteStatus.textContent = '思考中...';
                    whiteStatus.classList.add('thinking');
                }
            }
            
            // ========== 禁手检测 ==========
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
            
            // 判断是否为活三
            // 活三：当前位置+2个同色子（共3子），两端开放，中间最多跳一空
            function isLiveThree(row, col, dx, dy) {
                let count = 0;       // 同色棋子数（不含当前位置）
                let openEnds = 0;    // 两端开放数
                let emptyInside = 0; // 中间跳空数
                
                // 正向统计
                let i = 1;
                while (i <= 4) {
                    const cell = getCell(row + i * dx, col + i * dy);
                    if (cell === 1) {
                        count++;
                        i++;
                    } else if (cell === 0) {
                        // 检查是否是跳空（空位后面还有同色子）
                        const nextCell = getCell(row + (i + 1) * dx, col + (i + 1) * dy);
                        if (nextCell === 1 && emptyInside === 0) {
                            emptyInside++;
                            i++;
                        } else {
                            // 这是端点空位
                            openEnds++;
                            break;
                        }
                    } else {
                        // 遇到白子或边界
                        break;
                    }
                }
                
                // 反向统计
                i = 1;
                while (i <= 4) {
                    const cell = getCell(row - i * dx, col - i * dy);
                    if (cell === 1) {
                        count++;
                        i++;
                    } else if (cell === 0) {
                        // 检查是否是跳空
                        const nextCell = getCell(row - (i + 1) * dx, col - (i + 1) * dy);
                        if (nextCell === 1 && emptyInside === 0) {
                            emptyInside++;
                            i++;
                        } else {
                            // 这是端点空位
                            openEnds++;
                            break;
                        }
                    } else {
                        // 遇到白子或边界
                        break;
                    }
                }
                
                // 活三：2个同色子+当前位置=3子，两端开放，中间最多跳一空
                return count === 2 && openEnds === 2 && emptyInside <= 1;
            }
            
       
            // 判断是否为四（包括连四、跳四、冲四、活四）
            // 四：当前位置+3个同色子（共4子），至少一端开放，中间最多跳一空
            function isFour(row, col, dx, dy) {
                let count = 0;       // 同色棋子数（不含当前位置）
                let openEnds = 0;    // 两端开放数
                let emptyInside = 0; // 中间跳空数
                
                // 正向统计
                let i = 1;
                while (i <= 5) {
                    const cell = getCell(row + i * dx, col + i * dy);
                    if (cell === 1) {
                        count++;
                        i++;
                    } else if (cell === 0) {
                        // 检查是否是跳空
                        const nextCell = getCell(row + (i + 1) * dx, col + (i + 1) * dy);
                        if (nextCell === 1 && emptyInside === 0) {
                            emptyInside++;
                            i++;
                        } else {
                            // 这是端点空位
                            openEnds++;
                            break;
                        }
                    } else {
                        // 遇到白子或边界
                        break;
                    }
                }
                
                // 反向统计
                i = 1;
                while (i <= 5) {
                    const cell = getCell(row - i * dx, col - i * dy);
                    if (cell === 1) {
                        count++;
                        i++;
                    } else if (cell === 0) {
                        // 检查是否是跳空
                        const nextCell = getCell(row - (i + 1) * dx, col - (i + 1) * dy);
                        if (nextCell === 1 && emptyInside === 0) {
                            emptyInside++;
                            i++;
                        } else {
                            // 这是端点空位
                            openEnds++;
                            break;
                        }
                    } else {
                        // 遇到白子或边界
                        break;
                    }
                }
                
                // 四：3个同色子+当前位置=4子，至少一端开放，中间最多跳一空
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
            
                if (checkFive(row, col)) {
                    gameState.board[row][col] = null;
                    return null;
                }
            
                if (checkOverline(row, col)) {
                    gameState.board[row][col] = null;
                    return 'overline';
                }
            
                let fourCount = 0;
                let threeCount = 0;
            
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
                const cells = boardGrid.querySelectorAll('.cell');
                cells.forEach(cell => cell.classList.remove('forbidden'));
                
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
                    
                    // 正向查找
                    for (let i = 1; i < 5; i++) {
                        const newRow = row + i * dx;
                        const newCol = col + i * dy;
                        if (newRow >= 0 && newRow < 15 && newCol >= 0 && newCol < 15 &&
                            gameState.board[newRow][newCol] === player) {
                            count++;
                            positions.push([newRow, newCol]);
                        } else break;
                    }
                    
                    // 反向查找
                    for (let i = 1; i < 5; i++) {
                        const newRow = row - i * dx;
                        const newCol = col - i * dy;
                        if (newRow >= 0 && newRow < 15 && newCol >= 0 && newCol < 15 &&
                            gameState.board[newRow][newCol] === player) {
                            count++;
                            positions.push([newRow, newCol]);
                        } else break;
                    }
                    
                    if (count >= 5) {
                        return positions;
                    }
                }
                return null;
            }
            
            function endGame(winner, winningPositions) {
                gameState.gameOver = true;
                const winnerName = winner === 'black' ? '黑方' : '白方';
                winnerTitle.textContent = '🎉 恭喜获胜！';
                winnerText.textContent = `${winnerName}获得胜利！`;
                
                // 添加获胜棋子动画
                if (winningPositions) {
                    winningPositions.forEach(([r, c]) => {
                        const cell = boardGrid.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
                        const piece = cell.querySelector('.piece');
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
                
                setTimeout(() => {
                    winnerModal.classList.add('show');
                }, 300);
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
                const piece = cell.querySelector('.piece');
                if (piece) piece.remove();
                
                // 更新last-move标记到新的最后一手
                const allPieces = boardGrid.querySelectorAll('.piece');
                allPieces.forEach(p => p.classList.remove('last-move'));
                
                if (gameState.moveHistory.length > 0) {
                    const newLastMove = gameState.moveHistory[gameState.moveHistory.length - 1];
                    const newLastCell = boardGrid.querySelector(`.cell[data-row="${newLastMove.row}"][data-col="${newLastMove.col}"]`);
                    const newLastPiece = newLastCell.querySelector('.piece');
                    if (newLastPiece) {
                        newLastPiece.classList.add('last-move');
                    }
                }
                
                gameState.currentPlayer = lastMove.player;
                updatePlayerDisplay();
                updateForbiddenPoints();
                updateHistoryList();
                showToast('已悔棋');
            }
            
            function resetGame() {
                gameState.board = Array(15).fill().map(() => Array(15).fill(null));
                gameState.currentPlayer = 'black';
                gameState.gameOver = false;
                gameState.moveHistory = [];
                gameState.moveCount = 0;
                
                const pieces = boardGrid.querySelectorAll('.piece');
                pieces.forEach(piece => piece.remove());
                
                updatePlayerDisplay();
                updateForbiddenPoints();
                updateHistoryList();
                winnerModal.classList.remove('show');
                showToast('游戏已重置');
            }
            
            // 从当前页面读取主题色，保证保存图片与网页一致
            function getThemeColors() {
                const root = document.documentElement;
                const board = document.getElementById('board');
                const style = root && board ? getComputedStyle(board) : null;
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
                const pad = 30;
                const coordLeftW = 32;
                const gap = 10;
                const boardSize = 560;
                const gridOffset = 20;
                const gridSize = 520;
                const cellSize = gridSize / 14;
                const boardX = pad + coordLeftW + gap;
                const boardY = pad;
                const gridX = boardX + gridOffset;
                const gridY = boardY + gridOffset;
                const coordBottomTop = boardY + boardSize + 10;
                const coordBottomLeft = pad + 62;

                // 圆角矩形辅助（兼容无 roundRect 的浏览器）
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

                // 1. 容器背景（与网页一致）
                ctx.fillStyle = colors.boardBg;
                fillRoundRect(0, 0, W, H, 12);

                // 2. 棋盘面 + 内边框
                ctx.fillStyle = colors.boardSurface;
                fillRoundRect(boardX, boardY, boardSize, boardSize, 8);
                ctx.strokeStyle = colors.boardBorder;
                ctx.lineWidth = 3;
                ctx.stroke();

                // 3. 网格线
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

                // 4. 星位
                const starPositions = [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]];
                ctx.fillStyle = colors.boardLine;
                starPositions.forEach(([row, col]) => {
                    const cx = gridX + col * cellSize;
                    const cy = gridY + row * cellSize;
                    ctx.beginPath();
                    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
                    ctx.fill();
                });

                // 5. 棋子（与网页一致：实心、序号）
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

                // 6. 左侧坐标 1–15（与网页一致：对齐到横向网格线）
                ctx.fillStyle = colors.coordColor;
                ctx.font = '700 15px Arial, sans-serif';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                for (let i = 0; i < 15; i++) {
                    const y = gridY + i * cellSize;
                    ctx.fillText(String(15 - i), pad + coordLeftW, y);
                }

                // 7. 底部坐标 A–O（与网页一致：对齐到纵向网格线）
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                for (let i = 0; i < 15; i++) {
                    const x = gridX + i * cellSize;
                    const y = coordBottomTop + 16;
                    ctx.fillText(String.fromCharCode(65 + i), x, y);
                }

                try {
                    const timestamp = new Date()
                        .toLocaleString('zh-CN')
                        .replace(/[/:]/g, '-')
                        .replace(/\s/g, '_');

                    if (window.navigator && window.navigator.msSaveOrOpenBlob) {
                        canvas.toBlob(blob => {
                            if (blob) {
                                window.navigator.msSaveOrOpenBlob(blob, `五子棋_${timestamp}.png`);
                                showToast('图片已保存！');
                            } else {
                                showToast('保存图片失败，请重试');
                            }
                        });
                        return;
                    }

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
            
            // 棋盘颜色切换功能
            function changeBoardTheme(theme) {
                const body = document.body;
                // 移除所有主题类
                body.classList.remove('theme-dark-wood', 'theme-light-maple', 'theme-jade-green', 'theme-dark-gray', 'theme-bamboo');
                
                // 添加新主题类
                if (theme !== 'default') {
                    body.classList.add(`theme-${theme}`);
                }
                
                // 更新选中状态
                const colorOptions = document.querySelectorAll('.color-option');
                colorOptions.forEach(option => {
                    option.classList.remove('active');
                    if (option.dataset.theme === theme) {
                        option.classList.add('active');
                    }
                });
                
                // 保存选择
                localStorage.setItem('boardTheme', theme);
                
                // 显示提示
                const themeNames = {
                    'default': '金黄木色',
                    'dark-wood': '深棕红木',
                    'light-maple': '浅色枫木',
                    'jade-green': '翡翠绿',
                    'dark-gray': '深灰黑',
                    'bamboo': '竹质色'
                };
                showToast(`已切换至 ${themeNames[theme]} 主题`);
            }
            
            // 颜色选择器事件监听
            const colorOptions = document.querySelectorAll('.color-option');
            colorOptions.forEach(option => {
                option.addEventListener('click', () => {
                    const theme = option.dataset.theme;
                    changeBoardTheme(theme);
                });
            });
            
            // 页面加载时恢复保存的主题
            const savedTheme = localStorage.getItem('boardTheme');
            if (savedTheme) {
                changeBoardTheme(savedTheme);
            }
            
            undoBtn.addEventListener('click', undoMove);
            resetBtn.addEventListener('click', resetGame);
            saveBtn.addEventListener('click', saveAsImage);
            modalCloseBtn.addEventListener('click', resetGame);
            forbiddenCloseBtn.addEventListener('click', () => forbiddenModal.classList.remove('show'));
            if (rulesBtn) rulesBtn.addEventListener('click', () => rulesModal.classList.add('show'));
            if (rulesCloseBtn) rulesCloseBtn.addEventListener('click', () => rulesModal.classList.remove('show'));
            if (rulesModal) rulesModal.addEventListener('click', (e) => { if (e.target === rulesModal) rulesModal.classList.remove('show'); });
            
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
                const pieces = boardGrid.querySelectorAll('.piece');
                pieces.forEach(piece => {
                    const number = piece.dataset.number;
                    piece.textContent = gameState.showNumber ? number : '';
                });
            }
            
            initBoard();
            updatePlayerDisplay();
        });