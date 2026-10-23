// 预设文本查找替换面板：多行条件、范围选择、逐处差异预览与分页；仅通过回调更新编辑器草稿。
import {createReplacementPlan} from '../text-replace.js';

const PAGE_SIZE = 50;
let panelSequence = 0;

function node(tag, className = '', text) {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function button(text, attribute, action) {
  const element = node('button', 'menu_button pcm-replace-button', text);
  element.type = 'button';
  element.setAttribute(attribute, '');
  element.addEventListener('click', action);
  return element;
}
function field(label, control) {
  const element = node('label', 'pcm-replace-field');
  element.append(node('span', '', label), control);
  return element;
}
function checkbox(label, attribute, checked) {
  const control = node('input');
  control.type = 'checkbox';
  control.checked = checked;
  control.setAttribute(attribute, '');
  const element = node('label', 'pcm-replace-check');
  element.append(control, document.createTextNode(label));
  return {element, control};
}
function entryId(entry) { return String(entry.identifier); }
function ids(values) { return new Set(Array.from(values || [], String)); }

/** getContext returns current drafts; onApply must revalidate the preview before committing. */
export function createTextReplacePanel({title, initialQuery = '', initialScope = 'all', getContext, onApply, onClose, onLocate}) {
  const element = node('section', 'pcm-replace-panel');
  element.dataset.replacePanel = '';
  element.setAttribute('role', 'region');
  const heading = node('h3', '', '查找替换 · ' + title);
  heading.id = 'pcm-replace-heading-' + (++panelSequence);
  element.setAttribute('aria-labelledby', heading.id);
  const header = node('header', 'pcm-replace-head');
  const closeButton = button('×', 'data-replace-close', close);
  closeButton.title = '关闭查找替换';
  closeButton.setAttribute('aria-label', '关闭查找替换');
  header.append(heading, closeButton);
  const body = node('div', 'pcm-replace-body');
  element.append(header, body);

  const query = node('textarea');
  query.rows = 2;
  query.value = initialQuery;
  query.spellcheck = false;
  query.dataset.replaceQuery = '';
  query.setAttribute('aria-label', '查找文本');
  query.placeholder = '支持多行，保留空格和换行';
  const replacement = node('textarea');
  replacement.rows = 2;
  replacement.spellcheck = false;
  replacement.dataset.replaceReplacement = '';
  replacement.setAttribute('aria-label', '替换为');
  replacement.placeholder = '留空表示删除匹配文本';
  const textFields = node('div', 'pcm-replace-text-fields');
  textFields.append(field('查找文本', query), field('替换为', replacement));

  const scope = node('select');
  scope.dataset.replaceScope = '';
  scope.setAttribute('aria-label', '修改范围');
  const scopeField = field('修改范围', scope);
  const options = node('div', 'pcm-replace-options');
  const contentOption = checkbox('正文', 'data-replace-content', true);
  const nameOption = checkbox('条目名称', 'data-replace-name', false);
  const caseOption = checkbox('区分大小写', 'data-replace-case', true);
  options.append(contentOption.element, nameOption.element, caseOption.element);
  const scopeNote = node('p', 'pcm-replace-note');
  scopeNote.dataset.replaceScopeNote = '';
  const previewButton = button('预览替换', 'data-replace-preview', preview);
  const formActions = node('div', 'pcm-replace-actions');
  formActions.append(previewButton, node('span', 'pcm-replace-note', '普通文本匹配；不修改 ID、开关与排序。'));
  const status = node('p', 'pcm-replace-status');
  status.dataset.replaceStatus = '';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const results = node('div', 'pcm-replace-results');
  results.dataset.replaceResults = '';
  body.append(textFields, scopeField, options, scopeNote, formActions, status, results);

  let disposed = false, busy = false, plan = null, contextAtPreview = null, selectedKeys = new Set(), page = 0;
  let counts = null, applyButton = null, nextButton = null, previousButton = null;
  let context = null;
  const controls = [query, replacement, scope, contentOption.control, nameOption.control, caseOption.control];
  for (const control of controls) control.addEventListener(control.tagName === 'TEXTAREA' ? 'input' : 'change', invalidate);
  element.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
  });

  function close() { if (!busy && !disposed) onClose?.(); }
  function report(message, error = false) {
    status.textContent = message;
    status.classList.toggle('pcm-replace-error', error);
  }
  function resetPreview() {
    plan = null;
    contextAtPreview = null;
    selectedKeys.clear();
    page = 0;
    counts = applyButton = nextButton = previousButton = null;
    results.replaceChildren();
  }
  function invalidate() {
    if (disposed || busy) return;
    const hadPreview = !!plan;
    resetPreview();
    report(hadPreview ? '条件已变更，请重新预览。' : '');
    updateScopeNote();
  }
  function syncScopes(currentContext, requested = scope.value) {
    const choices = [
      ['current', '当前条目'], ['selected', '已选条目'],
      ['filtered', '当前筛选结果'], ['all', '当前侧全部条目'],
      ...(currentContext.groups || []).map(group => ['group:' + group.id, '分组 · ' + (group.name || '未命名分组')]),
    ];
    scope.replaceChildren();
    for (const [value, label] of choices) {
      const option = node('option', '', label);
      option.value = value;
      scope.append(option);
    }
    // A disappeared group must not silently widen an already selected scope.
    if (requested && !choices.some(([value]) => value === requested)) {
      const option = node('option', '', '原范围已失效，请重新选择');
      option.value = requested;
      option.disabled = true;
      scope.append(option);
    }
    scope.value = requested || 'all';
  }
  function scopedEntries(currentContext) {
    const entries = currentContext.entries || [];
    let accepted;
    switch (scope.value) {
      case 'all': return entries;
      case 'current': accepted = ids(currentContext.currentId == null ? [] : [currentContext.currentId]); break;
      case 'selected': accepted = ids(currentContext.selectedIds); break;
      case 'filtered': accepted = ids(currentContext.filteredIds); break;
      default: {
        const group = (currentContext.groups || []).find(item => 'group:' + item.id === scope.value);
        if (!group) throw new Error('原分组已不存在，请重新选择修改范围。');
        accepted = ids(group.ids);
      }
    }
    return entries.filter(entry => accepted.has(entryId(entry)));
  }
  function updateScopeNote() {
    const all = scope.value === 'all';
    scopeNote.textContent = all
      ? '当前侧全部：包含停用、折叠及未注入条目。只更新当前侧编辑器草稿。'
      : '只处理所选范围；范围内的停用、折叠及未注入条目也会参与。筛选范围以搜索与筛选条件为准。';
  }
  function preview() {
    if (busy || disposed) return;
    resetPreview();
    try {
      context = getContext();
      syncScopes(context);
      updateScopeNote();
      const entries = scopedEntries(context);
      const fields = [];
      if (contentOption.control.checked) fields.push('content');
      if (nameOption.control.checked) fields.push('name');
      if (!fields.length) throw new Error('请至少选择正文或条目名称。');
      if (!query.value.length) throw new Error('请输入查找文本；空格和换行也可以作为查找内容。');
      if (!entries.length) throw new Error('当前范围没有可处理的条目，请选择条目或更换范围。');
      plan = createReplacementPlan(entries, {query: query.value, replacement: replacement.value, caseSensitive: caseOption.control.checked, fields});
      contextAtPreview = {...context, replaceScope: scope.value, replaceIds: entries.map(entryId)};
      selectedKeys = new Set(plan.matches.map(match => match.key));
      report(plan.matches.length ? '请核对修改前后内容；“全选”与批量替换包含所有页。' : '没有需要替换的匹配；替换前后相同的内容会自动跳过。');
      renderResults();
    } catch (error) { resetPreview(); report(error.message || String(error), true); }
  }
  function updateCounts() {
    if (!plan || !counts) return;
    const selectedEntries = new Set(plan.matches.filter(match => selectedKeys.has(match.key)).map(match => match.id));
    counts.textContent = '找到 ' + plan.entryCount + ' 个条目，共 ' + plan.matches.length + ' 处；已选 ' + selectedEntries.size + ' 个条目，' + selectedKeys.size + ' 处（全部页）。';
    if (applyButton) applyButton.disabled = busy || selectedKeys.size === 0;
  }
  function selectAll(selected) {
    if (busy || !plan) return;
    selectedKeys = selected ? new Set(plan.matches.map(match => match.key)) : new Set();
    for (const checkbox of results.querySelectorAll('[data-replace-match]')) checkbox.checked = selectedKeys.has(checkbox.value);
    updateCounts();
  }
  function renderResults() {
    results.replaceChildren();
    if (!plan?.matches.length) return;
    counts = node('p', 'pcm-replace-count');
    counts.dataset.replaceCount = '';
    const selectionActions = node('div', 'pcm-replace-actions');
    applyButton = button('替换勾选结果', 'data-replace-apply', () => void apply([...selectedKeys]));
    selectionActions.append(
      button('全选全部结果', 'data-replace-select-all', () => selectAll(true)),
      button('全部取消', 'data-replace-select-none', () => selectAll(false)), applyButton,
    );
    results.append(counts, selectionActions);
    updateCounts();
    const first = page * PAGE_SIZE, matches = plan.matches.slice(first, first + PAGE_SIZE);
    const paging = node('div', 'pcm-replace-paging');
    previousButton = button('上一页', 'data-replace-previous', () => { page--; renderResults(); });
    nextButton = button('下一页', 'data-replace-next', () => { page++; renderResults(); });
    previousButton.disabled = page === 0;
    nextButton.disabled = first + PAGE_SIZE >= plan.matches.length;
    const pageText = node('span', '', '第 ' + (page + 1) + '/' + Math.ceil(plan.matches.length / PAGE_SIZE) + ' 页 · ' + (first + 1) + '–' + (first + matches.length) + ' 处');
    pageText.dataset.replacePage = '';
    paging.append(previousButton, pageText, nextButton);
    results.append(paging);
    const grouped = new Map();
    for (const match of matches) {
      if (!grouped.has(match.id)) grouped.set(match.id, []);
      grouped.get(match.id).push(match);
    }
    const names = new Map(contextAtPreview.entries.map(entry => [entryId(entry), String(entry.name || '未命名条目')]));
    const baselineTexts = new Map(plan.baselines.map(item => [JSON.stringify([item.id, item.field]), item.text]));
    for (const [id, entryMatches] of grouped) {
      const card = node('details', 'pcm-replace-entry');
      card.dataset.replaceEntry = id;
      card.open = grouped.size === 1;
      card.append(node('summary', '', (names.get(String(id)) || '未命名条目') + ' · 本页 ' + entryMatches.length + ' 处'));
      // Only the current page creates match nodes, including when a large entry spans pages.
      for (const match of entryMatches) card.append(matchRow(match, baselineTexts.get(JSON.stringify([match.id, match.field])) || ''));
      results.append(card);
    }
  }
  function matchRow(match, beforeText) {
    const row = node('div', 'pcm-replace-match');
    const toolbar = node('div', 'pcm-replace-match-tools');
    const choice = checkbox((match.field === 'name' ? '名称' : '正文') + ' · 第 ' + (match.start + 1) + ' 字符起', 'data-replace-match', selectedKeys.has(match.key));
    choice.control.value = match.key;
    choice.control.addEventListener('change', () => {
      if (choice.control.checked) selectedKeys.add(match.key); else selectedKeys.delete(match.key);
      updateCounts();
    });
    toolbar.append(choice.element);
    if (onLocate) toolbar.append(button('定位', 'data-replace-locate', () => { if (!busy) onLocate(match.id, match.field, match.start, match.end); }));
    const applyOne = button('替换这一处', 'data-replace-apply-one', () => void apply([match.key]));
    applyOne.dataset.replaceKey = match.key;
    toolbar.append(applyOne);
    row.append(toolbar);
    const start = Math.max(0, match.start - 60), end = Math.min(beforeText.length, match.end + 60);
    const prefix = (start ? '…' : '') + beforeText.slice(start, match.start);
    const suffix = beforeText.slice(match.end, end) + (end < beforeText.length ? '…' : '');
    for (const [label, value, className] of [['修改前', match.before, 'pcm-replace-before'], ['修改后', match.replacement, 'pcm-replace-after']]) {
      const sample = node('div', 'pcm-replace-sample');
      const pre = node('pre', 'pcm-replace-diff');
      pre.setAttribute('aria-label', label);
      const mark = node('mark', className, value);
      if (!value) { mark.textContent = '（删除）'; mark.classList.add('pcm-replace-empty'); }
      pre.append(document.createTextNode(prefix), mark, document.createTextNode(suffix));
      sample.append(node('span', 'pcm-replace-note', label), pre);
      row.append(sample);
    }
    return row;
  }
  async function apply(keys) {
    if (busy || disposed || !plan || !keys.length) return;
    const previewPlan = plan, previewContext = contextAtPreview;
    const chosen = new Set(keys);
    const actualMatches = previewPlan.matches.filter(match => chosen.has(match.key));
    const entryCount = new Set(actualMatches.map(match => match.id)).size;
    busy = true;
    const priorDisabled = new Map();
    for (const control of element.querySelectorAll('input,textarea,select,button')) {
      priorDisabled.set(control, control.disabled); control.disabled = true;
    }
    report('正在校验并更新草稿…');
    try {
      const result = await onApply(previewPlan, keys, previewContext);
      if (disposed) return;
      if (result === false || result?.ok === false) throw new Error(result?.message || '未应用替换，请重新预览后再试。');
      resetPreview();
      report('已更新 ' + (result?.entryCount ?? entryCount) + ' 个条目、' + (result?.matchCount ?? actualMatches.length) + ' 处草稿。尚未写回酒馆，可整批撤回；保存后生效。');
    } catch (error) {
      if (!disposed) {
        // Failed validation may mean the source changed: never leave an actionable stale preview.
        resetPreview();
        report((error.message || String(error)) + ' 请重新预览。', true);
      }
    } finally {
      busy = false;
      if (!disposed) for (const [control, disabled] of priorDisabled) control.disabled = disabled;
    }
  }
  try {
    context = getContext();
    syncScopes(context, initialScope);
    updateScopeNote();
  } catch (error) { syncScopes({groups: []}, initialScope); report(error.message || String(error), true); }
  return {element, dispose() { disposed = true; resetPreview(); element.remove(); }};
}
