// API 管理页面：方案编辑、旧脚本数据导入与独立切换，所有宿主操作均通过通信桥。
export function createApiPanel({ host, onBack, onClose, onCycleTheme, themeIcon, prompt, confirm }) {
  const node = (tag, cls, text) => { const el = document.createElement(tag); el.className = cls || ''; if (text !== undefined) el.textContent = text; return el; };
  const element = node('main', 'pcm-snapshots pcm-api-manager');
  element.setAttribute('aria-label', 'API 管理');
  let data, busy = false, disposed = false, editing = null;
  function button(label, action) { const b = node('button', '', label); b.type = 'button'; b.addEventListener('click', event => { event.stopPropagation(); void action(); }); return b; }
  const header = node('header', 'pcm-snapshot-header');
  const heading = node('div', 'pcm-snapshot-heading'); heading.append(node('h2', '', 'API 管理'));
  const theme = button('', onCycleTheme); theme.innerHTML = themeIcon; theme.dataset.themeToggle = ''; theme.setAttribute('aria-label', '切换配色');
  header.append(button('← 首页', onBack), heading, theme, button('×', onClose));
  const current = node('section', 'pcm-snapshot-context');
  const toolbar = node('div', 'pcm-snapshot-toolbar');
  const status = node('p', 'pcm-snapshot-status'); status.setAttribute('role', 'status');
  const list = node('section', 'pcm-snapshot-list');
  const editor = node('form', 'pcm-api-editor'); editor.hidden = true;
  const file = node('input'); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true;
  toolbar.append(button('＋ 新建方案', () => edit()), button('保存当前连接', () => run(async () => {
    const name = await prompt('为当前 API 和模型起个名称', '我的 API'); if (!name) return;
    await host.request('api-manager-save', { capture: true, name }); await refresh(); message('已保存当前连接');
  })), button('导入方案', () => file.click()), button('刷新', () => run(refresh)));
  file.addEventListener('change', () => void run(async () => {
    const selected = file.files?.[0]; file.value = ''; if (!selected) return;
    if (selected.size > 5 * 1024 * 1024) throw new Error('导入文件不能超过 5 MB');
    const input = JSON.parse(await selected.text());
    const result = await host.request('api-manager-import', { data: input }); await refresh(); message(`已导入 ${result.count} 个方案；密钥引用需属于当前酒馆`);
  }));
  element.append(header, current, toolbar,
    node('p', 'pcm-snapshot-notice', '支持自定义（兼容 OpenAI）。仅切 API 保留当前模型；仅切模型保留地址和密钥。预设、正则、世界书与生成参数保持原样。'),
    status, editor, list, file);
  function message(text, error = false) { if (disposed) return; status.textContent = text; status.classList.toggle('is-error', error); }
  function lock(value) { busy = value; element.setAttribute('aria-busy', String(value)); for (const el of element.querySelectorAll('button,input,select')) el.disabled = value; }
  async function run(task) { if (busy || disposed) return; lock(true); try { await task(); } catch (error) { message(error.message || '操作失败', true); } finally { if (!disposed) lock(false); } }
  async function refresh() { const next = await host.request('api-manager-list'); if (disposed) return; data = next; render(); }
  function render() {
    current.replaceChildren(node('strong', '', '当前连接'), node('p', '', data.supported ? `${data.current.connection.custom_url || '未填写地址'} · ${data.current.model || '未选择模型'}` : '请先在酒馆选择“聊天补全 → 自定义（兼容 OpenAI）”'));
    list.replaceChildren();
    if (!data.profiles.length) list.append(node('p', 'pcm-snapshot-empty', '还没有方案。新建一个，或保存酒馆当前连接。'));
    for (const profile of data.profiles) {
      const card = node('article', 'pcm-snapshot-card'), actions = node('div', 'pcm-snapshot-actions');
      const secret = data.keys.find(key => key.id === profile.secretId);
      card.append(node('h3', '', profile.name), node('p', 'pcm-snapshot-summary', profile.connection.custom_url), node('p', '', profile.model), node('small', '', profile.secretId ? (secret ? `密钥：${secret.label}` : '密钥引用失效，请编辑重新选择') : '无密钥'));
      for (const [mode, label] of [['api', '仅切 API'], ['model', '仅切模型'], ['both', 'API＋模型']]) actions.append(button(label, () => run(async () => {
        await host.request('api-manager-apply', { id: profile.id, mode }); await refresh(); message(`已${label}：${profile.name}。连接可用性尚未验证。`);
      })));
      actions.append(button('编辑', () => edit(profile)), button('删除', () => run(async () => {
        if (!await confirm(`删除方案“${profile.name}”？酒馆密钥会保留。`)) return;
        await host.request('api-manager-delete', { id: profile.id }); await refresh(); message('已删除方案');
      })), button('快切命令', () => {
        const commands = node('div', 'pcm-api-commands');
        commands.append(node('small', '', '复制到酒馆原生快速回复按钮（不发送聊天消息）：'));
        for (const mode of ['api', 'model', 'both']) { const input = node('input'); input.readOnly = true; input.value = `/box-api mode=${mode} ${profile.id}`; input.setAttribute('aria-label', `${mode} 快切命令`); input.addEventListener('click', () => input.select()); commands.append(input); }
        card.querySelector('.pcm-api-commands')?.remove(); card.append(commands);
      }));
      card.append(actions); list.append(card);
    }
  }
  function field(label, value = '', type = 'text') {
    const wrap = node('label', 'pcm-api-field'), input = node('input'); input.type = type; input.value = value; input.autocomplete = 'off'; wrap.append(node('span', '', label), input); editor.append(wrap); return input;
  }
  function edit(profile = null) {
    if (!data || busy) return;
    editing = profile; editor.replaceChildren(); editor.hidden = false;
    editor.append(node('h3', '', profile ? '编辑方案' : '新建方案'));
    const name = field('方案名称', profile?.name); name.required = true; name.maxLength = 100;
    const url = field('API 地址', profile?.connection.custom_url || '', 'url'); url.placeholder = 'https://example.com/v1'; url.required = true;
    const model = field('默认模型', profile?.model || ''); model.required = true;
    const label = node('label', 'pcm-api-field'), secret = node('select'); label.append(node('span', '', '酒馆密钥'), secret);
    secret.add(new Option('无密钥', ''));
    for (const key of data.keys) secret.add(new Option(key.label || key.id, key.id));
    if (profile?.secretId && !data.keys.some(key => key.id === profile.secretId)) secret.add(new Option('已失效的密钥引用（请重新选择）', profile.secretId));
    secret.value = profile?.secretId || ''; editor.append(label);
    const newSecret = field('新密钥（可选，填写后存入酒馆密钥库）', '', 'password'); newSecret.autocomplete = 'new-password';
    const actions = node('div', 'pcm-snapshot-actions');
    const save = node('button', '', '保存方案'); save.type = 'submit'; actions.append(save, button('取消', () => { editor.hidden = true; editor.replaceChildren(); editing = null; })); editor.append(actions);
    editor.onsubmit = event => { event.preventDefault(); void run(async () => {
      await host.request('api-manager-save', { profile: { id: editing?.id, name: name.value, source: 'custom', model: model.value, connection: { custom_url: url.value }, secretId: secret.value }, newSecret: newSecret.value });
      newSecret.value = ''; editor.hidden = true; editor.replaceChildren(); editing = null; await refresh(); message('方案已保存，当前连接保持原样');
    }); };
    name.focus(); editor.scrollIntoView({ block: 'nearest' });
  }
  return { element, refresh: () => run(refresh), destroy() { disposed = true; editor.replaceChildren(); element.remove(); } };
}
