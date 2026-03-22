import type { Board, HintResult, Pos, SolverState } from '../types';
import {
  buildSolverState,
  propagateBasic,
  cloneSolverState,
  isBlock,
  hasContradiction,
  findContradictionWitness,
} from './propagation';

export function computeHint(board: Board): HintResult {
  // Hints 1–5 use the raw board state (no propagation) so we show the
  // simplest reasoning first. Hints 6+ run propagateBasic first to find
  // patterns that require at least one propagation pass.

  const orig = buildSolverState(board);

  // ── Hint 1: Number-0 with unknown neighbors ─────────────────────────────
  for (let r = 0; r < orig.rows; r++) {
    for (let c = 0; c < orig.cols; c++) {
      const cell = orig.cells[r][c];
      if (!cell.fixed || cell.clue !== 0) continue;
      const unknownNeighbors = getUnknownNeighbors(orig, r, c);
      if (unknownNeighbors.length > 0) {
        return {
          found: true,
          focusCells: [{ row: r, col: c }, ...unknownNeighbors],
          explanation: `(${r+1}, ${c+1}) の数字マス「0」に注目してください。` +
            `数字0のマスには隣接する明かりが1つもあってはなりません。`,
        };
      }
    }
  }

  // ── Hint 2: Saturation — lit == clue, unknown neighbors still exist ──────
  for (let r = 0; r < orig.rows; r++) {
    for (let c = 0; c < orig.cols; c++) {
      const cell = orig.cells[r][c];
      if (!cell.fixed || cell.clue === null || cell.clue === 0) continue;
      const clue = cell.clue;
      const neighbors = getWhiteNeighbors(orig, r, c);
      const litCount = neighbors.filter(([nr, nc]) => orig.cells[nr][nc].domain === 'light').length;
      const unknownNeighbors = neighbors
        .filter(([nr, nc]) => orig.cells[nr][nc].domain === 'unknown')
        .map(([nr, nc]) => ({ row: nr, col: nc }));

      if (litCount === clue && unknownNeighbors.length > 0) {
        return {
          found: true,
          focusCells: [{ row: r, col: c }, ...unknownNeighbors],
          explanation: `(${r+1}, ${c+1}) の数字マス「${clue}」に注目してください。` +
            `すでに必要数の明かりが揃っています。残りの隣接マスには明かりを置けません。`,
        };
      }
    }
  }

  // ── Hint 3: Forcing — lit + unknown == clue ──────────────────────────────
  for (let r = 0; r < orig.rows; r++) {
    for (let c = 0; c < orig.cols; c++) {
      const cell = orig.cells[r][c];
      if (!cell.fixed || cell.clue === null) continue;
      const clue = cell.clue;
      const neighbors = getWhiteNeighbors(orig, r, c);
      const litCount = neighbors.filter(([nr, nc]) => orig.cells[nr][nc].domain === 'light').length;
      const unknownNeighbors = neighbors
        .filter(([nr, nc]) => orig.cells[nr][nc].domain === 'unknown')
        .map(([nr, nc]) => ({ row: nr, col: nc }));

      if (litCount + unknownNeighbors.length === clue && unknownNeighbors.length > 0) {
        return {
          found: true,
          focusCells: [{ row: r, col: c }, ...unknownNeighbors],
          explanation: `(${r+1}, ${c+1}) の数字マス「${clue}」に注目してください。` +
            `あと${unknownNeighbors.length}個の明かりが必要で、置ける場所がちょうどその数しかありません。`,
        };
      }
    }
  }

  // ── Hint 4: Single illumination path ─────────────────────────────────────
  for (let r = 0; r < orig.rows; r++) {
    for (let c = 0; c < orig.cols; c++) {
      const cell = orig.cells[r][c];
      if (cell.fixed || cell.domain === 'no-light' || cell.domain === 'light') continue;

      let alreadyLit = false;
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        let nr = r + dr; let nc = c + dc;
        while (!isBlock(orig, nr, nc)) {
          if (orig.cells[nr][nc].domain === 'light') { alreadyLit = true; break; }
          nr += dr; nc += dc;
        }
        if (alreadyLit) break;
      }
      if (alreadyLit) continue;

      const candidates: Pos[] = [];
      if (cell.domain === 'unknown') candidates.push({ row: r, col: c });
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        let nr = r + dr; let nc = c + dc;
        while (!isBlock(orig, nr, nc)) {
          if (orig.cells[nr][nc].domain === 'unknown') candidates.push({ row: nr, col: nc });
          nr += dr; nc += dc;
        }
      }

      if (candidates.length === 1) {
        return {
          found: true,
          focusCells: [{ row: r, col: c }, ...candidates],
          explanation: `(${r+1}, ${c+1}) のマスに注目してください。` +
            `このマスを照らせる可能性のある場所が1つしかありません。`,
        };
      }
    }
  }

  // ── Hint 5: Segment constriction ─────────────────────────────────────────
  const segHint = findSegmentHint(orig);
  if (segHint) return segHint;

  // ── From here, run propagateBasic first ──────────────────────────────────
  // Hints 5.5+ look for patterns that only emerge after basic propagation.
  const basic = buildSolverState(board);
  propagateBasic(basic);

  // ── Hint 5.5: Propagation-discoverable cells ──────────────────────────────
  // Catches chains like Rule1→Rule4 that aren't visible without propagation.
  // Example: cell A is illuminated by an existing light (→ A can't be a light),
  // which leaves only one candidate for cell B (→ B must be a light).
  const propHint = findPropagationHint(orig, basic);
  if (propHint) return propHint;

  // ── Hint 6: Trial-contradiction — 仮置き矛盾探索 ─────────────────────────
  // For each remaining unknown cell, try placing a light or no-light and
  // check whether basic propagation leads to a contradiction.
  for (let r = 0; r < basic.rows; r++) {
    for (let c = 0; c < basic.cols; c++) {
      if (basic.cells[r][c].domain !== 'unknown') continue;

      // ── Try as light ──
      const tryLight = cloneSolverState(basic);
      tryLight.cells[r][c].domain = 'light';
      propagateBasic(tryLight);
      if (hasContradiction(tryLight)) {
        const witness = findContradictionWitness(tryLight)
          .map(([wr, wc]) => ({ row: wr, col: wc }));
        return {
          found: true,
          focusCells: [{ row: r, col: c }, ...witness.slice(0, 3)],
          explanation: buildTrialExplanation(r, c, 'light', witness),
        };
      }

      // ── Try as no-light ──
      const tryNoLight = cloneSolverState(basic);
      tryNoLight.cells[r][c].domain = 'no-light';
      propagateBasic(tryNoLight);
      if (hasContradiction(tryNoLight)) {
        const witness = findContradictionWitness(tryNoLight)
          .map(([wr, wc]) => ({ row: wr, col: wc }));
        return {
          found: true,
          focusCells: [{ row: r, col: c }, ...witness.slice(0, 3)],
          explanation: buildTrialExplanation(r, c, 'no-light', witness),
        };
      }
    }
  }

  return {
    found: false,
    focusCells: [],
    explanation: 'これ以上ヒントが見つかりませんでした。論理的に確定できる箇所がないか、すでに全て確定しています。',
  };
}

