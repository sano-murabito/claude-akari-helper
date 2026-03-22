import type { CheckResult, HintResult, AnswerResult, InconsistencyReason } from '../types';
import { getState, setState } from '../state/store';
import { checkInconsistency } from '../solver/constraints';
import { computeHint } from '../solver/hint';
import { computeAnswer } from '../solver/index';

export function renderControls(
  container: HTMLElement,
  onUpdate: () => void,
): void {
  container.innerHTML = '';

  const btnRow = document.createElement('div');
  btnRow.className = 'controls__buttons';

  // Inconsistency Check
  const checkBtn = document.createElement('button');
  checkBtn.className = 'controls__btn controls__btn--check';
  checkBtn.textContent = '不整合チェック';
  checkBtn.title = '問題の矛盾点と論理的に確定できる箇所を確認';
  checkBtn.addEventListener('click', () => {
    const result = checkInconsistency(getState().board);
    setState({ checkResult: result, hintResult: null, answerResult: null });
    onUpdate();
  });
  btnRow.appendChild(checkBtn);

  // Hint
  const hintBtn = document.createElement('button');
  hintBtn.className = 'controls__btn controls__btn--hint';
  hintBtn.textContent = 'ヒント';
  hintBtn.title = '次の手がかりを示すマスをハイライト';
  hintBtn.addEventListener('click', () => {
    const result = computeHint(getState().board);
    setState({ hintResult: result, checkResult: null, answerResult: null });
    onUpdate();
  });
  btnRow.appendChild(hintBtn);

  // Show Answer
  const answerBtn = document.createElement('button');
  answerBtn.className = 'controls__btn controls__btn--answer';
  answerBtn.textContent = '答え表示';
  answerBtn.title = '論理的に確定できる全マスを表示';
  answerBtn.addEventListener('click', () => {
    const result = computeAnswer(getState().board);
    setState({ answerResult: result, checkResult: null, hintResult: null });
    onUpdate();
  });
  btnRow.appendChild(answerBtn);

  container.appendChild(btnRow);

  // Result panel
  const resultPanel = document.createElement('div');
  resultPanel.className = 'controls__result';
  const { checkResult, hintResult, answerResult } = getState();

  if (checkResult) {
    resultPanel.appendChild(renderCheckResult(checkResult));
  } else if (hintResult) {
    resultPanel.appendChild(renderHintResult(hintResult));
  } else if (answerResult) {
    resultPanel.appendChild(renderAnswerResult(answerResult));
  }

  container.appendChild(resultPanel);
}

function renderCheckResult(result: CheckResult): HTMLElement {
  const div = document.createElement('div');
  div.className = 'result result--check';

  const title = document.createElement('h3');
  title.className = 'result__title';
  if (result.consistent) {
    title.textContent = '✓ 整合性あり';
    title.classList.add('result__title--ok');
  } else {
    title.textContent = `✗ 矛盾あり（${result.reasons.length}件）`;
    title.classList.add('result__title--error');
  }
  div.appendChild(title);

  if (result.reasons.length > 0) {
    const ul = document.createElement('ul');
    ul.className = 'result__list';
    for (const reason of result.reasons) {
      const li = document.createElement('li');
      li.textContent = formatReason(reason);
      li.className = 'result__item result__item--error';
      ul.appendChild(li);
    }
    div.appendChild(ul);
  }

  if (result.consistent) {
    if (result.forcedLights.length > 0 || result.forcedNoLights.length > 0) {
      const note = document.createElement('p');
      note.className = 'result__note';
      const parts: string[] = [];
      if (result.forcedLights.length > 0) {
        parts.push(`論理的に確定できる明かりが ${result.forcedLights.length} 箇所あります`);
      }
      if (result.forcedNoLights.length > 0) {
        parts.push(`明かりなし確定が ${result.forcedNoLights.length} 箇所あります`);
      }
      note.textContent = parts.join('、') + '。';
      div.appendChild(note);
    } else {
      const note = document.createElement('p');
      note.className = 'result__note';
      note.textContent = '矛盾はなく、設置済みの明かりは論理的に確定できる位置にあります。';
      div.appendChild(note);
    }
  }

  return div;
}

function renderHintResult(result: HintResult): HTMLElement {
  const div = document.createElement('div');
  div.className = 'result result--hint';

  const title = document.createElement('h3');
  title.className = 'result__title';
  title.textContent = result.found ? '💡 ヒント' : '❓ ヒントなし';
  div.appendChild(title);

  const p = document.createElement('p');
  p.className = 'result__text';
  p.textContent = result.explanation;
  div.appendChild(p);

  return div;
}

function renderAnswerResult(result: AnswerResult): HTMLElement {
  const div = document.createElement('div');
  div.className = 'result result--answer';

  const title = document.createElement('h3');
  title.className = 'result__title';
  if (result.fullySolved) {
    title.textContent = '🎉 完全解答';
    title.classList.add('result__title--ok');
  } else {
    title.textContent = '📋 確定箇所';
  }
  div.appendChild(title);

  if (result.resolvedLights.length === 0 && result.resolvedNoLights.length === 0) {
    const p = document.createElement('p');
    p.className = 'result__text';
    p.textContent = 'これ以上論理的に確定できる箇所はありません。';
    div.appendChild(p);
  } else {
    const p = document.createElement('p');
    p.className = 'result__text';
    const parts: string[] = [];
    if (result.resolvedLights.length > 0) {
      parts.push(`明かりが確定 ${result.resolvedLights.length} 箇所（緑色で表示）`);
    }
    if (result.resolvedNoLights.length > 0) {
      parts.push(`明かりなし確定 ${result.resolvedNoLights.length} 箇所（緑の✕で表示）`);
    }
    p.textContent = parts.join('、') + '。';
    div.appendChild(p);

    if (result.fullySolved) {
      const note = document.createElement('p');
      note.className = 'result__note result__note--ok';
      note.textContent = 'このパズルは論理のみで完全に解けます！';
      div.appendChild(note);
    }
  }

  return div;
}

function formatReason(reason: InconsistencyReason): string {
  switch (reason.type) {
    case 'lights-see-each-other':
      return `(${reason.positions[0].row+1},${reason.positions[0].col+1}) と (${reason.positions[1].row+1},${reason.positions[1].col+1}) の明かりが互いに見えています`;
    case 'number-exceeded':
      return `(${reason.pos.row+1},${reason.pos.col+1}) の数字「${reason.clue}」に対して隣接する明かりが${reason.actual}個あります`;
    case 'number-impossible':
      return `(${reason.pos.row+1},${reason.pos.col+1}) の数字「${reason.clue}」をあと${reason.needed}個必要ですが、置ける場所が${reason.available}箇所しかありません`;
    case 'cell-unilluminable':
      return `(${reason.pos.row+1},${reason.pos.col+1}) のマスをどの明かりも照らせません`;
    case 'forced-no-light-violated':
      return `(${reason.pos.row+1},${reason.pos.col+1}) には論理的に明かりを置けないはずです`;
  }
}
