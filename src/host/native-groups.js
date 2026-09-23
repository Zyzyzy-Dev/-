// 宿主原生列表分组适配：保留原生条目与事件，柏宝箱启用时让出列表所有权。
import { clone } from '../shared/clone.js';
import { groupModel, memberGroup, changeGroups, installGroupGate, UNGROUPED } from '../features/preset/native-groups.js';

const PREF = 'preset_compare_native_groups';
const ROOT = 'pcm-native-groups';
const PRESET_PATH = 'baibaiToolkit.presetPromptGroups';
const REGEX_PATH = 'baibaiToolkit.regexGroups';

function node(tag, className, text) {
    const el = document.createElement(tag); el.className = className || ''; if (text != null) el.textContent = text; return el;
}
function button(text, title, action) {
    const el = node('button', 'pcm-ng-button', text); el.type = 'button'; el.title = title;
    el.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); action(); }); return el;
}
function choose(title, build) {
    return new Promise(resolve => {
        const dialog = node('dialog', 'pcm-ng-dialog'); const form = node('form'); form.method = 'dialog';
        form.append(node('h3', '', title)); const result = build(form);
        const actions = node('div', 'pcm-ng-actions');
        const cancel = button('取消', '取消', () => dialog.close());
        const ok = node('button', 'pcm-ng-button', '确定'); ok.type = 'submit'; actions.append(cancel, ok); form.append(actions);
        form.addEventListener('submit', event => { event.preventDefault(); dialog.returnValue = 'ok'; dialog.close('ok'); });
        dialog.addEventListener('close', () => { const value = dialog.returnValue === 'ok' ? result() : null; dialog.remove(); resolve(value); }, { once: true });
        dialog.append(form); document.body.append(dialog); dialog.showModal();
    });
}
function askName(title, value = '') {
    return choose(title, form => { const input = node('input', 'text_pole'); input.value = value; input.required = true; input.maxLength = 120; form.append(input); return () => input.value.trim(); });
}

