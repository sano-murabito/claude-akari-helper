import type { Board, CheckResult, InconsistencyReason, Pos } from '../types';
import { buildSolverState, propagate, isBlock } from './propagation';

export function checkInconsistency(board: Board): CheckResult {
  const reasons: InconsistencyReason[] = [];
  const { rows, cols, cells } = board;

  // Check 1: Two lights see each other
  const lightPositions: Pos[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c].kind === 'light') lightPositions.push({ row: r, col: c });
    }
  }

  for (let i = 0; i < lightPositions.length; i++) {
    const a = lightPositions[i];
    for (let j = i + 1; j < lightPositions.length; j++) {
      const b = lightPositions[j];
      if (lightsSeEachOther(board, a, b)) {
        reasons.push({ type: 'lights-see-each-other', positions: [a, b] });
      }
    }
  }

  // Check 2 & 3: Number clue violations
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r][c];
      if (cell.kind !== 'number' || cell.clue === null) continue;
      const clue = cell.clue;

      let litCount = 0;
      let emptyCount = 0;
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const k = cells[nr][nc].kind;
        if (k === 'light') litCount++;
        else if (k === 'empty' || k === 'no-light') emptyCount++;
      }

      if (litCount > clue) {
        reasons.push({ type: 'number-exceeded', pos: { row: r, col: c }, clue, actual: litCount });
      }
      if (litCount + emptyCount < clue) {
        reasons.push({
          type: 'number-impossible',
          pos: { row: r, col: c },
          clue,
          needed: clue - litCount,
          available: emptyCount,
        });
      }
    }
  }

  // Build solver state and propagate to find further issues
  const solverState = buildSolverState(board);
  propagate(solverState);

  // Check 4: Cell-unilluminable (after propagation)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sc = solverState.cells[r][c];
      if (sc.fixed || sc.domain === 'no-light') continue;

      // Already lit by placed light?
      if (sc.domain === 'light') continue;

      let canBeIlluminated = sc.domain === 'unknown'; // could be a light itself
      if (!canBeIlluminated) {
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          let nr = r + dr;
          let nc = c + dc;
          while (!isBlock(solverState, nr, nc)) {
            const nc2 = solverState.cells[nr][nc];
            if (nc2.domain === 'light' || nc2.domain === 'unknown') {
              canBeIlluminated = true;
              break;
            }
            nr += dr;
            nc += dc;
          }
          if (canBeIlluminated) break;
        }
      }

      if (!canBeIlluminated) {
        reasons.push({ type: 'cell-unilluminable', pos: { row: r, col: c } });
      }
    }
  }

  // Check 5: Player placed a light where propagation says no-light
  // (Only if the solver state contradicts player)
  const propagatedState = buildSolverState(board);
  // Remove player lights to see what propagation forces
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board.cells[r][c].kind === 'light') {
        propagatedState.cells[r][c].domain = 'unknown';
      }
    }
  }
  propagate(propagatedState);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board.cells[r][c].kind === 'light' && propagatedState.cells[r][c].domain === 'no-light') {
        reasons.push({ type: 'forced-no-light-violated', pos: { row: r, col: c } });
      }
    }
  }

  // Compute forced cells (cells solver determined but player hasn't placed)
  const forcedLights: Pos[] = [];
  const forcedNoLights: Pos[] = [];
  const fullState = buildSolverState(board);
  propagate(fullState);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sc = fullState.cells[r][c];
      const original = board.cells[r][c].kind;
      if (sc.domain === 'light' && original !== 'light') {
        forcedLights.push({ row: r, col: c });
      }
      if (sc.domain === 'no-light' && !sc.fixed && original !== 'no-light') {
        forcedNoLights.push({ row: r, col: c });
      }
    }
  }

  return {
    consistent: reasons.length === 0,
    reasons,
    forcedLights,
    forcedNoLights,
  };
}

function lightsSeEachOther(board: Board, a: Pos, b: Pos): boolean {
  const { rows, cols, cells } = board;
  const isBlockCell = (r: number, c: number): boolean => {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return true;
    return cells[r][c].kind === 'block' || cells[r][c].kind === 'number';
  };

  if (a.row === b.row) {
    const minC = Math.min(a.col, b.col);
    const maxC = Math.max(a.col, b.col);
    for (let c = minC + 1; c < maxC; c++) {
      if (isBlockCell(a.row, c)) return false;
    }
    return true;
  }
  if (a.col === b.col) {
    const minR = Math.min(a.row, b.row);
    const maxR = Math.max(a.row, b.row);
    for (let r = minR + 1; r < maxR; r++) {
      if (isBlockCell(r, a.col)) return false;
    }
    return true;
  }
  return false;
}

export { lightsSeEachOther };
