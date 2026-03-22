import type { Board, Pos } from '../types';
import { getState, editCell } from '../state/store';

export interface BoardOverlay {
  inconsistencyCells: Set<string>; // "r,c"
  hintCells: Set<string>;
  answerLights: Set<string>;
  answerNoLights: Set<string>;
  illuminated: Set<string>;
}

function posKey(pos: Pos): string {
  return `${pos.row},${pos.col}`;
}

/** Compute which cells are illuminated by currently placed lights */
function computeIlluminated(board: Board): Set<string> {
  const lit = new Set<string>();
  const { rows, cols, cells } = board;

  const isBlock = (r: number, c: number): boolean => {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return true;
    const k = cells[r][c].kind;
    return k === 'block' || k === 'number';
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c].kind === 'light') {
        lit.add(`${r},${c}`);
        // Spread in 4 directions
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          let nr = r + dr;
          let nc = c + dc;
          while (!isBlock(nr, nc)) {
            lit.add(`${nr},${nc}`);
            nr += dr;
            nc += dc;
          }
        }
      }
    }
  }
  return lit;
}

export function renderBoard(container: HTMLElement, overlay: BoardOverlay): void {
  const { board } = getState();
  const { rows, cols, cells } = board;
  const illuminated = computeIlluminated(board);

  container.innerHTML = '';
  container.style.setProperty('--cols', String(cols));
  container.style.setProperty('--rows', String(rows));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r][c];
      const key = `${r},${c}`;
      const div = document.createElement('div');
      div.className = 'cell';
      div.dataset.row = String(r);
      div.dataset.col = String(c);

      // Base cell type class
      div.classList.add(`cell--${cell.kind}`);

      // Illuminated overlay (only for empty/no-light cells)
      if ((cell.kind === 'empty' || cell.kind === 'no-light') && illuminated.has(key)) {
        div.classList.add('cell--illuminated');
      }

      // Solver overlays
      if (overlay.inconsistencyCells.has(key)) {
        div.classList.add('cell--inconsistent');
      }
      if (overlay.hintCells.has(key)) {
        div.classList.add('cell--hint');
      }
      if (overlay.answerLights.has(key)) {
        div.classList.add('cell--answer-light');
      }
      if (overlay.answerNoLights.has(key)) {
        div.classList.add('cell--answer-nolight');
      }

      // Content
      if (cell.kind === 'number') {
        div.textContent = String(cell.clue);
      } else if (cell.kind === 'light') {
        div.innerHTML = lightSvg();
      } else if (cell.kind === 'no-light') {
        div.innerHTML = noLightSvg();
      }

      div.addEventListener('click', () => {
        editCell(r, c);
      });

      container.appendChild(div);
    }
  }
}

function lightSvg(): string {
  return `<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="10" r="5" fill="#FFA500" stroke="#FF8C00" stroke-width="1"/>
    <rect x="9" y="15" width="6" height="2.5" rx="0.5" fill="#FF8C00"/>
    <rect x="10" y="17.5" width="4" height="1.5" rx="0.5" fill="#FF8C00"/>
    <line x1="12" y1="2" x2="12" y2="0" stroke="#FFA500" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="12" y1="22" x2="12" y2="24" stroke="#FFA500" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="2" y1="10" x2="0" y2="10" stroke="#FFA500" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="22" y1="10" x2="24" y2="10" stroke="#FFA500" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="4.9" y1="4.9" x2="3.5" y2="3.5" stroke="#FFA500" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="19.1" y1="15.1" x2="20.5" y2="16.5" stroke="#FFA500" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="19.1" y1="4.9" x2="20.5" y2="3.5" stroke="#FFA500" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="4.9" y1="15.1" x2="3.5" y2="16.5" stroke="#FFA500" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
}

function noLightSvg(): string {
  return `<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
    <line x1="4" y1="4" x2="20" y2="20" stroke="#999" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="20" y1="4" x2="4" y2="20" stroke="#999" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`;
}

export function emptyOverlay(): BoardOverlay {
  return {
    inconsistencyCells: new Set(),
    hintCells: new Set(),
    answerLights: new Set(),
    answerNoLights: new Set(),
    illuminated: new Set(),
  };
}

export function buildOverlay(
  inconsistencyPositions: Pos[],
  hintPositions: Pos[],
  answerLightPositions: Pos[],
  answerNoLightPositions: Pos[],
): BoardOverlay {
  return {
    inconsistencyCells: new Set(inconsistencyPositions.map(posKey)),
    hintCells: new Set(hintPositions.map(posKey)),
    answerLights: new Set(answerLightPositions.map(posKey)),
    answerNoLights: new Set(answerNoLightPositions.map(posKey)),
    illuminated: new Set(),
  };
}
