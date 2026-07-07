/**
 * A* search cho bài toán 3x3 sliding puzzle. Heuristic Manhattan distance,
 * trả về thứ tự tile-id cần click để đi từ trạng thái hiện tại về goal.
 *
 * Giới hạn max 8000 iterations để chặn rủi ro treo trình duyệt với những bố
 * cục bất khả thi (tuy giải thuật shuffle đã đảm bảo solvable).
 */

interface SolverNode {
  board: number[];
  emptyIndex: number;
  g: number;
  h: number;
  f: number;
  parent: SolverNode | null;
  moveTileId: number;
}

const GOAL_3X3 = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const SIZE = 3;
const EMPTY_ID = 8;

function getManhattanDistance(board: number[]): number {
  let distance = 0;
  for (let i = 0; i < board.length; i++) {
    const tileId = board[i];
    if (tileId === EMPTY_ID) continue;
    const correctRow = Math.floor(tileId / SIZE);
    const correctCol = tileId % SIZE;
    const currentRow = Math.floor(i / SIZE);
    const currentCol = i % SIZE;
    distance +=
      Math.abs(currentRow - correctRow) + Math.abs(currentCol - correctCol);
  }
  return distance;
}

function getNeighbors(index: number): number[] {
  const row = Math.floor(index / SIZE);
  const col = index % SIZE;
  const neighbors: number[] = [];
  if (row > 0) neighbors.push(index - SIZE);
  if (row < SIZE - 1) neighbors.push(index + SIZE);
  if (col > 0) neighbors.push(index - 1);
  if (col < SIZE - 1) neighbors.push(index + 1);
  return neighbors;
}

export function solve3x3(currentBoard: number[]): number[] | null {
  if (currentBoard.every((val, idx) => val === GOAL_3X3[idx])) {
    return [];
  }

  const startEmpty = currentBoard.indexOf(EMPTY_ID);
  const startNode: SolverNode = {
    board: [...currentBoard],
    emptyIndex: startEmpty,
    g: 0,
    h: getManhattanDistance(currentBoard),
    f: 0,
    parent: null,
    moveTileId: -1,
  };
  startNode.f = startNode.h;

  const openList: SolverNode[] = [startNode];
  const closedSet = new Set<string>();

  const maxIterations = 8000;
  let iterations = 0;

  while (openList.length > 0 && iterations < maxIterations) {
    iterations++;

    let lowestIdx = 0;
    for (let i = 1; i < openList.length; i++) {
      if (openList[i].f < openList[lowestIdx].f) {
        lowestIdx = i;
      }
    }

    const current = openList.splice(lowestIdx, 1)[0];
    const boardKey = current.board.join(",");

    if (current.board.every((val, idx) => val === GOAL_3X3[idx])) {
      const path: number[] = [];
      let temp: SolverNode | null = current;
      while (temp && temp.parent !== null) {
        path.push(temp.moveTileId);
        temp = temp.parent;
      }
      return path.reverse();
    }

    closedSet.add(boardKey);

    const emptyIdx = current.emptyIndex;
    const targets = getNeighbors(emptyIdx);

    for (const neighborIdx of targets) {
      const newBoard = [...current.board];
      const movedTileId = newBoard[neighborIdx];

      newBoard[emptyIdx] = movedTileId;
      newBoard[neighborIdx] = EMPTY_ID;

      const neighborKey = newBoard.join(",");
      if (closedSet.has(neighborKey)) continue;

      const gScore = current.g + 1;
      const hScore = getManhattanDistance(newBoard);
      const fScore = gScore + hScore;

      const existingOpen = openList.find(
        (node) => node.board.join(",") === neighborKey
      );
      if (existingOpen && existingOpen.g <= gScore) continue;

      const neighborNode: SolverNode = {
        board: newBoard,
        emptyIndex: neighborIdx,
        g: gScore,
        h: hScore,
        f: fScore,
        parent: current,
        moveTileId: movedTileId,
      };

      if (existingOpen) {
        existingOpen.g = gScore;
        existingOpen.f = fScore;
        existingOpen.parent = current;
        existingOpen.moveTileId = movedTileId;
      } else {
        openList.push(neighborNode);
      }
    }
  }

  return null;
}
