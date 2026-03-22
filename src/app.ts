import { getState, subscribe } from './state/store';
import { renderBoard, buildOverlay, emptyOverlay } from './ui/board';
import { renderToolbar } from './ui/toolbar';
import { renderControls } from './ui/controls';
import type { Pos } from './types';

export function initApp(root: HTMLElement): void {
  root.innerHTML = `
    <header class="app-header">
      <h1 class="app-title">美術館パズル ソルバー</h1>
      <p class="app-subtitle">盤面を作成してアクションを選んでください</p>
    </header>
    <main class="app-main">
      <div class="app-toolbar" id="toolbar"></div>
      <div class="app-board-wrap">
        <div class="app-board" id="board"></div>
      </div>
      <div class="app-controls" id="controls"></div>
    </main>
    <footer class="app-footer">
      <p>ルール: すべての白マスを明かりで照らす。明かり同士は互いに見えてはいけない。数字マスは隣接する明かりの数を示す。</p>
    </footer>
  `;

  const toolbarEl = root.querySelector<HTMLElement>('#toolbar')!;
  const boardEl = root.querySelector<HTMLElement>('#board')!;
  const controlsEl = root.querySelector<HTMLElement>('#controls')!;

  function render(): void {
    const state = getState();

    // Build overlay from solver results
    let overlay = emptyOverlay();
    const inconsistencyPositions: Pos[] = [];
    const hintPositions: Pos[] = [];
    const answerLightPositions: Pos[] = [];
    const answerNoLightPositions: Pos[] = [];

    if (state.checkResult) {
      for (const reason of state.checkResult.reasons) {
        if (reason.type === 'lights-see-each-other') {
          inconsistencyPositions.push(reason.positions[0]);
          inconsistencyPositions.push(reason.positions[1]);
        } else if (
          reason.type === 'number-exceeded' ||
          reason.type === 'number-impossible'
        ) {
          inconsistencyPositions.push(reason.pos);
        } else if (reason.type === 'cell-unilluminable') {
          inconsistencyPositions.push(reason.pos);
        } else if (reason.type === 'forced-no-light-violated') {
          inconsistencyPositions.push(reason.pos);
        }
      }
    }

    if (state.hintResult?.found) {
      hintPositions.push(...state.hintResult.focusCells);
    }

    if (state.answerResult) {
      answerLightPositions.push(...state.answerResult.resolvedLights);
      answerNoLightPositions.push(...state.answerResult.resolvedNoLights);
    }

    overlay = buildOverlay(
      inconsistencyPositions,
      hintPositions,
      answerLightPositions,
      answerNoLightPositions,
    );

    renderToolbar(toolbarEl, render);
    renderBoard(boardEl, overlay);
    renderControls(controlsEl, render);
  }

  subscribe(render);
  render();
}
