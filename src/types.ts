export type CellKind = 'empty' | 'light' | 'no-light' | 'block' | 'number';

export interface Cell {
  kind: CellKind;
  clue: number | null; // 0-4, only for 'number' cells
}

export interface Board {
  rows: number;
  cols: number;
  cells: Cell[][];
}

export interface Pos {
  row: number;
  col: number;
}

export type EditMode =
  | 'empty'
  | 'block'
  | 'light'
  | 'no-light'
  | 'number-0'
  | 'number-1'
  | 'number-2'
  | 'number-3'
  | 'number-4';

export type InconsistencyReason =
  | { type: 'lights-see-each-other'; positions: [Pos, Pos] }
  | { type: 'number-exceeded'; pos: Pos; clue: number; actual: number }
  | { type: 'number-impossible'; pos: Pos; clue: number; needed: number; available: number }
  | { type: 'cell-unilluminable'; pos: Pos }
  | { type: 'forced-no-light-violated'; pos: Pos };

export interface CheckResult {
  consistent: boolean;
  reasons: InconsistencyReason[];
  forcedLights: Pos[];
  forcedNoLights: Pos[];
}

export interface HintResult {
  found: boolean;
  focusCells: Pos[];
  explanation: string;
}

export interface AnswerResult {
  resolvedLights: Pos[];
  resolvedNoLights: Pos[];
  fullySolved: boolean;
}

// Internal solver state
export type Domain = 'light' | 'no-light' | 'unknown';

export interface SolverCell {
  domain: Domain;
  fixed: boolean; // true for block/number cells
  clue: number | null;
}

export interface SolverState {
  rows: number;
  cols: number;
  cells: SolverCell[][];
}

export interface AppState {
  board: Board;
  editMode: EditMode;
  checkResult: CheckResult | null;
  hintResult: HintResult | null;
  answerResult: AnswerResult | null;
}
