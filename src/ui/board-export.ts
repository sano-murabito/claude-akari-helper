import type { Board, Cell } from '../types';

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

export function textToBoard(text: string): Board | null {
  const lines = text.split('\n');
  const gridLinePattern = /^[.*x#01234]+$/;

  // Find all contiguous blocks of grid lines and pick the largest
  let bestBlock: string[] = [];
  let currentBlock: string[] = [];
  for (const line of lines) {
    if (gridLinePattern.test(line)) {
      currentBlock.push(line);
    } else {
      if (currentBlock.length > bestBlock.length) bestBlock = currentBlock;
      currentBlock = [];
    }
  }
  if (currentBlock.length > bestBlock.length) bestBlock = currentBlock;

  const gridLines = bestBlock;
  if (gridLines.length < 2) return null;

  const cols = gridLines[0].length;
  if (cols < 2 || !gridLines.every(l => l.length === cols)) return null;

  const rows = gridLines.length;
  if (rows > 20 || cols > 20) return null;

  const cells: Cell[][] = gridLines.map(line =>
    line.split('').map(ch => {
      if (ch === '.') return { kind: 'empty', clue: null };
      if (ch === '*') return { kind: 'light', clue: null };
      if (ch === 'x') return { kind: 'no-light', clue: null };
      if (ch === '#') return { kind: 'block', clue: null };
      const n = parseInt(ch, 10);
      return { kind: 'number', clue: n };
    })
  );

  return { rows, cols, cells };
}

export function generateImagePromptText(): string {
  return `以下の美術館パズル（Akari / Light Up）の盤面画像を読み取り、テキスト形式に変換してください。

【出力形式】
各行を1行のテキストとして出力し、以下の記号を使用してください：
  .  （ドット）   : 白マス（空のマス）
  #  （シャープ） : 数字なし黒マス
  0〜4（数字）    : 数字付き黒マス（その数字をそのまま記入）

出力は盤面グリッドのみとし、余計な説明文は含めないでください。
全ての行が同じ文字数になるようにしてください。

【出力例（5×5の場合）】
..2..
.#.#.
.....
.#.#.
..2..

上記の形式で、画像の盤面をテキストに変換してください。`;
}

export async function copyImagePromptToClipboard(): Promise<void> {
  const text = generateImagePromptText();
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  } else {
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
