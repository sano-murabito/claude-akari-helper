import type { EditMode } from '../types';
import { getState, setEditMode, resizeBoard } from '../state/store';

const TOOLS: Array<{ mode: EditMode; label: string; title: string }> = [
  { mode: 'empty', label: '消去', title: 'マスを空白にする' },
  { mode: 'block', label: '■', title: '黒マス（数字なし）' },
  { mode: 'number-0', label: '0', title: '数字マス 0' },
  { mode: 'number-1', label: '1', title: '数字マス 1' },
  { mode: 'number-2', label: '2', title: '数字マス 2' },
  { mode: 'number-3', label: '3', title: '数字マス 3' },
  { mode: 'number-4', label: '4', title: '数字マス 4' },
  { mode: 'light', label: '💡', title: '明かりを置く' },
  { mode: 'no-light', label: '✕', title: '明かりなし確定マス' },
];

export function renderToolbar(container: HTMLElement, onUpdate: () => void): void {
  container.innerHTML = '';

  const { editMode, board } = getState();

  // Tool buttons section
  const toolSection = document.createElement('div');
  toolSection.className = 'toolbar__tools';

  const toolLabel = document.createElement('span');
  toolLabel.className = 'toolbar__label';
  toolLabel.textContent = 'ツール:';
  toolSection.appendChild(toolLabel);

  for (const tool of TOOLS) {
    const btn = document.createElement('button');
    btn.className = 'toolbar__tool-btn';
    btn.textContent = tool.label;
    btn.title = tool.title;
    if (tool.mode === editMode) {
      btn.classList.add('toolbar__tool-btn--active');
    }
    btn.addEventListener('click', () => {
      setEditMode(tool.mode);
      onUpdate();
    });
    toolSection.appendChild(btn);
  }

  container.appendChild(toolSection);

  // Size section
  const sizeSection = document.createElement('div');
  sizeSection.className = 'toolbar__size';

  const sizeLabel = document.createElement('span');
  sizeLabel.className = 'toolbar__label';
  sizeLabel.textContent = 'サイズ:';
  sizeSection.appendChild(sizeLabel);

  const rowsInput = document.createElement('input');
  rowsInput.type = 'number';
  rowsInput.min = '2';
  rowsInput.max = '20';
  rowsInput.value = String(board.rows);
  rowsInput.className = 'toolbar__size-input';
  rowsInput.title = '行数';
  sizeSection.appendChild(rowsInput);

  const timesSpan = document.createElement('span');
  timesSpan.textContent = '×';
  timesSpan.className = 'toolbar__times';
  sizeSection.appendChild(timesSpan);

  const colsInput = document.createElement('input');
  colsInput.type = 'number';
  colsInput.min = '2';
  colsInput.max = '20';
  colsInput.value = String(board.cols);
  colsInput.className = 'toolbar__size-input';
  colsInput.title = '列数';
  sizeSection.appendChild(colsInput);

  const applyBtn = document.createElement('button');
  applyBtn.textContent = '適用';
  applyBtn.className = 'toolbar__apply-btn';
  applyBtn.addEventListener('click', () => {
    const r = parseInt(rowsInput.value, 10);
    const c = parseInt(colsInput.value, 10);
    if (r >= 2 && r <= 20 && c >= 2 && c <= 20) {
      const hasContent = getState().board.cells.some(row =>
        row.some(cell => cell.kind !== 'empty')
      );
      if (!hasContent || confirm('盤面をリセットしますか？現在の内容は失われます。')) {
        resizeBoard(r, c);
        onUpdate();
      }
    }
  });
  sizeSection.appendChild(applyBtn);

  container.appendChild(sizeSection);
}
