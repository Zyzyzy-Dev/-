// 设置快照页面：保存、恢复与聊天/角色绑定，通过 iframe 通信桥调用宿主，不访问酒馆全局。
export function createSnapshotPanel({host, onBack, onClose, onCycleTheme, themeIcon, prompt, confirm, toast}) {
  const node = (tag, cls, text) => {const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n;};
  const element = node('main', 'pcm-snapshots');
  element.setAttribute('aria-label', '设置快照');
  const header = node('header', 'pcm-snapshot-header');
  const back = button('← 首页', onBack), title = node('h2', '', '设置快照');
  const theme = button('', onCycleTheme); theme.dataset.themeToggle = ''; theme.title = '切换配色'; theme.setAttribute('aria-label', '切换配色'); theme.innerHTML = themeIcon;
  const close = button('×', onClose); close.setAttribute('aria-label', '关闭插件');
  header.append(back, title, theme, close);
  const context = node('section', 'pcm-snapshot-context');
  const toolbar = node('div', 'pcm-snapshot-toolbar');
  const save = button('＋ 保存当前设置', () => execute('save')); save.classList.add('pcm-snapshot-primary');
  const reload = button('刷新', () => refresh()); toolbar.append(save, reload);
  const notice = node('p', 'pcm-snapshot-notice', '保存预设条目与分组开关、全局世界书挂载。聊天绑定优先于角色绑定。');
  const status = node('p', 'pcm-snapshot-status'); status.setAttribute('role', 'status');
  const list = node('section', 'pcm-snapshot-list'); list.setAttribute('aria-label', '已保存快照');
  element.append(header, context, toolbar, notice, status, list);
  let data = null, busy = false, disposed = false, revision = 0, refreshPending = false;
  const unsubscribe = host.on('snapshots-changed', () => {if (busy) refreshPending = true; else void refresh();});

  function button(text, action) {
    const b = node('button', '', text); b.type = 'button';
    b.addEventListener('click', event => {event.stopPropagation(); action();});
    return b;
  }
  function showStatus(message, error = false) {status.textContent = message; status.classList.toggle('is-error', error);}
  function setBusy(value) {
    busy = value;
    for (const b of element.querySelectorAll('button')) {
      if ([back, close, theme].includes(b)) continue;
      b.disabled = value || b.dataset.unavailable === 'true';
    }
    element.setAttribute('aria-busy', String(value));
  }
  function bindingName(id) {return data.snapshots.find(s => s.id === id)?.name || (id ? '快照已删除' : '未绑定');}
  function render() {
    if (disposed || !data) return;
    const expanded = new Set([...list.querySelectorAll('details[open]')].map(d => d.closest('[data-snapshot-id]')?.dataset.snapshotId));
    context.replaceChildren(); list.replaceChildren();
    const c = data.context;
    context.append(node('div', 'pcm-snapshot-current', '当前预设 · '+(c.presetName || '未选择')));
    context.append(node('div', '', c.characterName+' · '+c.chatName));
    for (const [target, label, id, allowed] of [['chat','此聊天',c.chatBindingId,c.canBindChat],['character','此角色',c.characterBindingId,c.canBindCharacter]]) {
      const row = node('div', 'pcm-snapshot-binding'); row.append(node('span', '', label+'：'+bindingName(id)));
      if (id && allowed) row.append(button('解除绑定', () => execute('unbind', {target})));
      context.append(row);
    }
    const active = data.activeBinding;
    context.append(node('small', '', active ? '进入聊天时应用：'+active.name+'（'+(active.source === 'chat' ? '聊天绑定' : '角色默认')+'）' : '当前没有自动绑定，手动切换即可。'));
    if (!data.snapshots.length) {
      const empty = node('div', 'pcm-snapshot-empty');
      empty.append(node('strong', '', '把常用开关存成一份快照'), node('p', '', '先在酒馆调好预设开关和全局世界书，再点击「保存当前设置」。'));
      list.append(empty);
    }
    for (const snapshot of data.snapshots) {
      const card = node('article', 'pcm-snapshot-card'); card.dataset.snapshotId = snapshot.id;
      const top = node('div', 'pcm-snapshot-card-title'); top.append(node('h3', '', snapshot.name));
      if (snapshot.id === c.chatBindingId || snapshot.id === c.characterBindingId) top.append(node('span', 'pcm-snapshot-badge', [snapshot.id === c.chatBindingId ? '此聊天' : '', snapshot.id === c.characterBindingId ? '此角色' : ''].filter(Boolean).join(' / ')));
      const entries = Array.isArray(snapshot.entries) ? snapshot.entries : [], groups = Array.isArray(snapshot.groups) ? snapshot.groups : [], books = Array.isArray(snapshot.worldNames) ? snapshot.worldNames : [];
      const summary = node('p', 'pcm-snapshot-summary', (snapshot.presetName || '无效预设')+' · 条目 '+entries.filter(e => e.enabled).length+'/'+entries.length+' 开启 · 分组 '+groups.filter(g => g.enabled).length+'/'+groups.length+' 开启');
      const mounts = node('p', 'pcm-snapshot-books', books.length ? '全局世界书：'+books.join('、') : '全局世界书：不挂载');
      const actions = node('div', 'pcm-snapshot-actions');
      const apply = button('应用', () => execute('apply', snapshot)); apply.classList.add('pcm-snapshot-primary');
      const chat = button('绑定此聊天', () => execute('bind', {...snapshot, target: 'chat'}));
      const character = button('绑定此角色', () => execute('bind', {...snapshot, target: 'character'}));
      chat.dataset.unavailable = String(!c.canBindChat); character.dataset.unavailable = String(!c.canBindCharacter);
      actions.append(apply, chat, character);
      const details = node('details', 'pcm-snapshot-details'), detailsTitle = node('summary', '', '查看开关与管理');
      details.open = expanded.has(snapshot.id);
      const switches = node('div', 'pcm-snapshot-switches');
      if (groups.length) switches.append(node('strong', '', '分组总开关'));
      for (const g of groups) switches.append(node('span', g.enabled ? 'is-on' : '', (g.enabled ? '开 · ' : '关 · ')+(g.name || '未命名分组')));
      switches.append(node('strong', '', '条目自身开关（分组关闭时仍保留）'));
      for (const e of entries) switches.append(node('span', e.enabled ? 'is-on' : '', (e.enabled ? '开 · ' : '关 · ')+(e.name || '未命名条目')));
      const manage = node('div', 'pcm-snapshot-actions');
      manage.append(button('用当前设置更新', () => execute('update', snapshot)), button('重命名', () => execute('rename', snapshot)), button('删除', () => execute('delete', snapshot)));
      details.append(detailsTitle, manage, switches); card.append(top, summary, mounts, actions, details); list.append(card);
    }
    setBusy(busy);
  }

  async function refresh() {
    if (disposed) return;
    if (busy) {refreshPending = true; return;}
    const token = ++revision;
    setBusy(true);
    try {
      const result = await host.request('snapshot-list');
      if (disposed || token !== revision) return;
      data = result; render(); showStatus('');
    } catch (error) {if (!disposed) showStatus(error.message, true);}
    finally {
      if (!disposed && token === revision) {setBusy(false); if (refreshPending) {refreshPending = false; void refresh();}}
    }
  }

  async function execute(action, snapshot = {}) {
    if (busy || disposed || !data) return;
    const contextKey = data.context.key;
    setBusy(true);
    showStatus('');
    try {
      let result, message = '';
      if (action === 'save' || action === 'rename') {
        const name = await prompt(action === 'save' ? '给当前设置起个名字' : '快照名称', action === 'save' ? '' : snapshot.name);
        if (name === null || disposed) return;
        result = await host.request(action === 'save' ? 'snapshot-save' : 'snapshot-rename', {id: action === 'rename' ? snapshot.id : undefined, name, contextKey});
        message = action === 'save' ? '快照已保存' : '名称已更新';
      } else if (action === 'update') {
        if (!(await confirm('用酒馆当前的开关和全局世界书更新「'+snapshot.name+'」？绑定这份快照的聊天和角色会使用更新后的设置。')) || disposed) return;
        result = await host.request('snapshot-save', {id: snapshot.id, name: snapshot.name, contextKey}); message = '快照已更新';
      } else if (action === 'delete') {
        if (!(await confirm('删除「'+snapshot.name+'」？它的聊天绑定将失效，角色绑定将解除。')) || disposed) return;
        result = await host.request('snapshot-delete', {id: snapshot.id}); message = '快照已删除';
      } else if (action === 'bind' || action === 'unbind') {
        result = await host.request('snapshot-bind', {id: action === 'unbind' ? null : snapshot.id, target: snapshot.target, contextKey});
        message = action === 'unbind' ? '已解除绑定，下次进入聊天时按剩余绑定应用' : '已绑定，下次进入聊天自动应用；现在可点击「应用」';
      } else if (action === 'apply') {
        result = await host.request('snapshot-apply', {id: snapshot.id, contextKey});
        if (result.needsConfirmation) {
          if (!(await confirm('缺少世界书：'+result.missingWorldNames.join('、')+'。继续应用预设开关和其余世界书？')) || disposed) return;
          result = await host.request('snapshot-apply', {id: snapshot.id, contextKey, allowMissingWorlds: true});
        }
        message = result.warnings?.length ? '已应用可恢复部分。'+result.warnings.join('；') : '已应用「'+snapshot.name+'」';
      }
      if (disposed) return;
      if (result?.snapshots) {data = result; render();}
      else {data = await host.request('snapshot-list'); if (!disposed) render();}
      if (disposed) return;
      refreshPending = false;
      showStatus(message, Boolean(result?.warnings?.length));
      if (result?.warnings?.length) toast.warning(message); else toast.success(message);
    } catch (error) {if (!disposed) {showStatus(error.message, true); toast.error(error.message);}}
    finally {if (!disposed) {setBusy(false); if (refreshPending) {refreshPending = false; void refresh();}}}
  }
  return {element, refresh, destroy() {disposed = true; revision++; unsubscribe(); element.remove();}};
}
