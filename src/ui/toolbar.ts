import type { EditMode } from '../types';
import { getState, setEditMode, resizeBoard, setState } from '../state/store';
import { namedSave, listNamedSaves, deleteNamedSave, loadAutoSave } from '../storage';
import { copyBoardToClipboard, copyImagePromptToClipboard, textToBoard } from './board-export';

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

  // Save management section
  const saveSection = document.createElement('div');
  saveSection.className = 'toolbar__save';

  const saveLabel = document.createElement('span');
  saveLabel.className = 'toolbar__label';
  saveLabel.textContent = '保存:';
  saveSection.appendChild(saveLabel);

  // Named save button
  const saveBtn = document.createElement('button');
  saveBtn.className = 'toolbar__save-btn';
  saveBtn.textContent = '名前を付けて保存';
  saveBtn.addEventListener('click', () => {
    const name = prompt('保存名を入力してください:');
    if (name && name.trim()) {
      namedSave(name.trim(), getState().board);
      onUpdate();
    }
  });
  saveSection.appendChild(saveBtn);

  // Named saves dropdown + load/delete
  const saves = listNamedSaves();

  const select = document.createElement('select');
  select.className = 'toolbar__load-select';
  if (saves.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '（保存なし）';
    select.appendChild(opt);
    select.disabled = true;
  } else {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '保存済みを選択…';
    select.appendChild(placeholder);
    for (const s of saves) {
      const opt = document.createElement('option');
      opt.value = s.name;
      const date = new Date(s.savedAt).toLocaleString('ja-JP', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      });
      opt.textContent = `${s.name}（${date}）`;
      select.appendChild(opt);
    }
  }
  saveSection.appendChild(select);

  const loadBtn = document.createElement('button');
  loadBtn.className = 'toolbar__load-btn';
  loadBtn.textContent = '読み込み';
  loadBtn.addEventListener('click', () => {
    const name = select.value;
    if (!name) return;
    const found = listNamedSaves().find(s => s.name === name);
    if (found) {
      setState({ board: found.board, checkResult: null, hintResult: null, answerResult: null });
      onUpdate();
    }
  });
  saveSection.appendChild(loadBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'toolbar__delete-btn';
  deleteBtn.textContent = '削除';
  deleteBtn.addEventListener('click', () => {
    const name = select.value;
    if (!name) return;
    if (confirm(`「${name}」を削除しますか？`)) {
      deleteNamedSave(name);
      onUpdate();
    }
  });
  saveSection.appendChild(deleteBtn);

  // Copy board text to clipboard button
  const copyBtn = document.createElement('button');
  copyBtn.className = 'toolbar__copy-btn';
  copyBtn.textContent = '盤面をコピー';
  copyBtn.title = '盤面情報をテキストとしてクリップボードにコピーします';
  copyBtn.addEventListener('click', () => {
    copyBoardToClipboard(getState().board).then(() => {
      copyBtn.textContent = 'コピーしました！';
      setTimeout(() => { copyBtn.textContent = '盤面をコピー'; }, 1500);
    }).catch(() => {
      copyBtn.textContent = 'コピー失敗';
      setTimeout(() => { copyBtn.textContent = '盤面をコピー'; }, 1500);
    });
  });
  saveSection.appendChild(copyBtn);

  // Copy image prompt to clipboard button
  const promptBtn = document.createElement('button');
  promptBtn.className = 'toolbar__copy-btn';
  promptBtn.textContent = '画像取り込みプロンプトをコピー';
  promptBtn.title = '外部AIサービスで盤面画像をテキスト化するためのプロンプトをクリップボードにコピーします';
  promptBtn.addEventListener('click', () => {
    copyImagePromptToClipboard().then(() => {
      promptBtn.textContent = 'コピーしました！';
      setTimeout(() => { promptBtn.textContent = '画像取り込みプロンプトをコピー'; }, 1500);
    }).catch(() => {
      promptBtn.textContent = 'コピー失敗';
      setTimeout(() => { promptBtn.textContent = '画像取り込みプロンプトをコピー'; }, 1500);
    });
  });
  saveSection.appendChild(promptBtn);

  // Import board from text button
  const importBtn = document.createElement('button');
  importBtn.className = 'toolbar__import-btn';
  importBtn.textContent = 'テキストから読み込み';
  importBtn.title = 'テキスト形式の盤面を貼り付けて読み込みます';

  const importArea = document.createElement('div');
  importArea.className = 'toolbar__import-area';
  importArea.style.display = 'none';

  const textarea = document.createElement('textarea');
  textarea.rows = 10;
  textarea.cols = 40;
  textarea.placeholder = '盤面テキストを貼り付けてください…';
  textarea.className = 'toolbar__import-textarea';
  importArea.appendChild(textarea);

  const importErrorMsg = document.createElement('span');
  importErrorMsg.className = 'toolbar__import-error';
  importErrorMsg.style.color = 'red';
  importErrorMsg.style.display = 'none';
  importArea.appendChild(importErrorMsg);

  const importApplyBtn = document.createElement('button');
  importApplyBtn.textContent = '適用';
  importApplyBtn.className = 'toolbar__apply-btn';
  importApplyBtn.addEventListener('click', () => {
    const parsed = textToBoard(textarea.value);
    if (!parsed) {
      importErrorMsg.textContent = '盤面の読み込みに失敗しました。形式を確認してください。';
      importErrorMsg.style.display = '';
      return;
    }
    const hasContent = getState().board.cells.some(row =>
      row.some(cell => cell.kind !== 'empty')
    );
    if (!hasContent || confirm('現在の盤面を上書きしますか？')) {
      setState({ board: parsed, checkResult: null, hintResult: null, answerResult: null });
      importArea.style.display = 'none';
      textarea.value = '';
      importErrorMsg.style.display = 'none';
      onUpdate();
    }
  });
  importArea.appendChild(importApplyBtn);

  const importCancelBtn = document.createElement('button');
  importCancelBtn.textContent = 'キャンセル';
  importCancelBtn.className = 'toolbar__load-btn';
  importCancelBtn.addEventListener('click', () => {
    importArea.style.display = 'none';
    textarea.value = '';
    importErrorMsg.style.display = 'none';
  });
  importArea.appendChild(importCancelBtn);

  importBtn.addEventListener('click', () => {
    importArea.style.display = importArea.style.display === 'none' ? '' : 'none';
  });

  saveSection.appendChild(importBtn);
  saveSection.appendChild(importArea);

  // Auto-save timestamp
  const autoSaveData = loadAutoSave();
  if (autoSaveData) {
    const autoLabel = document.createElement('span');
    autoLabel.className = 'toolbar__autosave-label';
    const date = new Date(autoSaveData.savedAt).toLocaleString('ja-JP', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    autoLabel.textContent = `自動保存: ${date}`;
    saveSection.appendChild(autoLabel);
  }

  container.appendChild(saveSection);
}
