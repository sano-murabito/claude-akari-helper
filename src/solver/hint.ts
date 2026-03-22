import type { Board, HintResult, Pos, SolverState } from '../types';
import { buildSolverState, propagate, isBlock } from './propagation';

export function computeHint(board: Board): HintResult {
  const state = buildSolverState(board);
  propagate(state);
  const { rows, cols, cells } = state;

  // Hint 1: Number-0 cell with unknown neighbors
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r][c];
      if (!cell.fixed || cell.clue !== 0) continue;
      const unknownNeighbors = getUnknownNeighbors(state, r, c);
      // Before propagation these would be unknown — use original board state
      const origState = buildSolverState(board);
      const origUnknown = getUnknownNeighbors(origState, r, c);
      if (origUnknown.length > 0) {
        return {
          found: true,
          focusCells: [{ row: r, col: c }, ...origUnknown],
          explanation: `(${r+1}, ${c+1}) の数字マス「0」に注目してください。数字0のマスには隣接する明かりが1つもあってはなりません。`,
        };
      }
      void unknownNeighbors; // suppress unused warning
    }
  }

  // Hint 2: Saturation — lit == clue, unknown neighbors still exist (pre-propagation)
  const origState2 = buildSolverState(board);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = origState2.cells[r][c];
      if (!cell.fixed || cell.clue === null || cell.clue === 0) continue;
      const clue = cell.clue;
      const neighbors = getWhiteNeighbors(origState2, r, c);
      const litCount = neighbors.filter(([nr, nc]) => origState2.cells[nr][nc].domain === 'light').length;
      const unknownNeighbors = neighbors
        .filter(([nr, nc]) => origState2.cells[nr][nc].domain === 'unknown')
        .map(([nr, nc]) => ({ row: nr, col: nc }));

      if (litCount === clue && unknownNeighbors.length > 0) {
        return {
          found: true,
          focusCells: [{ row: r, col: c }, ...unknownNeighbors],
          explanation: `(${r+1}, ${c+1}) の数字マス「${clue}」に注目してください。すでに必要数の明かりが揃っています。残りの隣接マスには明かりを置けません。`,
        };
      }
    }
  }

  // Hint 3: Forcing — lit + unknown == clue
  const origState3 = buildSolverState(board);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = origState3.cells[r][c];
      if (!cell.fixed || cell.clue === null) continue;
      const clue = cell.clue;
      const neighbors = getWhiteNeighbors(origState3, r, c);
      const litCount = neighbors.filter(([nr, nc]) => origState3.cells[nr][nc].domain === 'light').length;
      const unknownNeighbors = neighbors
        .filter(([nr, nc]) => origState3.cells[nr][nc].domain === 'unknown')
        .map(([nr, nc]) => ({ row: nr, col: nc }));

      if (litCount + unknownNeighbors.length === clue && unknownNeighbors.length > 0) {
        return {
          found: true,
          focusCells: [{ row: r, col: c }, ...unknownNeighbors],
          explanation: `(${r+1}, ${c+1}) の数字マス「${clue}」に注目してください。あと${unknownNeighbors.length}個の明かりが必要で、置ける場所がちょうどその数しかありません。`,
        };
      }
    }
  }

  // Hint 4: Single illumination path
  const origState4 = buildSolverState(board);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = origState4.cells[r][c];
      if (cell.fixed || cell.domain === 'no-light' || cell.domain === 'light') continue;

      // Already illuminated?
      let alreadyLit = false;
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        let nr = r + dr;
        let nc = c + dc;
        while (!isBlock(origState4, nr, nc)) {
          if (origState4.cells[nr][nc].domain === 'light') { alreadyLit = true; break; }
          nr += dr;
          nc += dc;
        }
        if (alreadyLit) break;
      }
      if (alreadyLit) continue;

      const candidates: Pos[] = [];
      if (cell.domain === 'unknown') candidates.push({ row: r, col: c });
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        let nr = r + dr;
        let nc = c + dc;
        while (!isBlock(origState4, nr, nc)) {
          if (origState4.cells[nr][nc].domain === 'unknown') {
            candidates.push({ row: nr, col: nc });
          }
          nr += dr;
          nc += dc;
        }
      }

      if (candidates.length === 1) {
        return {
          found: true,
          focusCells: [{ row: r, col: c }, ...candidates],
          explanation: `(${r+1}, ${c+1}) のマスに注目してください。このマスを照らせる可能性のある場所が1つしかありません。`,
        };
      }
    }
  }

  // Hint 5: Segment constriction
  const origState5 = buildSolverState(board);
  const segmentHint = findSegmentHint(origState5);
  if (segmentHint) return segmentHint;

  return {
    found: false,
    focusCells: [],
    explanation: 'これ以上ヒントが見つかりませんでした。論理的に確定できる箇所がないか、すでに全て確定しています。',
  };
}