export function installNativeGroups(env) {
    const { openai, script, extensions, regex, presetManager, serial, saveSettingsChecked } = env;
    const settings = extensions.extension_settings;
    let busy = false, scheduled = 0, observer;
    const signatures = new WeakMap();
    const prefs = () => settings[PREF] || {};
    const baiOwns = kind => Boolean(globalThis.__baiBaiToolkitExtensionInstalled) && settings.baiBaiToolkit?.[kind === 'preset' ? 'presetGroupingEnabled' : 'regexQuickOperationOptimizationEnabled'] !== false;
    const owns = kind => prefs()[kind] !== false && !baiOwns(kind) && (kind !== 'preset'
        || (typeof openai.promptManager?.getPromptCollection === 'function' && typeof openai.promptManager?.isPromptDisabledForActiveCharacter === 'function'));
    const fail = error => { console.error('[原生分组]', error); globalThis.toastr?.error(error.message || String(error), '分组操作未完成'); };
    const run = fn => { if (busy) return; busy = true; schedule(); void serial(fn).catch(fail).finally(() => { busy = false; schedule(); }); };
    const link = node('link'); link.rel = 'stylesheet'; link.href = new URL('./native-groups.css', import.meta.url).href; document.head.append(link);

    function presetContext() {
        const manager = presetManager.getPresetManager('openai'), pm = openai.promptManager;
        if (!manager || !pm?.listElement || !pm.activeCharacter) return null;
        const name = manager.getSelectedPresetName();
        if (!name) return null;
        const order = pm.getPromptOrderForCharacter(pm.activeCharacter) || [];
        return { kind: 'preset', key: `preset:${name}:${pm.activeCharacter.identifier ?? pm.activeCharacter.id ?? ''}`, manager, name,
            list: pm.listElement, path: PRESET_PATH,
            value: clone(openai.oai_settings?.extensions?.baibaiToolkit?.presetPromptGroups),
            entries: order.map(e => ({ id: String(e.identifier), name: pm.getPromptById(e.identifier)?.name || e.identifier, enabled: e.enabled })),
        };
    }
    function regexContext(scope, list) {
        const type = regex.SCRIPT_TYPES[scope], manager = presetManager.getPresetManager();
        const api = regex.getCurrentPresetAPI(), name = regex.getCurrentPresetName();
        const avatar = script.characters?.[script.this_chid]?.avatar;
        if (scope === 'SCOPED' && (!avatar || globalThis.SillyTavern?.getContext?.().groupId)) return null;
        if (scope === 'PRESET' && (!manager || !name)) return null;
        const scopeKey = scope === 'GLOBAL' ? 'global' : scope === 'SCOPED' ? `scoped:${avatar}` : `preset:${api}:${name}`;
        const entries = regex.getScriptsByType(type, { allowedOnly: false });
        const value = scope === 'PRESET' ? manager.readPresetExtensionField({ path: REGEX_PATH }) : settings.baiBaiToolkit?.regexListGroups?.scopes?.[scopeKey];
        return { kind: 'regex', key: scopeKey, scopeKey, scope, type, manager, name, list, path: REGEX_PATH, value: clone(value),
            entries: entries.map(e => ({ id: String(e.id || ''), name: e.scriptName || e.id, enabled: !e.disabled })), scripts: entries };
    }
    function refreshContext(context) {
        return context.kind === 'preset' ? presetContext() : regexContext(context.scope, context.list);
    }
    function validate(context) {
        const current = refreshContext(context);
        if (!current || !owns(context.kind) || current.key !== context.key || JSON.stringify(current.value) !== JSON.stringify(context.value)
            || JSON.stringify(current.entries) !== JSON.stringify(context.entries)) throw new Error('预设、角色或列表已变化，请重新操作');
        if (script.is_send_press) throw new Error('请等待本次生成结束后再修改分组');
        const ids = current.entries.map(e => e.id);
        if (ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error('列表存在缺失或重复 ID，请先修复条目标识再分组');
        const bai = globalThis.__baiBaiToolkitExtensionInstalled;
        const pending = bai?.__baiBaiToolkitPresetVueListManager;
        const regexPending = bai?.regexQuickOperationOptimization;
        if (context.kind === 'preset' && (pending?.pendingChangesSaveInFlight || pending?.pendingChangesSavePromise
            || pending?.pendingOrderSave || pending?.pendingPresetPromptGroupSaves?.has?.(context.name)
            || pending?.pendingPresetPromptServiceSaves?.has?.(context.name) || pending?.pendingOpenAiPresetSaves?.has?.(context.name)
            || pending?.openAiPresetSaveRequestStates?.get?.(context.name)?.promise)) throw new Error('柏宝箱仍有预设修改待保存，请等待其保存完成后重试');
        if (context.kind === 'regex' && (regexPending?.regexChangesSaveInFlight || regexPending?.regexChangesSavePromise
            || regexPending?.pendingRegexGroupSettingsSave || regexPending?.pendingRegexScriptSaves?.has?.(context.scopeKey)
            || regexPending?.pendingRegexPresetGroupSaves?.has?.(context.scopeKey))) throw new Error('柏宝箱仍有正则修改待保存，请等待其保存完成后重试');
        return current;
    }
    async function persist(context, value) {
        const before = clone(context.value);
        const bai = globalThis.__baiBaiToolkitExtensionInstalled;
        const runtimeBefore = clone(bai?.presetPromptGroupRuntimeState);
        if (context.kind === 'preset' || context.scope === 'PRESET') {
            const cache = settings.baiBaiToolkit?.regexListGroups?.scopes;
            const oldCache = clone(cache?.[context.scopeKey]);
            try {
                await context.manager.writePresetExtensionField({ name: context.name, path: context.path, value });
                // 柏宝箱的预设正则 scope 是缓存；同步已存在缓存，避免切回柏宝箱后出现旧归属。
                if (context.scope === 'PRESET' && settings.baiBaiToolkit?.regexListGroups?.scopes?.[context.scopeKey]) {
                    settings.baiBaiToolkit.regexListGroups.scopes[context.scopeKey] = clone(value);
                }
                await saveSettingsChecked();
                if (context.kind === 'preset' && bai?.presetPromptGroupRuntimePresetName === context.name
                    && JSON.stringify(bai.presetPromptGroupRuntimeState) === JSON.stringify(runtimeBefore)) {
                    bai.presetPromptGroupRuntimeState = clone(value);
                    const vue = bai.__baiBaiToolkitPresetVueListManager;
                    if (vue) { vue.lastSyncSignature = ''; vue.lastStructureSignature = ''; }
                }
            } catch (error) {
                if (cache && context.scopeKey && JSON.stringify(cache[context.scopeKey]) === JSON.stringify(value)) cache[context.scopeKey] = oldCache;
                // 保留宿主其他改动，仅还原仍等于本次写入的字段；磁盘可能已部分写入，明确报告。
                for (const target of [context.manager.getPresetList().settings, context.manager.getCompletionPresetByName?.(context.name)]) {
                    const bai = target?.extensions?.baibaiToolkit, key = context.kind === 'preset' ? 'presetPromptGroups' : 'regexGroups';
                    if (bai && JSON.stringify(bai[key]) === JSON.stringify(value)) { if (before === undefined) delete bai[key]; else bai[key] = clone(before); }
                }
                throw new Error(`保存未完成，请重新读取核对；部分写入可能已落盘。${error.message}`);
            }
        } else {
            const bai = settings.baiBaiToolkit ??= {}; const root = bai.regexListGroups ??= {}; const scopes = root.scopes ??= {};
            scopes[context.scopeKey] = value;
            try { await saveSettingsChecked(); }
            catch (error) { if (scopes[context.scopeKey] === value) { if (before === undefined) delete scopes[context.scopeKey]; else scopes[context.scopeKey] = before; } throw error; }
        }
    }
    function act(context, action) {
        run(async () => {
            const current = validate(context);
            if (action.type === 'toggle' && current.kind === 'regex') {
                const model = groupModel(current.value, current.kind);
                const members = current.scripts.filter(s => memberGroup(model, 'regex', String(s.id)) === action.groupId);
                if (!members.length) return;
                const disabled = !action.enabled, previous = members.map(s => [s, s.disabled]);
                for (const s of members) s.disabled = disabled;
                try { await regex.saveScriptsByType(current.scripts, current.type); await saveSettingsChecked(); }
                catch (error) { for (const [s, old] of previous) if (s.disabled === disabled) s.disabled = old; throw new Error(`正则保存未完成，请重新读取核对。${error.message}`); }
                // 保持原生授权不变，也不广播伪预设切换；已有聊天显示遵循原生刷新流程。
            } else {
                const next = changeGroups(current.value, current.kind, action, current.entries);
                await persist(current, next);
            }
        });
    }
    async function batch(context, target = UNGROUPED) {
        const model = groupModel(context.value, context.kind);
        const result = await choose('批量调整分组（不改变执行顺序）', form => {
            const select = node('select', 'text_pole'); select.append(new Option('未分组', UNGROUPED));
            for (const g of model.groups) select.append(new Option(g.name || g.id, g.id)); select.value = target; form.append(select);
            const list = node('div', 'pcm-ng-picker'); const checks = [];
            for (const entry of context.entries) {
                const label = node('label', 'pcm-ng-choice'), input = node('input'); input.type = 'checkbox'; input.value = entry.id;
                label.append(input, document.createTextNode(entry.name)); list.append(label); checks.push(input);
            }
            form.append(button('全选 / 清空', '切换全部选择', () => { const checked = checks.some(c => !c.checked); checks.forEach(c => c.checked = checked); }), list);
            return () => ({ type: 'assign', groupId: select.value, ids: checks.filter(c => c.checked).map(c => c.value) });
        });
        if (result?.ids.length) act(context, result);
    }
    function clean(list) {
        list.querySelectorAll('[data-pcm-ng]').forEach(el => el.remove());
        list.querySelectorAll('.pcm-ng-hidden,.pcm-ng-off').forEach(el => el.classList.remove('pcm-ng-hidden', 'pcm-ng-off'));
        list.classList.remove(ROOT);
    }
    function render(context) {
        const { list, kind } = context;
        let toolbar = list.previousElementSibling;
        if (!toolbar?.classList.contains('pcm-ng-toolbar')) { toolbar = node('div', 'pcm-ng-toolbar'); list.before(toolbar); }
        const owner = baiOwns(kind), enabled = owns(kind);
        const signature = JSON.stringify([context.key, context.value, context.entries, owner, enabled, busy]);
        const rows = [...list.children].filter(el => kind === 'preset' ? el.hasAttribute('data-pm-identifier') : el.classList.contains('regex-script-label'));
        const old = signatures.get(list);
        if (old?.signature === signature && old.rows.length === rows.length && old.rows.every((r, i) => r === rows[i])) return;
        signatures.set(list, { signature, rows }); clean(list); toolbar.replaceChildren();
        const label = node('label', 'pcm-ng-choice'), toggle = node('input'); toggle.type = 'checkbox'; toggle.checked = prefs()[kind] !== false; toggle.disabled = busy || owner;
        toggle.addEventListener('change', () => run(async () => {
            const before = clone(settings[PREF]); settings[PREF] = { ...prefs(), [kind]: toggle.checked };
            try { await saveSettingsChecked(); } catch (error) { settings[PREF] = before; throw error; }
        }));
        label.append(toggle, document.createTextNode('酒馆盒子分组')); toolbar.append(label);
        if (owner) { toolbar.append(node('small', '', '由柏宝箱管理；关闭其对应分组功能后可使用盒子分组')); return; }
        if (!enabled) return;
        const model = groupModel(context.value, kind);
        list.classList.add(ROOT);
        toolbar.append(button('＋新建组', '创建分组', async () => { const name = await askName('新建分组'); if (name) act(context, { type: 'create', name }); }),
            button('批量归组', '选择条目并调整所属组', () => { void batch(context).catch(fail); }));
        const groups = new Map(model.groups.map(g => [g.id, g])), displayed = new Set(); let last = null;
        const makeHeader = (groupId, continuation = false) => {
            const g = groups.get(groupId), header = node(kind === 'preset' ? 'li' : 'div', 'pcm-ng-header'); header.dataset.pcmNg = 'header';
            if (!g) { header.append(node('span', '', '未分组')); return header; }
            const members = context.entries.filter(e => memberGroup(model, kind, e.id) === groupId);
            const collapse = button(g.collapsed ? '▸' : '▾', g.collapsed ? '展开分组' : '折叠分组', () => act(context, { type: 'collapse', groupId }));
            collapse.setAttribute('aria-expanded', String(!g.collapsed)); header.append(collapse, node('span', 'pcm-ng-title', `${g.name || g.id}${continuation ? '（续）' : ''} · ${members.length}`));
            const check = node('input'); check.type = 'checkbox'; check.title = kind === 'preset' ? '组总开关（保留成员自身开关）' : '批量切换组内正则（不改变原生授权）';
            check.checked = kind === 'preset' ? g.enabled !== false : members.length > 0 && members.every(e => e.enabled);
            check.indeterminate = kind === 'regex' && members.some(e => e.enabled) && members.some(e => !e.enabled);
            check.addEventListener('change', () => act(context, { type: 'toggle', groupId, enabled: check.checked })); header.append(check);
            header.append(button('改名', '重命名分组', async () => { const name = await askName('分组名称', g.name); if (name) act(context, { type: 'rename', groupId, name }); }),
                button('解散', '仅解散分组，保留全部条目', async () => {
                    const yes = await choose('解散分组？条目会保留在原位置。', form => { form.append(node('p', '', g.name)); return () => true; });
                    if (yes) act(context, { type: 'delete', groupId });
                }));
            header.addEventListener('pointerdown', e => e.stopPropagation()); header.addEventListener('click', e => e.stopPropagation()); return header;
        };
        for (const row of rows) {
            const id = kind === 'preset' ? row.getAttribute('data-pm-identifier') : row.id;
            if (!context.entries.some(e => e.id === id)) continue;
            const groupId = memberGroup(model, kind, id), group = groups.get(groupId);
            if (groupId !== last && (group || model.groups.length)) { row.before(makeHeader(groupId, displayed.has(groupId))); displayed.add(groupId); }
            last = groupId;
            row.classList.toggle('pcm-ng-hidden', Boolean(group?.collapsed)); row.classList.toggle('pcm-ng-off', kind === 'preset' && group?.enabled === false);
            if (model.groups.length) {
                const select = node('select', 'pcm-ng-select'); select.dataset.pcmNg = 'assign'; select.title = `调整“${context.entries.find(e => e.id === id)?.name}”所属分组`;
                select.setAttribute('aria-label', select.title); select.append(new Option('未分组', UNGROUPED));
                for (const g of model.groups) select.append(new Option(g.name || g.id, g.id)); select.value = groupId;
                select.addEventListener('change', e => { e.stopPropagation(); act(context, { type: 'assign', groupId: select.value, ids: [id] }); });
                for (const event of ['pointerdown', 'mousedown', 'click']) select.addEventListener(event, e => e.stopPropagation());
                row.append(select);
            }
            if (kind === 'regex') {
                const checkbox = row.querySelector('.disable_regex'), entry = context.entries.find(e => e.id === id);
                if (checkbox) checkbox.checked = !entry.enabled;
            }
        }
        for (const g of model.groups) if (!displayed.has(g.id)) list.append(makeHeader(g.id));
        for (const control of [...toolbar.querySelectorAll('button,input'), ...list.querySelectorAll('[data-pcm-ng] button,[data-pcm-ng] input,[data-pcm-ng="assign"]')]) control.disabled = busy;
    }
    function refresh() {
        scheduled = 0; observer.disconnect();
        try {
            const pm = openai.promptManager;
            const ready = owns('preset')
                ? installGroupGate(pm, () => openai.oai_settings?.extensions?.baibaiToolkit?.presetPromptGroups, () => owns('preset'))
                : typeof pm?.getPromptCollection === 'function';
            const preset = ready ? presetContext() : null; if (preset) render(preset);
            for (const [scope, id] of [['GLOBAL', 'saved_regex_scripts'], ['PRESET', 'saved_preset_scripts'], ['SCOPED', 'saved_scoped_scripts']]) {
                const list = document.getElementById(id); if (!list) continue;
                const context = regexContext(scope, list);
                if (context) render(context); else { clean(list); if (list.previousElementSibling?.classList.contains('pcm-ng-toolbar')) list.previousElementSibling.remove(); }
            }
        } catch (error) { console.warn('[原生分组] 当前列表暂不可用', error); }
        finally { observer.observe(document.body, { childList: true, subtree: true }); }
    }
    function schedule() { if (!scheduled) scheduled = setTimeout(refresh, 100); }
    observer = new MutationObserver(records => {
        if (records.some(r => !r.target.closest?.('.pcm-ng-dialog') && (r.target.closest?.('#regex_container,[id$="prompt_manager"]')
            || [...r.addedNodes].some(n => n.nodeType === 1 && (n.matches?.('#regex_container,[id$="prompt_manager"],[id$="prompt_manager_list"]') || n.querySelector?.('#regex_container,[id$="prompt_manager_list"]')))))) schedule();
    });
    document.addEventListener('change', schedule); // 包括柏宝箱设置与原生开关，稍后读取最终状态。
    for (const name of ['APP_READY', 'CHAT_CHANGED', 'OAI_PRESET_CHANGED_AFTER', 'SETTINGS_UPDATED', 'CHARACTER_EDITED']) {
        if (script.event_types?.[name]) script.eventSource.on(script.event_types[name], schedule);
    }
    refresh();
    return { refresh, owns };
}
