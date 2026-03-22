import type { Board, AnswerResult, Pos } from '../types';
import { buildSolverState, propagate } from './propagation';

export function computeAnswer(board: Board): AnswerResult {
  const state = buildSolverState(board);
  propagate(state);

  const resolvedLights: Pos[] = [];
  const resolvedNoLights: Pos[] = [];
  let unknownCount = 0;

  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const sc = state.cells[r][c];
      const original = board.cells[r][c];

      if (sc.domain === 'light' && original.kind !== 'light') {
        resolvedLights.push({ row: r, col: c });
      }
      if (sc.domain === 'no-light' && !sc.fixed && original.kind !== 'no-light') {
        resolvedNoLights.push({ row: r, col: c });
      }
      if (sc.domain === 'unknown') {
        unknownCount++;
      }
    }
  }

  return {
    resolvedLights,
    resolvedNoLights,
    fullySolved: unknownCount === 0,
  };
}
