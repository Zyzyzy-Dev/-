// 临时库对比面板：材料正文只读，独立标记差异方向，不注册为预设编辑表单。
const node = (tag, cls, text) => { const element = document.createElement(tag); if (cls) element.className = cls; if (text !== undefined) element.textContent = text; return element; };

export function createTempLibraryPreview(item, { diffSide }) {
  const section = node('section', 'pcm-version-editor pcm-temp-comparison');
  section.dataset.tempComparison = ''; section.setAttribute('aria-label', '临时库条目对比');
  const name = node('strong', 'pcm-temp-comparison-name', item.name), source = node('small', 'pcm-temp-comparison-source', item.source);
  const content = node('label', 'pcm-inline-content'), wrap = node('div', 'pcm-editwrap');
  const backdrop = node('pre', 'pcm-diff-backdrop'), area = node('textarea', 'pcm-live-area');
  backdrop.setAttribute('aria-hidden', 'true');
  area.dataset.diffSide = diffSide; area.readOnly = true; area.value = item.content || '';
  area.setAttribute('aria-label', '临时库正文（只读）');
  // 不设置 name=content，避免预设编辑工具把只读材料当作可保存表单。
  wrap.append(backdrop, area); content.append(node('span', '', '正文（只读）'), wrap);
  section.append(node('h4', '', '临时库'), name, source, content);
  return section;
}
