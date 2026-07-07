import {
  BoardState,
  CaroSettings,
  Difficulty,
  PlayerSymbol,
  Position,
  WinningLine,
} from "../types";

const isWithinBounds = (
  row: number,
  col: number,
  boardSize: number
): boolean => {
  return row >= 0 && row < boardSize && col >= 0 && col < boardSize;
};

// Tìm đường thắng đầu tiên trên bàn (theo độ dài win-length, ngang/dọc/chéo)
export function checkWin(
  board: BoardState,
  blockTwoEnds: boolean,
  winLength: number
): WinningLine | null {
  const boardSize = board.length;
  const directions = [
    { dr: 0, dc: 1 },
    { dr: 1, dc: 0 },
    { dr: 1, dc: 1 },
    { dr: 1, dc: -1 },
  ];

  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      const symbol = board[r][c];
      if (!symbol) continue;

      for (const { dr, dc } of directions) {
        let count = 1;
        const positions: Position[] = [{ row: r, col: c }];

        for (let i = 1; i < winLength; i++) {
          const nr = r + dr * i;
          const nc = c + dc * i;
          if (isWithinBounds(nr, nc, boardSize) && board[nr][nc] === symbol) {
            count++;
            positions.push({ row: nr, col: nc });
          } else {
            break;
          }
        }

        if (count === winLength) {
          if (blockTwoEnds) {
            const preRow = r - dr;
            const preCol = c - dc;
            const postRow = r + dr * winLength;
            const postCol = c + dc * winLength;

            const preBlocked =
              !isWithinBounds(preRow, preCol, boardSize) ||
              (board[preRow][preCol] !== null &&
                board[preRow][preCol] !== symbol);
            const postBlocked =
              !isWithinBounds(postRow, postCol, boardSize) ||
              (board[postRow][postCol] !== null &&
                board[postRow][postCol] !== symbol);

            // Luật VN: bị chặn cả 2 đầu thì không tính thắng.
            if (!(preBlocked && postBlocked)) {
              return { positions, symbol };
            }
          } else {
            return { positions, symbol };
          }
        }
      }
    }
  }

  return null;
}

export function checkDraw(board: BoardState): boolean {
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (board[r][c] === null) return false;
    }
  }
  return true;
}

const EVAL_DIRECTIONS = [
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
  { dr: 1, dc: 1 },
  { dr: 1, dc: -1 },
];

/**
 * Trọng số tấn công / phòng thủ dựa trên số quân của 1 bên trong cửa sổ.
 * Mảng index theo `count` (số quân đã có sẵn trong cửa sổ trừ ô đang xét).
 * Index 0 sẽ không bao giờ chạm tới — luôn dùng count >= 1.
 */
const buildScoreTable = (winLength: number) => {
  // Đặc biệt với winLength=5: giữ nguyên trọng số gốc đã được tinh chỉnh.
  if (winLength === 5) {
    return {
      attack: [0, 80, 800, 8000, 120000],
      defense: [0, 20, 350, 4500, 90000],
    };
  }
  // Trường hợp winLength khác: scale theo cấp số nhân.
  const attack: number[] = [0];
  const defense: number[] = [0];
  for (let i = 1; i < winLength; i++) {
    attack.push(Math.round(80 * Math.pow(10, i - 1)));
    defense.push(Math.round(20 * Math.pow(15, i - 1)));
  }
  return { attack, defense };
};

