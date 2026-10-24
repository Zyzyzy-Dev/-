// 预设源码检查上下文：只读收集草稿、有效启用条目和可确定的源码段。
import { findPromptOrderEntry } from './core.js';
import { blockedPrompts } from './native-groups.js';
export function collectCheckContext(preset, { drafts = new Map(), generationType = 'normal' } = {}) {
    const prompts = (preset?.prompts || []).map(p => {
        const d = drafts.get(p.identifier) || {}, v = { ...p, ...d };
        // The existing select shows only the first imported trigger. Merely opening
        // a form or editing its content must not narrow the imported trigger set.
        const originalTriggers = Array.isArray(p.injection_trigger) ? p.injection_trigger : [];
        const triggerChanged = Object.hasOwn(d, 'trigger') && d.trigger !== String(originalTriggers[0] || '');
        const triggers = triggerChanged ? (d.trigger ? [d.trigger] : []) : v.injection_trigger;
        return { id: p.identifier, name: String(v.name || p.identifier), text: String(v.content || ''), role: v.role || 'system', marker: Boolean(v.marker),
            injection_position: Number(v.injection_position || 0), injection_depth: Number(v.injection_depth ?? 4), injection_order: Number(v.injection_order ?? 100),
            enabled: v.enabled !== false, triggers: Array.isArray(triggers) ? [...triggers] : [] };
    });
    // core 的选择器会补齐缺失 prompt_order；传入隔离容器，不改原预设。
    const selected = findPromptOrderEntry({ prompts: preset?.prompts || [], prompt_order: preset?.prompt_order || [] });
    const order = selected?.order || [], byId = new Map(prompts.map(e => [e.id, e]));
    if (!order.some(o => byId.has(typeof o === 'string' ? o : o?.identifier))) return { entries: prompts, streams: [], uncertainties: ['没有有效启用顺序，仅检查逐条源码符号。'] };
    const blocked = blockedPrompts(preset?.extensions?.baibaiToolkit?.presetPromptGroups);
    const entries = [], seen = new Set();
    for (const row of order) {
        const id = typeof row === 'string' ? row : row?.identifier, e = byId.get(id);
        if (!e || seen.has(id)) continue;
        seen.add(id);
        const enabled = typeof row === 'object' && typeof row.enabled === 'boolean' ? row.enabled : e.enabled;
        if (!enabled || blocked.has(id) || (e.triggers.length && !e.triggers.includes(generationType)) || ![0, 1].includes(e.injection_position)) continue;
        entries.push(e);
    }
    const streams = [], uncertainties = [], relative = { id: 'relative', kind: 'relative', fragments: [] };
    const source = e => ({ type: 'source', entryId: e.id, start: 0, end: e.text.length, text: e.text });
    for (const e of entries) {
        if (e.marker) { relative.fragments.push({ type: 'boundary', entryId: e.id, reason: '宿主 marker 内容未检查' }); uncertainties.push('宿主 marker 内容未检查'); }
        else if (e.injection_position === 0) relative.fragments.push(source(e));
        else {
            const id = `depth:${e.injection_depth}:${e.injection_order}:${e.role}`;
            let stream = streams.find(s => s.id === id);
            if (!stream) { stream = { id, kind: 'depth', depth: e.injection_depth, order: e.injection_order, role: e.role, fragments: [{ type: 'boundary', reason: '聊天深度注入与聊天及其他角色之间的顺序未知' }] }; streams.push(stream); }
            stream.fragments.push(source(e));
        }
    }
    for (const stream of streams) { stream.fragments.push({ type: 'boundary', reason: '聊天深度注入边界' }); }
    if (streams.length) uncertainties.push('聊天深度段独立检查，未模拟最终聊天顺序。');
    if (relative.fragments.length) streams.unshift(relative);
    return { entries, streams, uncertainties: [...new Set(uncertainties)] };
}
