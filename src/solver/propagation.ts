import type { Board, SolverState, SolverCell, Domain } from '../types';

export function buildSolverState(board: Board): SolverState {
  const cells: SolverCell[][] = [];
  for (let r = 0; r < board.rows; r++) {
    cells.push([]);
    for (let c = 0; c < board.cols; c++) {
      const cell = board.cells[r][c];
      let domain: Domain = 'unknown';
      let fixed = false;

      if (cell.kind === 'block' || cell.kind === 'number') {
        domain = 'no-light';
        fixed = true;
      } else if (cell.kind === 'light') {
        domain = 'light';
      } else if (cell.kind === 'no-light') {
        domain = 'no-light';
      }

      cells[r].push({ domain, fixed, clue: cell.clue });
    }
  }
  return { rows: board.rows, cols: board.cols, cells };
}

export function cloneSolverState(state: SolverState): SolverState {
  return {
    rows: state.rows,
    cols: state.cols,
    cells: state.cells.map(row => row.map(c => ({ ...c }))),
  };
}

export function isBlock(state: SolverState, r: number, c: number): boolean {
  if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return true;
  return state.cells[r][c].fixed;
}

function forceCell(state: SolverState, r: number, c: number, domain: Domain): boolean {
  const cell = state.cells[r][c];
  if (cell.fixed) return false;
  if (cell.domain === domain) return false;
  if (cell.domain !== 'unknown') return false;
  cell.domain = domain;
  return true;
}

/** Whether two non-fixed cells can see each other (same row/col, no block between) */
export function canSee(
  state: SolverState,
  r1: number, c1: number,
  r2: number, c2: number,
): boolean {
  if (r1 === r2) {
    const lo = Math.min(c1, c2) + 1;
    const hi = Math.max(c1, c2);
    for (let col = lo; col < hi; col++) {
      if (isBlock(state, r1, col)) return false;
    }
    return true;
  }
  if (c1 === c2) {
    const lo = Math.min(r1, r2) + 1;
    const hi = Math.max(r1, r2);
    for (let row = lo; row < hi; row++) {
      if (isBlock(state, row, c1)) return false;
    }
    return true;
  }
  return false;
}

/** Rule 1: All cells visible from a light → no-light */
function applyRule1(state: SolverState): boolean {
  let changed = false;
  const { rows, cols, cells } = state;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c].domain !== 'light') continue;
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        let nr = r + dr;
        let nc = c + dc;
        while (!isBlock(state, nr, nc)) {
          if (cells[nr][nc].domain === 'unknown') {
            cells[nr][nc].domain = 'no-light';
            changed = true;
          }
          nr += dr;
          nc += dc;
        }
      }
    }
  }
  return changed;
}

/** Rule 2: Number saturation and forcing */
function applyRule2(state: SolverState): boolean {
  let changed = false;
  const { rows, cols, cells } = state;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r][c];
      if (!cell.fixed || cell.clue === null) continue;
      const clue = cell.clue;

      const neighbors: Array<[number, number]> = [];
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !cells[nr][nc].fixed) {
          neighbors.push([nr, nc]);
        }
      }

      const litCount = neighbors.filter(([nr, nc]) => cells[nr][nc].domain === 'light').length;
      const unknownNeighbors = neighbors.filter(([nr, nc]) => cells[nr][nc].domain === 'unknown');

      if (litCount === clue) {
        for (const [nr, nc] of unknownNeighbors) {
          cells[nr][nc].domain = 'no-light';
          changed = true;
        }
      }
      if (litCount + unknownNeighbors.length === clue && unknownNeighbors.length > 0) {
        for (const [nr, nc] of unknownNeighbors) {
          cells[nr][nc].domain = 'light';
          changed = true;
        }
      }
    }
  }
  return changed;
}

/** Rule 4: If a white cell has only one possible illuminator → that cell → light */
function applyRule4(state: SolverState): boolean {
  let changed = false;
  const { rows, cols, cells } = state;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r][c];
      if (cell.fixed || cell.domain === 'no-light') continue;
      if (cell.domain === 'light') continue;

      let alreadyLit = false;
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        let nr = r + dr;
        let nc = c + dc;
        while (!isBlock(state, nr, nc)) {
          if (cells[nr][nc].domain === 'light') { alreadyLit = true; break; }
          nr += dr;
          nc += dc;
        }
        if (alreadyLit) break;
      }
      if (alreadyLit) continue;

      const candidates: Array<[number, number]> = [];
      if (cell.domain === 'unknown') candidates.push([r, c]);

      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        let nr = r + dr;
        let nc = c + dc;
        while (!isBlock(state, nr, nc)) {
          if (cells[nr][nc].domain === 'unknown') candidates.push([nr, nc]);
          nr += dr;
          nc += dc;
        }
      }

      if (candidates.length === 1) {
        const [cr, cc] = candidates[0];
        if (forceCell(state, cr, cc, 'light')) changed = true;
      }
    }
  }
  return changed;
}

