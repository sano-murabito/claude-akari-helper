import type { Board } from '../types';

const CELL_CHAR: Record<string, string> = {
  empty: '.',
  light: '*',
  'no-light': 'x',
  block: '#',
};

export function boardToText(board: Board): string {
  const grid = board.cells
    .map(row =>
      row
        .map(cell => {
          if (cell.kind === 'number' && cell.clue !== null) {
            return String(cell.clue);
          }
          return CELL_CHAR[cell.kind] ?? '.';
        })
        .join('')
    )
    .join('\n');

  const lightCount = board.cells
    .flat()
    .filter(cell => cell.kind === 'light').length;

  return [
    `美術館パズル ${board.rows}×${board.cols}`,
    '',
    '盤面 (記号: . 空, * ライト, x ライトなし, # ブロック, 0-4 数字ヒント):',
    grid,
    '',
    `ライト配置数: ${lightCount}`,
  ].join('\n');
}

export async function copyBoardToClipboard(board: Board): Promise<void> {
  const text = boardToText(board);
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  } else {
    // Fallback for environments without Clipboard API
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}
