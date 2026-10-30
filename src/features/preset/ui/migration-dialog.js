// 双预设迁移候选窗口：只读快照规划、完整顺序预览、显式定位和分组选择，经回调一次应用到草稿。
import { analyzeMigration, planMigration } from '../migration.js';
import { findPromptOrderEntry } from '../core.js';

let dialogSequence = 0;
const kindNames = { unique: '旧版独有', similar: '疑似已有对应', 'same-content': '已有相同正文', ambiguous: '需核对' };
const nameOf = item => String(item?.name || '未命名条目');
const idOf = item => typeof item === 'string' ? item : item?.identifier;

export function openMigrationDialog({ parent, source, target, sourceName, targetName, ignoreWhitespace = false, isCurrent, onApply, onClose }) {
  if (!parent?.isConnected || parent.querySelector('.pcm-migration-modal')) return { close() {} };
  const doc = parent.ownerDocument, previousFocus = doc.activeElement;
  const node = (tag, className = '', text) => {
    const element = doc.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const button = (text, key, action) => {
    const element = node('button', 'menu_button', text);
    element.type = 'button'; element.setAttribute(`data-migration-${key}`, '');
    element.addEventListener('click', action); return element;
  };
  const option = (value, text) => { const element = node('option', '', text); element.value = value; return element; };
  const field = (text, control) => { const label = node('label', 'pcm-migration-field'); label.append(node('span', '', text), control); return label; };
  const check = (text, checked = false) => {
    const label = node('label', 'pcm-migration-check'), control = node('input');
    control.type = 'checkbox'; control.checked = checked; label.append(control, node('span', '', text)); return { label, control };
  };
  let disposed = false, stale = false, busy = false, plan = null, analysis;
  let freshnessTimer;
  const selected = new Set(), placements = Object.create(null), placementErrors = new Map(), rows = new Map(), groupControls = [];
  const sourcePrompts = new Map((source?.prompts || []).map(prompt => [prompt.identifier, prompt]));
  const targetPrompts = new Map((target?.prompts || []).map(prompt => [prompt.identifier, prompt]));
  const targetGroups = (target?.extensions?.baibaiToolkit?.presetPromptGroups?.groups || []).filter(group => group?.id);
  const order = findPromptOrderEntry({ ...target, prompt_order: target?.prompt_order || [] });
  const targetIds = [...new Set([...(order?.order || []).map(idOf), ...(target?.prompts || []).map(prompt => prompt.identifier)])].filter(id => targetPrompts.has(id));
  const injectedTargetIds = new Set((order?.order || []).map(idOf));
  const modal = node('dialog', 'pcm-modal pcm-migration-modal');
  const title = node('h2', 'pcm-migration-title', '迁移新增条目');
  title.id = `pcm-migration-title-${++dialogSequence}`; modal.setAttribute('aria-labelledby', title.id);
  const box = node('div', 'pcm-modal-box pcm-migration-box');
  const closeButton = button('关闭', 'close', close);
  const heading = node('div', 'pcm-migration-heading'); heading.append(title, closeButton);
  const direction = node('p', 'pcm-migration-direction', `${sourceName || '旧版预设'} → ${targetName || '新版预设'}`);
  const explanation = node('p', 'pcm-migration-note', '“旧版独有”也可能是作者已移除的条目，请核对后选择。迁移只更新新版草稿，之后仍需保存预设。');
  const toolbar = node('div', 'pcm-migration-toolbar');
  const count = node('span', 'pcm-migration-count'); count.setAttribute('role', 'status');
  toolbar.append(button('全选候选', 'select-all', () => selectAll(true)), button('清空', 'clear', () => selectAll(false)), count);
  const issues = node('div', 'pcm-migration-issues'); issues.setAttribute('role', 'status'); issues.setAttribute('aria-live', 'polite');
  const errorBox = node('div', 'pcm-migration-error'); errorBox.setAttribute('role', 'alert'); errorBox.hidden = true;
  const list = node('div', 'pcm-migration-list');
  const preview = node('section', 'pcm-migration-preview'); preview.hidden = true; preview.setAttribute('aria-label', '迁移后完整顺序');
  const actions = node('div', 'pcm-migration-actions');
  const previewButton = button('预览', 'preview', showPreview);
  const applyButton = button('一键迁移', 'apply', apply); applyButton.classList.add('pcm-primary');
  actions.append(previewButton, applyButton);
  box.append(heading, direction, explanation, toolbar, errorBox, issues, list, preview, actions); modal.append(box); parent.append(modal);

  function reportError(message) { errorBox.textContent = message; errorBox.hidden = !message; }
  function current() {
    if (disposed) return false;
    if (!stale) {
      try { stale = typeof isCurrent === 'function' && !isCurrent(); }
      catch { stale = true; }
    }
    if (stale) {
      reportError('两侧预设、表单草稿或比较选项已变化，请关闭后重新打开迁移窗口。');
      applyButton.disabled = true; previewButton.disabled = true; preview.hidden = true;
    }
    return !stale;
  }
  function close() {
    if (disposed) return;
    disposed = true; clearInterval(freshnessTimer);
    parent.removeEventListener('close', parentClosed);
    if (modal.open) modal.close(); modal.remove();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    onClose?.();
  }
  function parentClosed(event) { if (event.target === parent) close(); }
  function selectAll(value) {
    for (const candidate of analysis?.candidates || []) {
      if (value) selected.add(candidate.id); else selected.delete(candidate.id);
      rows.get(candidate.id).checkbox.checked = value;
    }
    recalculate();
  }
  function recalculate() {
    preview.hidden = true; preview.replaceChildren(); reportError('');
    count.textContent = `已选 ${selected.size} / ${analysis?.candidates?.length || 0} 条`;
    for (const group of groupControls) {
      const n = group.ids.filter(id => selected.has(id)).length;
      group.control.checked = n === group.ids.length; group.control.indeterminate = n > 0 && n < group.ids.length;
    }
    plan = null;
    try {
      if (analysis) {
        plan = planMigration(source, target, [...selected], { analysis, ignoreWhitespace, placements });
        const localErrors = [...placementErrors].filter(([id]) => selected.has(id)).map(([, message]) => message);
        if (localErrors.length) plan = { ...plan, errors: [...(plan.errors || []), ...localErrors] };
      }
    }
    catch (error) { reportError(error?.message || '无法规划迁移，请重新打开。'); }
    issues.replaceChildren();
    const errors = [...new Set([...(analysis?.errors || []), ...(plan?.errors || [])])];
    for (const message of errors) issues.append(node('p', 'pcm-migration-problem', String(message)));
    for (const message of plan?.warnings || []) issues.append(node('p', 'pcm-migration-warning', String(message)));
    for (const [id, row] of rows) {
      const entry = plan?.entries?.find(item => item.id === id);
      const referenceName = referenceId => nameOf(targetPrompts.get(referenceId) || sourcePrompts.get(referenceId));
      const location = entry?.injected === false ? '未注入，列于列表尾部'
        : entry?.afterId != null ? `插入“${referenceName(entry.afterId)}”之后`
        : entry?.beforeId != null ? `插入“${referenceName(entry.beforeId)}”之前`
        : '放到列表末尾';
      row.element.classList.toggle('is-selected', selected.has(id));
      row.position.textContent = selected.has(id)
        ? placementErrors.has(id) ? placementErrors.get(id)
          : entry ? `${location}${entry.groupName ? ` · ${entry.groupName}` : ' · 未分组'}${entry.enabled === false ? ' · 条目关闭' : ''}${entry.reason ? `（${entry.reason}）` : ''}` : '待解决位置或分组冲突；可展开调整'
        : analysis.candidates.find(candidate=>candidate.id===id)?.defaultReason || '未选择';
    }
    applyButton.disabled = busy || !selected.size || !plan?.result || errors.length > 0;
    previewButton.disabled = !selected.size || !plan?.result || errors.length > 0;
    current();
  }
  function showPreview() {
    if (!current() || !plan?.result || previewButton.disabled) return;
    preview.replaceChildren(node('h3', '', '迁移后完整顺序'), node('p', 'pcm-migration-note', '高亮为本次迁入；其余为新版既有条目。聊天深度等注入设置保留，列表位置不代表最终发送位置。'));
    const ordered = node('ol', 'pcm-migration-preview-order');
    for (const entry of plan.previewOrder || []) {
      const item = node('li', entry.incoming ? 'is-incoming' : '');
      item.append(node('span', 'pcm-migration-preview-name', nameOf(entry)));
      const tags = [entry.incoming ? '本次迁入' : '', entry.groupName || '未分组', entry.injected === false ? '未注入' : ''].filter(Boolean);
      item.append(node('span', 'pcm-migration-preview-meta', tags.join(' · '))); ordered.append(item);
    }
    preview.append(ordered); preview.hidden = false; preview.scrollIntoView?.({ block: 'nearest' });
  }
  function apply() {
    if (busy || !current() || applyButton.disabled || !plan?.result) return;
    busy = true; applyButton.disabled = true;
    try {
      if (onApply?.(plan) === true) { close(); return; }
      reportError('未完成迁移，请核对提示后重试。');
    } catch (error) { reportError(error?.message || '迁移失败，未关闭当前窗口。'); }
    finally { busy = false; if (!disposed) { applyButton.disabled = !selected.size || !plan?.result || !!plan?.errors?.length || !!analysis?.errors?.length; current(); } }
  }
  function detailsFor(candidate, details) {
    const sourcePrompt = sourcePrompts.get(candidate.id);
    const compare = node('div', 'pcm-migration-content');
    const content = (titleText, prompt) => {
      const block = node('section'); block.append(node('h4', '', titleText), node('pre', '', typeof prompt?.content === 'string' && prompt.content ? prompt.content : '（空正文）')); compare.append(block);
    };
    content(`旧版：${nameOf(sourcePrompt)}`, sourcePrompt);
    for (const match of candidate.matches || []) content(`新版对应：${nameOf(match)}`, targetPrompts.get(match.id));
    const placement = node('div', 'pcm-migration-placement');
    const mode = node('select'); mode.dataset.migrationPositionMode = candidate.id;
    mode.setAttribute('aria-label', `“${candidate.name}”插入位置`);
    mode.append(option('auto', '自动定位'), option('before', '放到条目前'), option('after', '放到条目后'), option('append', '明确放到列表末尾'));
    const anchor = node('select'); anchor.dataset.migrationAnchor = candidate.id;
    anchor.setAttribute('aria-label', `“${candidate.name}”参照条目`); anchor.disabled = true;
    anchor.append(option('', '请选择目标条目'));
    for (const [index, id] of targetIds.entries()) if (injectedTargetIds.has(id)) anchor.append(option(id, `${index + 1}. ${nameOf(targetPrompts.get(id))}`));
    const group = node('select'); group.dataset.migrationGroup = candidate.id;
    group.setAttribute('aria-label', `“${candidate.name}”目标分组`);
    group.append(option('auto', '沿用来源分组'), option('ungrouped', '未分组'));
    for (const [index, entry] of targetGroups.entries()) group.append(option(`group-${index}`, `${entry.name || '未命名分组'}${entry.enabled === false ? '（组已关闭）' : ''}`));
    const accept = check('接受目标分组开关状态（不改变组内其他条目）'); accept.control.dataset.migrationAcceptGroupState = candidate.id;
    const groupNote = node('p', 'pcm-migration-note');
    function change() {
      const value = Object.create(null);
      anchor.disabled = !['before', 'after'].includes(mode.value);
      placementErrors.delete(candidate.id);
      if (mode.value === 'append') value.beforeId = null;
      else if (mode.value === 'before' && anchor.value) value.beforeId = anchor.value;
      else if (mode.value === 'after' && anchor.value) value.afterId = anchor.value;
      if (!anchor.disabled && !anchor.value) placementErrors.set(candidate.id, `请为“${nameOf(candidate)}”选择目标参照条目。`);
      if (group.value === 'ungrouped') value.groupId = '';
      else if (group.value.startsWith('group-')) value.groupId = String(targetGroups[Number(group.value.slice(6))].id);
      if (accept.control.checked) value.acceptGroupState = true;
      placements[candidate.id] = value; updateGroupNote(); recalculate();
    }
    function updateGroupNote() {
      const destination = group.value.startsWith('group-') ? targetGroups[Number(group.value.slice(6))] : group.value === 'auto' ? targetGroups.find(item => String(item.id) === String(candidate.sourceGroup?.id)) : null;
      const sourceEnabled = candidate.sourceGroup?.enabled !== false;
      groupNote.textContent = `来源分组：${candidate.sourceGroup?.name || '未分组'}${sourceEnabled ? '' : '（组已关闭）'}。${destination ? `目标分组${destination.enabled === false ? '已关闭' : '已开启'}。${(destination.enabled !== false) !== sourceEnabled ? '开关状态不同，须确认接受或改选分组。' : ''}` : '沿用来源时，缺失的组按规划新建；已有目标组保持原状。'}`;
    }
    for (const control of [mode, anchor, group, accept.control]) control.addEventListener('change', change);
    placement.append(field('插入方式', mode), field('目标参照', anchor), field('目标分组', group), groupNote, accept.label);
    if (candidate.injected === false) {
      mode.disabled = true; anchor.disabled = true;
      placement.prepend(node('p', 'pcm-migration-note', '此条目未注入，保留未注入状态并按来源顺序列在尾部。'));
    }
    updateGroupNote(); details.append(placement, compare);
  }
  try { analysis = analyzeMigration(source, target, { ignoreWhitespace }); }
  catch (error) { analysis = { candidates: [], errors: [error?.message || '分析失败，请重新打开。'] }; }
  const groups = new Map();
  for (const candidate of analysis.candidates || []) {
    const key = candidate.sourceGroup?.id || '';
    if (!groups.has(key)) groups.set(key, { name: candidate.sourceGroup?.name || '未分组', candidates: [] });
    groups.get(key).candidates.push(candidate);
  }
  for (const group of groups.values()) {
    const section = node('section', 'pcm-migration-group');
    const groupCheck = check(`${group.name} · ${group.candidates.length} 条`); groupCheck.label.classList.add('pcm-migration-group-title');
    const ids = group.candidates.map(candidate => candidate.id); groupControls.push({ control: groupCheck.control, ids });
    groupCheck.control.addEventListener('change', () => {
      for (const id of ids) { if (groupCheck.control.checked) selected.add(id); else selected.delete(id); rows.get(id).checkbox.checked = groupCheck.control.checked; }
      recalculate();
    });
    section.append(groupCheck.label);
    for (const candidate of group.candidates) {
      if (candidate.defaultSelected) selected.add(candidate.id);
      const row = node('article', 'pcm-migration-candidate'); row.dataset.migrationCandidate = candidate.id;
      const selection = check(nameOf(candidate), !!candidate.defaultSelected); selection.control.dataset.migrationSelect = candidate.id;
      selection.control.addEventListener('change', () => { if (selection.control.checked) selected.add(candidate.id); else selected.delete(candidate.id); recalculate(); });
      const badges = node('span', 'pcm-migration-badges', `${kindNames[candidate.kind] || '需核对'}${candidate.injected === false ? ' · 未注入' : ''}`);
      const position = node('p', 'pcm-migration-position');
      const details = node('details', 'pcm-migration-details');
      details.append(node('summary', '', '查看正文与调整位置'));
      let mounted = false;
      details.addEventListener('toggle', () => { if (details.open && !mounted) { mounted = true; detailsFor(candidate, details); } });
      if (candidate.kind !== 'unique') row.append(node('p', 'pcm-migration-note', '勾选即表示仍作为独立条目迁移，请先核对两边正文。'));
      row.prepend(selection.label, badges); row.append(position, details); section.append(row);
      rows.set(candidate.id, { element: row, checkbox: selection.control, position });
    }
    list.append(section);
  }
  if (!analysis.candidates?.length) list.append(node('p', 'pcm-migration-note', '没有可迁移的来源候选。相同标识的既有条目不会覆盖。'));
  modal.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
    else if (event.key === 'Tab') {
      const focusable = [...modal.querySelectorAll('button,input,select,summary,[tabindex="0"]')].filter(element => !element.disabled && element.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  modal.addEventListener('cancel', event => { event.preventDefault(); event.stopPropagation(); close(); });
  modal.addEventListener('close', close);
  parent.addEventListener('close', parentClosed);
  recalculate();
  if (typeof modal.showModal === 'function') modal.showModal(); else modal.setAttribute('open', '');
  closeButton.focus({ preventScroll: true });
  modal.addEventListener('focusin', current);
  // Large preset snapshots are checked on interaction and immediately before apply, not every idle tick.
  freshnessTimer = setInterval(() => { if (!parent.isConnected) close(); }, 1000);
  return { close };
}
