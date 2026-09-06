// 设置快照纯逻辑：捕获两层开关、按稳定 ID 制定恢复计划及解析聊天/角色绑定，不访问宿主。
import { createIdentifier } from './core.js';

export function normalizeSnapshotName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) throw new Error('快照名称须为 1–120 个字符');
  return value.trim();
}

function names(value) {
  if (!Array.isArray(value) || value.some(name => typeof name !== 'string' || !name)) throw new Error('世界书挂载数据无效，请重新保存快照');
  return [...new Set(value)];
}

function uniqueRecords(value, key) {
  if (!Array.isArray(value)) throw new Error('快照开关数据无效');
  const ids = new Set();
  for (const item of value) {
    if (!item || typeof item[key] !== 'string' || !item[key] || ids.has(item[key]) || typeof item.enabled !== 'boolean') throw new Error('快照存在无效或重复的开关记录');
    ids.add(item[key]);
  }
  return value;
}

export function snapshotOrder(settings, characterId) {
  if (characterId === null || characterId === undefined || !['string', 'number'].includes(typeof characterId)) throw new Error('当前预设条目列表尚未就绪');
  const nodes = (settings?.prompt_order || []).filter(node => String(node?.character_id) === String(characterId));
  if (nodes.length !== 1 || !Array.isArray(nodes[0].order)) throw new Error('当前预设条目节点缺失或重复，无法安全恢复');
  return nodes[0].order;
}

export function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot.id !== 'string' || !snapshot.id || typeof snapshot.presetName !== 'string' || !snapshot.presetName) throw new Error('快照数据无效，请重新保存');
  normalizeSnapshotName(snapshot.name);
  if (!['string', 'number'].includes(typeof snapshot.orderCharacterId)) throw new Error('快照预设节点无效');
  uniqueRecords(snapshot.entries, 'identifier');
  uniqueRecords(snapshot.groups, 'id');
  names(snapshot.worldNames);
  return snapshot;
}

export function captureSnapshot({ id = createIdentifier(), name, presetName, settings, orderCharacterId, groupState, worldNames, now = Date.now() }) {
  const labels = new Map((settings?.prompts || []).map(p => [p.identifier, String(p.name || p.identifier)]));
  const snapshot = {
    id, name: normalizeSnapshotName(name), presetName, orderCharacterId,
    createdAt: now, updatedAt: now,
    entries: snapshotOrder(settings, orderCharacterId).map(item => ({identifier: item?.identifier, name: labels.get(item?.identifier) || String(item?.identifier || ''), enabled: item?.enabled === true})),
    groups: (groupState?.groups || []).map(group => ({id: String(group.id || ''), name: String(group.name || group.id), enabled: group.enabled !== false})),
    worldNames: names(worldNames),
  };
  return validateSnapshot(snapshot);
}

export function planSnapshotRestore(snapshot, { settings, orderCharacterId, groupState, worldNames }) {
  validateSnapshot(snapshot);
  if (String(snapshot.orderCharacterId) !== String(orderCharacterId)) throw new Error('快照与当前预设的条目节点不同，请重新保存快照');
  const order = snapshotOrder(settings, orderCharacterId);
  const ids = new Set(order.map(entry => entry?.identifier));
  if (ids.size !== order.length) throw new Error('当前条目列表存在重复 ID，无法安全恢复');
  const groupIds = new Set((groupState?.groups || []).map(group => String(group.id)));
  const availableBooks = new Set(names(worldNames));
  return {
    entries: snapshot.entries.filter(entry => ids.has(entry.identifier)).map(({identifier, enabled}) => ({identifier, enabled})),
    groups: snapshot.groups.filter(group => groupIds.has(group.id)).map(({id, enabled}) => ({id, enabled})),
    worldNames: snapshot.worldNames.filter(name => availableBooks.has(name)),
    missingEntries: snapshot.entries.filter(entry => !ids.has(entry.identifier)).map(entry => entry.name || entry.identifier),
    missingGroups: snapshot.groups.filter(group => !groupIds.has(group.id)).map(group => group.name || group.id),
    missingWorldNames: snapshot.worldNames.filter(name => !availableBooks.has(name)),
  };
}

export function resolveSnapshotBinding(store, chatSnapshotId, characterKey) {
  const snapshots = Array.isArray(store?.snapshots) ? store.snapshots : [];
  const chat = snapshots.find(s => s.id === chatSnapshotId);
  if (chat) return {snapshot: chat, source: 'chat'};
  const id = characterKey && Object.hasOwn(store?.characterBindings || {}, characterKey) ? store.characterBindings[characterKey] : null;
  const character = id && snapshots.find(s => s.id === id);
  return character ? {snapshot: character, source: 'character'} : null;
}