/** Rule 5: Segment constriction */
function applyRule5(state: SolverState): boolean {
  let changed = false;
  const { rows, cols, cells } = state;

  for (let r = 0; r < rows; r++) {
    let segStart = 0;
    while (segStart < cols) {
      while (segStart < cols && isBlock(state, r, segStart)) segStart++;
      if (segStart >= cols) break;
      let segEnd = segStart;
      while (segEnd < cols && !isBlock(state, r, segEnd)) segEnd++;
      const unknowns: Array<[number, number]> = [];
      for (let c = segStart; c < segEnd; c++) {
        if (cells[r][c].domain === 'unknown') unknowns.push([r, c]);
      }
      for (const [ur, uc] of unknowns) {
        if (wouldCreateUnilluminable(state, ur, uc)) {
          if (forceCell(state, ur, uc, 'light')) changed = true;
        }
      }
      segStart = segEnd + 1;
    }
  }

  for (let c = 0; c < cols; c++) {
    let segStart = 0;
    while (segStart < rows) {
      while (segStart < rows && isBlock(state, segStart, c)) segStart++;
      if (segStart >= rows) break;
      let segEnd = segStart;
      while (segEnd < rows && !isBlock(state, segEnd, c)) segEnd++;
      const unknowns: Array<[number, number]> = [];
      for (let r = segStart; r < segEnd; r++) {
        if (cells[r][c].domain === 'unknown') unknowns.push([r, c]);
      }
      for (const [ur, uc] of unknowns) {
        if (wouldCreateUnilluminable(state, ur, uc)) {
          if (forceCell(state, ur, uc, 'light')) changed = true;
        }
      }
      segStart = segEnd + 1;
    }
  }

  return changed;
}

function wouldCreateUnilluminable(state: SolverState, ur: number, uc: number): boolean {
  const { rows, cols, cells } = state;
  const orig = cells[ur][uc].domain;
  cells[ur][uc].domain = 'no-light';

  let result = false;
  outer:
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r][c];
      if (cell.fixed || cell.domain === 'no-light') continue;

      let illuminated = cell.domain === 'light';
      if (!illuminated) {
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          let nr = r + dr;
          let nc = c + dc;
          while (!isBlock(state, nr, nc)) {
            if (cells[nr][nc].domain === 'light') { illuminated = true; break; }
            nr += dr;
            nc += dc;
          }
          if (illuminated) break;
        }
      }
      if (illuminated) continue;

      let hasCandidate = cell.domain === 'unknown';
      if (!hasCandidate) {
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          let nr = r + dr;
          let nc = c + dc;
          while (!isBlock(state, nr, nc)) {
            if (cells[nr][nc].domain === 'unknown') { hasCandidate = true; break; }
            nr += dr;
            nc += dc;
          }
          if (hasCandidate) break;
        }
      }

      if (!hasCandidate) {
        result = true;
        break outer;
      }
    }
  }

  cells[ur][uc].domain = orig;
  return result;
}

/** Rule 6: If placing a light at C would violate a number constraint → C → no-light */
function applyRule6(state: SolverState): boolean {
  let changed = false;
  const { rows, cols, cells } = state;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c].domain !== 'unknown') continue;
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const neighbor = cells[nr][nc];
        if (!neighbor.fixed || neighbor.clue === null) continue;
        const adjLights = countAdjacentDomain(state, nr, nc, 'light');
        if (adjLights >= neighbor.clue) {
          cells[r][c].domain = 'no-light';
          changed = true;
          break;
        }
      }
    }
  }
  return changed;
}

function countAdjacentDomain(state: SolverState, r: number, c: number, domain: Domain): number {
  let count = 0;
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols) {
      if (state.cells[nr][nc].domain === domain) count++;
    }
  }
  return count;
}