// ── Explanation builders ───────────────────────────────────────────────────

function buildTrialExplanation(
  r: number, c: number,
  tried: 'light' | 'no-light',
  witness: Pos[],
): string {
  const pos = `(${r+1}, ${c+1})`;
  if (tried === 'light') {
    const detail = witness.length > 0
      ? `すると ${formatPos(witness[0])} 付近で矛盾が生じます。`
      : '矛盾が生じます。';
    return `${pos} のマスに明かりを仮に置いてみましょう。${detail}` +
      `よってここには明かりを置けません。`;
  } else {
    const detail = witness.length > 0
      ? `すると ${formatPos(witness[0])} 付近で矛盾が生じます。`
      : '矛盾が生じます。';
    return `${pos} のマスが明かりなしだと仮定してみましょう。${detail}` +
      `よってここには必ず明かりを置く必要があります。`;
  }
}

function formatPos(p: Pos): string {
  return `(${p.row+1}, ${p.col+1})`;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getUnknownNeighbors(state: SolverState, r: number, c: number): Pos[] {
  const result: Pos[] = [];
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nr = r + dr; const nc = c + dc;
    if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols && !state.cells[nr][nc].fixed) {
      if (state.cells[nr][nc].domain === 'unknown') result.push({ row: nr, col: nc });
    }
  }
  return result;
}

function getWhiteNeighbors(state: SolverState, r: number, c: number): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nr = r + dr; const nc = c + dc;
    if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols && !state.cells[nr][nc].fixed) {
      result.push([nr, nc]);
    }
  }
  return result;
}

