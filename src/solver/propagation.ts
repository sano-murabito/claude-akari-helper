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

function isBlock(state: SolverState, r: number, c: number): boolean {
  if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return true;
  return state.cells[r][c].fixed;
}

function forceCell(state: SolverState, r: number, c: number, domain: Domain): boolean {
  const cell = state.cells[r][c];
  if (cell.fixed) return false;
  if (cell.domain === domain) return false;
  if (cell.domain !== 'unknown') return false; // conflict — don't override
  cell.domain = domain;
  return true;
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

      // Gather neighbors
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

      // Saturation: already have enough lights → mark unknowns as no-light
      if (litCount === clue) {
        for (const [nr, nc] of unknownNeighbors) {
          cells[nr][nc].domain = 'no-light';
          changed = true;
        }
      }

      // Forcing: lit + unknown == clue → all unknowns must be lights
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
      if (cell.domain === 'light') continue; // already lit

      // Check if this cell is already illuminated by a placed light
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

      // Find all cells that could illuminate this cell (unknown in same row/col)
      const candidates: Array<[number, number]> = [];

      // This cell itself can be a light
      if (cell.domain === 'unknown') {
        candidates.push([r, c]);
      }

      // Other unknowns in same row/col
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        let nr = r + dr;
        let nc = c + dc;
        while (!isBlock(state, nr, nc)) {
          if (cells[nr][nc].domain === 'unknown') {
            candidates.push([nr, nc]);
          }
          nr += dr;
          nc += dc;
        }
      }

      if (candidates.length === 1) {
        const [cr, cc] = candidates[0];
        if (forceCell(state, cr, cc, 'light')) {
          changed = true;
        }
      }
    }
  }
  return changed;
}

/** Rule 5: Segment constriction — if marking unknown U as no-light leaves a cell unilluminable → U must be light */
function applyRule5(state: SolverState): boolean {
  let changed = false;
  const { rows, cols, cells } = state;

  // Process row segments
  for (let r = 0; r < rows; r++) {
    let segStart = 0;
    while (segStart < cols) {
      // Find next non-block
      while (segStart < cols && isBlock(state, r, segStart)) segStart++;
      if (segStart >= cols) break;

      // Find end of segment
      let segEnd = segStart;
      while (segEnd < cols && !isBlock(state, r, segEnd)) segEnd++;

      // Collect unknowns in this segment
      const unknowns: Array<[number, number]> = [];
      for (let c = segStart; c < segEnd; c++) {
        if (cells[r][c].domain === 'unknown') unknowns.push([r, c]);
      }

      // For each unknown, check if marking it no-light leaves any cell unilluminable
      for (const [ur, uc] of unknowns) {
        if (wouldCreateUnilluminable(state, ur, uc)) {
          if (forceCell(state, ur, uc, 'light')) {
            changed = true;
          }
        }
      }

      segStart = segEnd + 1;
    }
  }

  // Process column segments
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
          if (forceCell(state, ur, uc, 'light')) {
            changed = true;
          }
        }
      }

      segStart = segEnd + 1;
    }
  }

  return changed;
}

/** Check if temporarily marking cell (ur, uc) as no-light would leave any cell unilluminable */
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

      // Already illuminated by a placed light?
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

      // Has any candidate illuminator (unknown in same row/col)?
      let hasCandidate = cell.domain === 'unknown'; // itself
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

/** Rule 6: If placing a light at cell C would violate a number constraint → C → no-light */
function applyRule6(state: SolverState): boolean {
  let changed = false;
  const { rows, cols, cells } = state;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c].domain !== 'unknown') continue;

      // Would placing a light here violate any adjacent number clue?
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const neighbor = cells[nr][nc];
        if (!neighbor.fixed || neighbor.clue === null) continue;

        // Count existing lights adjacent to this number cell
        const adjLights = countAdjacentDomain(state, nr, nc, 'light');
        if (adjLights >= neighbor.clue) {
          // This number already satisfied → no more lights can go here
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

/** Fixed-point propagation loop */
export function propagate(state: SolverState): SolverState {
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

export { countAdjacentDomain, isBlock };