function getUnknownNeighbors(state: SolverState, r: number, c: number): Pos[] {
  const result: Pos[] = [];
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols && !state.cells[nr][nc].fixed) {
      if (state.cells[nr][nc].domain === 'unknown') {
        result.push({ row: nr, col: nc });
      }
    }
  }
  return result;
}

function getWhiteNeighbors(state: SolverState, r: number, c: number): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols && !state.cells[nr][nc].fixed) {
      result.push([nr, nc]);
    }
  }
  return result;
}

function findSegmentHint(state: SolverState): HintResult | null {
  const { rows, cols } = state;

  // Find row segments
  for (let r = 0; r < rows; r++) {
    let segStart = 0;
    while (segStart < cols) {
      while (segStart < cols && isBlock(state, r, segStart)) segStart++;
      if (segStart >= cols) break;
      let segEnd = segStart;
      while (segEnd < cols && !isBlock(state, r, segEnd)) segEnd++;

      const segCells: Pos[] = [];
      for (let c = segStart; c < segEnd; c++) {
        segCells.push({ row: r, col: c });
      }

      const hint = checkSegmentForHint(state, segCells, r + 1, segStart + 1, segEnd, '行');
      if (hint) return hint;
      segStart = segEnd + 1;
    }
  }

  // Find column segments
  for (let c = 0; c < cols; c++) {
    let segStart = 0;
    while (segStart < rows) {
      while (segStart < rows && isBlock(state, segStart, c)) segStart++;
      if (segStart >= rows) break;
      let segEnd = segStart;
      while (segEnd < rows && !isBlock(state, segEnd, c)) segEnd++;

      const segCells: Pos[] = [];
      for (let r = segStart; r < segEnd; r++) {
        segCells.push({ row: r, col: c });
      }

      const hint = checkSegmentForHint(state, segCells, segStart + 1, c + 1, segEnd, '列');
      if (hint) return hint;
      segStart = segEnd + 1;
    }
  }

  return null;
}

function checkSegmentForHint(
  state: SolverState,
  segCells: Pos[],
  lineNum: number,
  startPos: number,
  endPos: number,
  direction: string,
): HintResult | null {
  void startPos; void endPos; // unused but kept for potential future use

  const unknowns = segCells.filter(p => state.cells[p.row][p.col].domain === 'unknown');

  for (const u of unknowns) {
    // Temporarily mark this unknown as no-light
    const origDomain = state.cells[u.row][u.col].domain;
    state.cells[u.row][u.col].domain = 'no-light';

    let createsUnilluminable = false;
    for (const p of segCells) {
      const cell = state.cells[p.row][p.col];
      if (cell.domain === 'no-light') continue;
      if (cell.domain === 'light') continue;

      let canBeIlluminated = cell.domain === 'unknown';
      if (!canBeIlluminated) {
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          let nr = p.row + dr;
          let nc = p.col + dc;
          while (!isBlock(state, nr, nc)) {
            const sc = state.cells[nr][nc];
            if (sc.domain === 'light' || sc.domain === 'unknown') { canBeIlluminated = true; break; }
            nr += dr;
            nc += dc;
          }
          if (canBeIlluminated) break;
        }
      }

      if (!canBeIlluminated) {
        createsUnilluminable = true;
        break;
      }
    }

    state.cells[u.row][u.col].domain = origDomain;

    if (createsUnilluminable) {
      return {
        found: true,
        focusCells: segCells,
        explanation: `${lineNum}${direction}目のマス群に注目してください。すべてのマスが照らされるためには、明かりをどこに置くべきか考えてみましょう。`,
      };
    }
  }

  return null;
}