function findSegmentHint(state: SolverState): HintResult | null {
  const { rows, cols } = state;

  for (let r = 0; r < rows; r++) {
    let segStart = 0;
    while (segStart < cols) {
      while (segStart < cols && isBlock(state, r, segStart)) segStart++;
      if (segStart >= cols) break;
      let segEnd = segStart;
      while (segEnd < cols && !isBlock(state, r, segEnd)) segEnd++;
      const segCells: Pos[] = [];
      for (let c = segStart; c < segEnd; c++) segCells.push({ row: r, col: c });
      const hint = checkSegmentForHint(state, segCells, r + 1, '行');
      if (hint) return hint;
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
      const segCells: Pos[] = [];
      for (let r = segStart; r < segEnd; r++) segCells.push({ row: r, col: c });
      const hint = checkSegmentForHint(state, segCells, c + 1, '列');
      if (hint) return hint;
      segStart = segEnd + 1;
    }
  }

  return null;
}

// ── Hint 5.5 helpers ───────────────────────────────────────────────────────

/**
 * Compare orig (no propagation) to basic (after propagateBasic).
 * If any cell went from 'unknown' → 'light'/'no-light', surface a hint.
 */
function findPropagationHint(orig: SolverState, basic: SolverState): HintResult | null {
  for (let r = 0; r < orig.rows; r++) {
    for (let c = 0; c < orig.cols; c++) {
      if (orig.cells[r][c].domain !== 'unknown') continue;
      const resolved = basic.cells[r][c].domain;
      if (resolved === 'unknown') continue;

      if (resolved === 'no-light') continue; // 照らされたセルに明かりが置けないのは自明

      if (resolved === 'light') {
        // Most common cause: Rule 4 after Rule 1 — only candidate for some unlit cell
        const target = findSingleCandidateTarget(orig, basic, r, c);
        if (target) {
          return {
            found: true,
            focusCells: [{ row: r, col: c }, target],
            explanation:
              `(${target.row+1}, ${target.col+1}) のマスを照らせる可能性のある場所を考えると、` +
              `他の候補マスはすでに別の明かりで照らされているため明かりを置けません。` +
              `よって (${r+1}, ${c+1}) に明かりを置く必要があります。`,
          };
        }
        return {
          found: true,
          focusCells: [{ row: r, col: c }],
          explanation:
            `(${r+1}, ${c+1}) のマスには、制約の伝播により明かりを置く必要があります。`,
        };
      }
    }
  }
  return null;
}

/**
 * Given that propagation forced (r,c) to 'light', find a cell visible from
 * (r,c) in orig whose only remaining candidate (in basic) is (r,c) itself.
 */
function findSingleCandidateTarget(
  orig: SolverState, basic: SolverState, r: number, c: number,
): Pos | null {
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
    let nr = r + dr; let nc = c + dc;
    while (!isBlock(orig, nr, nc)) {
      const cell = orig.cells[nr][nc];
      if (!cell.fixed && cell.domain === 'unknown') {
        // Collect candidates for (nr,nc) using the basic (post-propagation) state
        const cands = collectCandidatesInState(basic, nr, nc);
        if (cands.length === 1 && cands[0][0] === r && cands[0][1] === c) {
          return { row: nr, col: nc };
        }
      }
      nr += dr; nc += dc;
    }
  }
  return null;
}

/** All unknown cells in basic that could illuminate (r,c) including itself. */
function collectCandidatesInState(
  state: SolverState, r: number, c: number,
): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  if (state.cells[r][c].domain === 'unknown') result.push([r, c]);
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
    let nr = r + dr; let nc = c + dc;
    while (!isBlock(state, nr, nc)) {
      if (state.cells[nr][nc].domain === 'unknown') result.push([nr, nc]);
      nr += dr; nc += dc;
    }
  }
  return result;
}

function checkSegmentForHint(
  state: SolverState,
  segCells: Pos[],
  lineNum: number,
  direction: string,
): HintResult | null {
  const unknowns = segCells.filter(p => state.cells[p.row][p.col].domain === 'unknown');

  for (const u of unknowns) {
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
          let nr = p.row + dr; let nc = p.col + dc;
          while (!isBlock(state, nr, nc)) {
            const sc = state.cells[nr][nc];
            if (sc.domain === 'light' || sc.domain === 'unknown') { canBeIlluminated = true; break; }
            nr += dr; nc += dc;
          }
          if (canBeIlluminated) break;
        }
      }

      if (!canBeIlluminated) { createsUnilluminable = true; break; }
    }

    state.cells[u.row][u.col].domain = origDomain;

    if (createsUnilluminable) {
      return {
        found: true,
        focusCells: segCells,
        explanation: `${lineNum}${direction}目のマス群に注目してください。` +
          `すべてのマスが照らされるためには、明かりをどこに置くべきか考えてみましょう。`,
      };
    }
  }

  return null;
}
