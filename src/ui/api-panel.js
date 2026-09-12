// API 管理页面：方案编辑、旧脚本数据导入与独立切换，所有宿主操作均通过通信桥。
export function createApiPanel({ host, onBack, onClose, onCycleTheme, themeIcon, prompt, confirm, quick = false }) {
  const node = (tag, cls, text) => { const el = document.createElement(tag); el.className = cls || ''; if (text !== undefined) el.textContent = text; return el; };
  const element = node('main', 'pcm-snapshots pcm-api-manager');
  element.setAttribute('aria-label', quick ? 'API 快切' : 'API 管理'); if(quick) element.classList.add('pcm-api-quick');
  let data, busy = false, disposed = false, editing = null;
  function button(label, action) { const b = node('button', '', label); b.type = 'button'; b.addEventListener('click', event => { event.stopPropagation(); void action(); }); return b; }
  const header = node('header', 'pcm-snapshot-header');
  const heading = node('div', 'pcm-snapshot-heading'); heading.append(node('h2', '', quick ? 'API 快切' : 'API 管理'));
  function iconButton(label, path, action) {
    const b = button('', action); b.className = 'pcm-api-icon'; b.title = label; b.setAttribute('aria-label', label);
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+path+'"/></svg>'; return b;
  }
  const refreshPath = 'M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.5-1L20 9M4 15l2.4 3A7 7 0 0 0 18 17';
  heading.append(iconButton('刷新当前设置', refreshPath, () => run(refresh)));
  const theme = button('', onCycleTheme); theme.innerHTML = themeIcon; theme.dataset.themeToggle = ''; theme.setAttribute('aria-label', '切换配色');
  if(!quick) header.append(button('← 首页', onBack)); header.append(heading, theme, button('×', onClose));
  const current = node('section', 'pcm-snapshot-context pcm-api-current'); current.setAttribute('aria-label', '当前设置');
  const toolbar = node('div', 'pcm-snapshot-toolbar');
  const preferences = node('div','pcm-api-entry-settings');
  const checks = {};
  for(const [key,labelText] of [['quickReply','启用快速回复'],['floating','启用悬浮球']]){
    const label=node('label'),input=node('input');input.type='checkbox';checks[key]=input;label.append(input,node('span','',labelText));preferences.append(label);
    input.addEventListener('change',()=>void run(async()=>{try{await host.request('api-manager-preferences',{[key]:input.checked});}finally{await refresh();}}));
  }
  const status = node('p', 'pcm-snapshot-status'); status.setAttribute('role', 'status');
  const list = node('section', 'pcm-snapshot-list');
  const modal = node('dialog', 'pcm-api-modal'); modal.setAttribute('aria-label', 'API 方案编辑');
  const editor = node('form', 'pcm-api-editor'); editor.hidden = true; modal.append(editor);
  const closeEditor = () => { if (busy) return; modal.close(); editor.hidden = true; editor.replaceChildren(); editing = null; };
  modal.addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
  const file = node('input'); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true;
  const saveCurrent = button('保存当前设置', () => run(async () => {
    const name = await prompt('为当前 API 和模型起个名称', '我的 API'); if (!name) return;
    await host.request('api-manager-save', { capture: true, name }); await refresh(); message('已保存当前连接');
  }));
  toolbar.append(button('＋ 新建方案', () => edit()), button('导入方案', () => file.click()));
  file.addEventListener('change', () => void run(async () => {
    const selected = file.files?.[0]; file.value = ''; if (!selected) return;
    if (selected.size > 5 * 1024 * 1024) throw new Error('导入文件不能超过 5 MB');
    const input = JSON.parse(await selected.text());
    const result = await host.request('api-manager-import', { data: input }); await refresh(); message(`已导入 ${result.count} 个方案；密钥引用需属于当前酒馆`);
  }));
  element.append(header, current, toolbar, preferences,
    node('p', 'pcm-snapshot-notice', '切换方案同时应用 URL、密钥和模型，预设、正则、世界书与生成参数保持原样。'),
    status, modal, list, file);
  function message(text, error = false) { if (disposed) return; const target = modal.open ? editor.querySelector('.pcm-api-editor-status') : status; if (target) { target.textContent = text; target.classList.toggle('is-error', error); } }
  function lock(value) { busy = value; element.setAttribute('aria-busy', String(value)); for (const el of element.querySelectorAll('button,input,select')) el.disabled = value; }
  async function run(task) { if (busy || disposed) return; lock(true); try { await task(); } catch (error) { message(error.message || '操作失败', true); } finally { if (!disposed) lock(false); } }
  async function refresh() { const next = await host.request('api-manager-list'); if (disposed) return; data = next; render(); }
  function render() {
    for(const key of Object.keys(checks)) checks[key].checked=!!data.preferences?.[key];
    const currentHead = node('div', 'pcm-api-current-head'); currentHead.append(node('strong', '', '当前设置'));
    current.replaceChildren(currentHead);
    const details = node('dl', 'pcm-api-details');
    const activeKey = data.keys.find(key => key.id === data.current.secretId);
    for (const [label,value] of [['URL', data.current.connection.custom_url || '未填写'], ['密钥', activeKey?.masked || '未设置'], ['模型', data.current.model || '未选择']]) {
      details.append(node('dt', '', label), node('dd', '', value));
    }
    if (data.supported) current.append(details);
    else current.append(node('p', '', '请先在酒馆选择“聊天补全 → 自定义（兼容 OpenAI）”'));
    const currentActions = node('div', 'pcm-api-current-actions'); currentActions.append(saveCurrent); current.append(currentActions);
    list.replaceChildren();
    if (!data.profiles.length) list.append(node('p', 'pcm-snapshot-empty', '还没有方案。新建一个，或保存酒馆当前连接。'));
    for (const profile of data.profiles) {
      const card = node('article', 'pcm-snapshot-card pcm-api-profile'), actions = node('div', 'pcm-api-profile-actions');
      const top = node('div', 'pcm-api-profile-head'); top.append(node('h3', '', profile.name), actions);
      const cut = button('切', () => run(async () => { await host.request('api-manager-apply', {id:profile.id,mode:'both'}); await refresh(); message('已切换至：'+profile.name); })); cut.title='切换至此方案';
      const overwrite = button('覆', () => run(async () => {
        if(!await confirm('用当前 URL、密钥和模型覆盖“'+profile.name+'”？')) return;
        await host.request('api-manager-save',{capture:true,id:profile.id,name:profile.name}); await refresh(); message('已覆盖方案');
      })); overwrite.title='用当前设置覆盖此方案';
      actions.append(cut, overwrite, iconButton('编辑方案', 'm14 5 5 5M4 20l4-1L20 7a2 2 0 0 0-3-3L5 16l-1 4Z',()=>edit(profile)),iconButton('删除方案','M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',()=>run(async()=>{if(!await confirm('删除方案“'+profile.name+'”？'))return;await host.request('api-manager-delete',{id:profile.id});await refresh();})));
      card.append(top,node('p','pcm-snapshot-summary',profile.connection.custom_url),node('p','pcm-api-profile-model',profile.model)); list.append(card);

    }
  }
  function field(label, value = '', type = 'text') {
    const wrap = node('label', 'pcm-api-field'), input = node('input'); input.type = type; input.setAttribute('aria-label', label); input.value = value; input.autocomplete = 'off'; wrap.append(node('span', '', label), input); editor.append(wrap); return input;
  }
  function edit(profile = null) {
    if (!data || busy) return;
    editing = profile; editor.replaceChildren(); editor.hidden = false;
    const editorHead = node('header', 'pcm-api-editor-head'); editorHead.append(node('h3', '', profile ? '编辑 API' : '创建 API'), iconButton('关闭编辑', 'm6 6 12 12M6 18 18 6', closeEditor)); editor.append(editorHead);
    const name = field('方案名称', profile?.name); name.required = true; name.maxLength = 100;
    const url = field('API 地址', profile?.connection.custom_url || '', 'url'); url.placeholder = 'https://example.com/v1'; url.required = true;

    const label = node('label', 'pcm-api-field'), secret = node('select'); secret.setAttribute('aria-label', '酒馆密钥'); label.append(node('span', '', '酒馆密钥'), secret);
    secret.add(new Option('无密钥', ''));
    for (const key of data.keys) secret.add(new Option(`${key.label || '已保存密钥'} · ${key.masked || '••••••••'}`, key.id));
    if (profile?.secretId && !data.keys.some(key => key.id === profile.secretId)) secret.add(new Option('已失效的密钥引用（请重新选择）', profile.secretId));
    secret.value = profile?.secretId || ''; editor.append(label);
    const newSecret = field('新密钥（可选，填写后存入酒馆密钥库）', '', 'password'); newSecret.autocomplete = 'new-password';
    const secretRow = node('div', 'pcm-api-input-row'); newSecret.replaceWith(secretRow); secretRow.append(newSecret);
    const eye = iconButton('显示新密钥', 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6', () => {
      const show = newSecret.type === 'password'; newSecret.type = show ? 'text' : 'password'; eye.setAttribute('aria-label', show ? '隐藏新密钥' : '显示新密钥'); eye.title = show ? '隐藏新密钥' : '显示新密钥'; eye.setAttribute('aria-pressed', String(show));
    }); secretRow.append(eye);
    const model = field('默认模型', profile?.model || ''); model.required = true; model.placeholder = '搜索或输入中转站模型名称';
    const modelRow = node('div', 'pcm-api-input-row'); model.replaceWith(modelRow); modelRow.append(model);
    const modelMenu = node('div', 'pcm-api-model-menu'); modelMenu.hidden = true; modelMenu.setAttribute('role', 'group'); modelMenu.setAttribute('aria-label', '可用模型');
    let models = [];
    const renderModels = () => {
      modelMenu.replaceChildren(); modelMenu.hidden = !models.length;
      const matches = models.filter(value => value.toLowerCase().includes(model.value.toLowerCase()));
      for (const value of matches) modelMenu.append(button(value, () => { model.value = value; modelMenu.hidden = true; }));
      if (!matches.length) modelMenu.append(node('p', '', '没有匹配模型，可直接手动填写'));
    };
    model.addEventListener('input', renderModels); model.addEventListener('focus', renderModels);
    modelRow.append(iconButton('拉取模型', refreshPath, () => run(async () => {
      models = await host.request('api-manager-models', { url: url.value.trim(), secretId: secret.value, newSecret: newSecret.value.trim() });
      renderModels(); message(models.length ? '已拉取 '+models.length+' 个模型，点击选择或搜索' : '未返回模型，可手动填写');
    })));
    modelRow.parentElement.append(modelMenu);
    const clearModels = () => { models = []; modelMenu.hidden = true; modelMenu.replaceChildren(); };
    url.addEventListener('input', clearModels); secret.addEventListener('change', clearModels); newSecret.addEventListener('input', clearModels);
    const editorStatus = node('p', 'pcm-api-editor-status'); editorStatus.setAttribute('role', 'status'); editor.append(editorStatus);
    const actions = node('div', 'pcm-snapshot-actions');
    const save = node('button', '', '保存方案'); save.type = 'submit'; actions.append(save, button('取消', closeEditor)); editor.append(actions);
    editor.onsubmit = event => { event.preventDefault(); void run(async () => {
      await host.request('api-manager-save', { profile: { id: editing?.id, name: name.value, source: 'custom', model: model.value, connection: { custom_url: url.value }, secretId: secret.value }, newSecret: newSecret.value });
      newSecret.value = ''; modal.close(); editor.hidden = true; editor.replaceChildren(); editing = null; await refresh(); message('方案已保存，当前连接保持原样');
    }); };
    modal.showModal(); name.focus();
  }
  return { element, refresh: () => run(refresh), destroy() { disposed = true; editor.replaceChildren(); element.remove(); } };
}