/** Detect logical contradictions in the current solver state */
export function hasContradiction(state: SolverState): boolean {
  const { rows, cols, cells } = state;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r][c];

      // Number clue violations
      if (cell.fixed && cell.clue !== null) {
        let litCount = 0;
        let unknownCount = 0;
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nr = r + dr; const nc = c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const n = cells[nr][nc];
          if (!n.fixed) {
            if (n.domain === 'light') litCount++;
            else if (n.domain === 'unknown') unknownCount++;
          }
        }
        if (litCount > cell.clue) return true;
        if (litCount + unknownCount < cell.clue) return true;
      }

      // Non-fixed cell that can never be illuminated
      if (!cell.fixed && cell.domain !== 'light') {
        let illuminated = false;
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          let nr = r + dr; let nc = c + dc;
          while (!isBlock(state, nr, nc)) {
            if (cells[nr][nc].domain === 'light') { illuminated = true; break; }
            nr += dr; nc += dc;
          }
          if (illuminated) break;
        }
        if (!illuminated) {
          let hasCandidate = cell.domain === 'unknown';
          if (!hasCandidate) {
            for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
              let nr = r + dr; let nc = c + dc;
              while (!isBlock(state, nr, nc)) {
                if (cells[nr][nc].domain === 'unknown') { hasCandidate = true; break; }
                nr += dr; nc += dc;
              }
              if (hasCandidate) break;
            }
          }
          if (!hasCandidate) return true;
        }
      }

      // Two lights seeing each other
      if (!cell.fixed && cell.domain === 'light') {
        for (const [dr, dc] of [[0,1],[1,0]]) {
          let nr = r + dr; let nc = c + dc;
          while (!isBlock(state, nr, nc)) {
            if (cells[nr][nc].domain === 'light') return true;
            nr += dr; nc += dc;
          }
        }
      }
    }
  }
  return false;
}

/** Find cells that witness the contradiction (for hint explanations) */
export function findContradictionWitness(state: SolverState): Array<[number, number]> {
  const { rows, cols, cells } = state;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r][c];

      if (cell.fixed && cell.clue !== null) {
        let litCount = 0; let unknownCount = 0;
        const neighPos: Array<[number, number]> = [];
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nr = r + dr; const nc = c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const n = cells[nr][nc];
          if (!n.fixed) {
            neighPos.push([nr, nc]);
            if (n.domain === 'light') litCount++;
            else if (n.domain === 'unknown') unknownCount++;
          }
        }
        if (litCount > cell.clue || litCount + unknownCount < cell.clue) {
          return [[r, c], ...neighPos];
        }
      }

      if (!cell.fixed && cell.domain !== 'light') {
        let illuminated = false;
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          let nr = r + dr; let nc = c + dc;
          while (!isBlock(state, nr, nc)) {
            if (cells[nr][nc].domain === 'light') { illuminated = true; break; }
            nr += dr; nc += dc;
          }
          if (illuminated) break;
        }
        let hasCandidate = cell.domain === 'unknown';
        if (!hasCandidate) {
          for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            let nr = r + dr; let nc = c + dc;
            while (!isBlock(state, nr, nc)) {
              if (cells[nr][nc].domain === 'unknown') { hasCandidate = true; break; }
              nr += dr; nc += dc;
            }
            if (hasCandidate) break;
          }
        }
        if (!illuminated && !hasCandidate) return [[r, c]];
      }

      if (!cell.fixed && cell.domain === 'light') {
        for (const [dr, dc] of [[0,1],[1,0]]) {
          let nr = r + dr; let nc = c + dc;
          while (!isBlock(state, nr, nc)) {
            if (cells[nr][nc].domain === 'light') return [[r, c], [nr, nc]];
            nr += dr; nc += dc;
          }
        }
      }
    }
  }
  return [];
}

/** Basic propagation: Rules 1–6 only (no trial). Safe to call recursively. */
export function propagateBasic(state: SolverState): SolverState {
  let changed = true;
  while (changed) {
    changed = false;
    changed = applyRule1(state) || changed;
    changed = applyRule2(state) || changed;
    changed = applyRule4(state) || changed;
    changed = applyRule5(state) || changed;
    changed = applyRule6(state) || changed;
  }
  return state;
}

/**
 * Full propagation: basic rules + trial-contradiction (仮置き矛盾探索).
 * For each unknown cell, tentatively placing a light or no-light and checking
 * for contradictions via propagateBasic. Restarts after each new deduction.
 */
export function propagate(state: SolverState): SolverState {
  propagateBasic(state);

  let outerChanged = true;
  while (outerChanged) {
    outerChanged = false;
    OUTER: for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        if (state.cells[r][c].domain !== 'unknown') continue;

        // Try as light
        const tryLight = cloneSolverState(state);
        tryLight.cells[r][c].domain = 'light';
        propagateBasic(tryLight);
        if (hasContradiction(tryLight)) {
          if (forceCell(state, r, c, 'no-light')) {
            outerChanged = true;
            propagateBasic(state);
            break OUTER;
          }
          continue;
        }

        // Try as no-light
        const tryNoLight = cloneSolverState(state);
        tryNoLight.cells[r][c].domain = 'no-light';
        propagateBasic(tryNoLight);
        if (hasContradiction(tryNoLight)) {
          if (forceCell(state, r, c, 'light')) {
            outerChanged = true;
            propagateBasic(state);
            break OUTER;
          }
        }
      }
    }
  }
  return state;
}

export { countAdjacentDomain };
