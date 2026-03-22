import type { AppState, Board, Cell, EditMode } from '../types';
import { autoSave, loadAutoSave } from '../storage';

function createEmptyBoard(rows: number, cols: number): Board {
  const cells: Cell[][] = [];
  for (let r = 0; r < rows; r++) {
    cells.push([]);
    for (let c = 0; c < cols; c++) {
      cells[r].push({ kind: 'empty', clue: null });
    }
  }
  return { rows, cols, cells };
}

const savedData = loadAutoSave();
const initialState: AppState = {
  board: savedData?.board ?? createEmptyBoard(5, 5),
  editMode: 'light',
  checkResult: null,
  hintResult: null,
  answerResult: null,
};

let state: AppState = { ...initialState };
const subscribers: Array<(state: AppState) => void> = [];

export function getState(): AppState {
  return state;
}

export function setState(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  if (patch.board) autoSave(state.board);
  subscribers.forEach(fn => fn(state));
}

export function subscribe(fn: (state: AppState) => void): () => void {
  subscribers.push(fn);
  return () => {
    const idx = subscribers.indexOf(fn);
    if (idx !== -1) subscribers.splice(idx, 1);
  };
}

export function setEditMode(mode: EditMode): void {
  setState({ editMode: mode });
}

/** Apply a cell edit and clear solver results */
export function editCell(row: number, col: number): void {
  const { board, editMode } = state;
  const cells = board.cells.map(r => r.map(c => ({ ...c })));
  const cell = cells[row][col];

  switch (editMode) {
    case 'empty':
      cells[row][col] = { kind: 'empty', clue: null };
      break;
    case 'block':
      if (cell.kind === 'block') {
        cells[row][col] = { kind: 'empty', clue: null };
      } else {
        cells[row][col] = { kind: 'block', clue: null };
      }
      break;
    case 'light':
      if (cell.kind === 'light') {
        cells[row][col] = { kind: 'empty', clue: null };
      } else if (cell.kind === 'empty' || cell.kind === 'no-light') {
        cells[row][col] = { kind: 'light', clue: null };
      }
      break;
    case 'no-light':
      if (cell.kind === 'no-light') {
        cells[row][col] = { kind: 'empty', clue: null };
      } else if (cell.kind === 'empty' || cell.kind === 'light') {
        cells[row][col] = { kind: 'no-light', clue: null };
      }
      break;
    case 'number-0':
    case 'number-1':
    case 'number-2':
    case 'number-3':
    case 'number-4': {
      const clue = parseInt(editMode.split('-')[1], 10);
      if (cell.kind === 'number' && cell.clue === clue) {
        cells[row][col] = { kind: 'empty', clue: null };
      } else {
        cells[row][col] = { kind: 'number', clue };
      }
      break;
    }
  }

  setState({
    board: { ...board, cells },
    checkResult: null,
    hintResult: null,
    answerResult: null,
  });
}

export function resizeBoard(rows: number, cols: number): void {
  setState({
    board: createEmptyBoard(rows, cols),
    checkResult: null,
    hintResult: null,
    answerResult: null,
  });
}