function evaluateCell(
  board: BoardState,
  r: number,
  col: number,
  aiSymbol: PlayerSymbol,
  winLength: number
): number {
  const boardSize = board.length;
  const playerSymbol: PlayerSymbol = aiSymbol === "X" ? "O" : "X";
  const { attack, defense } = buildScoreTable(winLength);

  let totalScore = 0;

  // Ưu tiên trung tâm để AI kiểm soát ô giữa.
  const center = Math.floor(boardSize / 2);
  const centerBias =
    (center - Math.abs(r - center)) * 2 + (center - Math.abs(col - center)) * 2;
  totalScore += centerBias;

  for (const { dr, dc } of EVAL_DIRECTIONS) {
    // Mỗi hướng có winLength cửa sổ độ dài winLength bao quanh ô (r, col).
    for (let offset = -(winLength - 1); offset <= 0; offset++) {
      let aiCount = 0;
      let playerCount = 0;
      let isWindowValid = true;

      for (let i = 0; i < winLength; i++) {
        const wr = r + dr * (offset + i);
        const wc = col + dc * (offset + i);

        if (!isWithinBounds(wr, wc, boardSize)) {
          isWindowValid = false;
          break;
        }

        if (wr === r && wc === col) continue;

        const val = board[wr][wc];
        if (val === aiSymbol) aiCount++;
        else if (val === playerSymbol) playerCount++;
      }

      if (!isWindowValid) continue;

      // Hỗn hợp 2 bên thì không bên nào có thể đạt winLength trong cửa sổ này.
      if (aiCount > 0 && playerCount > 0) continue;

      if (aiCount > 0 && playerCount === 0) {
        totalScore += attack[Math.min(aiCount, winLength - 1)] ?? 0;
      } else if (playerCount > 0 && aiCount === 0) {
        totalScore += defense[Math.min(playerCount, winLength - 1)] ?? 0;
      } else {
        totalScore += 5;
      }
    }
  }

  return totalScore;
}

function getAvailableMoves(board: BoardState): Position[] {
  const moves: Position[] = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (board[r][c] === null) moves.push({ row: r, col: c });
    }
  }
  return moves;
}

function isNearAction(r: number, c: number, board: BoardState): boolean {
  const boardSize = board.length;
  const checkDist = 2;
  for (let dr = -checkDist; dr <= checkDist; dr++) {
    for (let dc = -checkDist; dc <= checkDist; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (isWithinBounds(nr, nc, boardSize) && board[nr][nc] !== null) {
        return true;
      }
    }
  }
  return false;
}

export function getBestMove(
  board: BoardState,
  difficulty: Difficulty,
  aiSymbol: PlayerSymbol,
  settings: CaroSettings
): Position {
  const boardSize = board.length;
  const center = Math.floor(boardSize / 2);
  const availableMoves = getAvailableMoves(board);

  if (availableMoves.length === 0) {
    return { row: center, col: center };
  }
  if (availableMoves.length === boardSize * boardSize) {
    return { row: center, col: center };
  }

  const actionMoves = availableMoves.filter((m) =>
    isNearAction(m.row, m.col, board)
  );
  const candidateMoves = actionMoves.length > 0 ? actionMoves : availableMoves;

  const scoredMoves = candidateMoves.map((move) => {
    const score = evaluateCell(
      board,
      move.row,
      move.col,
      aiSymbol,
      settings.winLength
    );
    return { move, score };
  });

  scoredMoves.sort((a, b) => b.score - a.score);

  if (difficulty === "easy") {
    const topK = Math.max(1, Math.floor(settings.easyTopKMoves));
    const chance = Math.min(1, Math.max(0, settings.easyRandomChancePct / 100));
    if (Math.random() < chance && scoredMoves.length > 0) {
      const index = Math.floor(Math.random() * Math.min(scoredMoves.length, topK));
      return scoredMoves[index].move;
    }
    return scoredMoves[0].move;
  }

  if (difficulty === "medium") {
    const topK = Math.max(1, Math.floor(settings.mediumTopKMoves));
    const chance = Math.min(
      1,
      Math.max(0, settings.mediumRandomChancePct / 100)
    );
    if (Math.random() < chance && scoredMoves.length > 1) {
      const index = Math.floor(Math.random() * Math.min(scoredMoves.length, topK));
      return scoredMoves[index].move;
    }
    return scoredMoves[0].move;
  }

  // hard
  return scoredMoves[0].move;
}
