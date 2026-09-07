// 快照资源纯逻辑：保存世界书配置与正则开关，按稳定标识恢复并保留当前正文和新增记录。
const copy = value => JSON.parse(JSON.stringify(value));
const reserved = new Set(['__proto__', 'prototype', 'constructor']);
const contentFields = new Set(['uid', 'content', 'comment']);
function object(value) {return value && typeof value === 'object' && !Array.isArray(value);}
function safeJson(value) {
  if (value === null || ['string','boolean'].includes(typeof value)) return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (!value || typeof value !== 'object') throw new Error('配置必须是有效 JSON');
  for (const [key, child] of Object.entries(value)) {
    if (reserved.has(key)) throw new Error('配置含不支持的字段');
    safeJson(child);
  }
}
function unique(items, key) {
  if (!Array.isArray(items)) throw new Error('快照资源列表无效');
  const seen = new Set();
  for (const item of items) {
    const id = item?.[key];
    if (typeof id !== 'string' || !id || seen.has(id)) throw new Error('快照资源标识缺失或重复');
    seen.add(id);
  }
}
function worldRecords(data) {
  if (!object(data?.entries)) throw new Error('世界书条目格式无效');
  const records = Object.entries(data.entries).map(([key, entry]) => {
    if (!object(entry)) throw new Error('世界书条目格式无效');
    return {uid:String(entry.uid ?? key),key,entry};
  });
  unique(records,'uid'); return records;
}
export function captureWorldEntries(name, data) {
  return {name, entries:worldRecords(data).map(({uid,entry}) => ({
    uid, name:String(entry.comment || uid),
    settings:copy(Object.fromEntries(Object.entries(entry).filter(([key])=>!contentFields.has(key)))),
  }))};
}
export function restoreWorldEntries(saved, current) {
  const data=copy(current), records=new Map(worldRecords(data).map(record=>[record.uid,record]));
  unique(saved.entries,'uid'); const missing=[];
  for (const item of saved.entries) {
    validateWorldSettings(item.settings);
    const record=records.get(item.uid);
    if (!record) {missing.push(item.name || item.uid);continue;}
    Object.assign(record.entry,copy(item.settings));
  }
  return {data,missing};
}
function regexId(script) {return String(script?.id || (script?.scriptName ? 'name:'+script.scriptName : ''));}
export function captureRegexSwitches(scripts) {
  if (!Array.isArray(scripts)) throw new Error('正则列表格式无效');
  const result=scripts.map(script=>({id:regexId(script),name:String(script.scriptName || script.id || ''),enabled:script.disabled !== true}));
  unique(result,'id');return result;
}
export function restoreRegexSwitches(saved, current) {
  unique(saved,'id');const scripts=copy(current), records=new Map();
  captureRegexSwitches(scripts);
  for (const script of scripts) records.set(regexId(script),script);
  const missing=[];
  for (const item of saved) {
    if (typeof item.enabled !== 'boolean') throw new Error('正则开关格式无效');
    const script=records.get(item.id);
    if (script) script.disabled=!item.enabled;else missing.push(item.name || item.id);
  }
  return {scripts,missing};
}
function validateWorldSettings(settings) {
  if (!object(settings)) throw new Error('世界书配置格式无效');
  safeJson(settings);
  if (Object.keys(settings).some(key=>contentFields.has(key))) throw new Error('快照只保存条目配置，不能修改正文、名称或 UID');
  for (const field of ['disable','constant','vectorized','selective','useProbability','excludeRecursion','preventRecursion','delayUntilRecursion']) {
    // delayUntilRecursion also accepts a numeric recursion level in newer hosts.
    if (field === 'delayUntilRecursion' && typeof settings[field] === 'number') continue;
    if (settings[field] !== undefined && typeof settings[field] !== 'boolean') throw new Error('世界书 '+field+' 必须是布尔值');
  }
  for (const field of ['position','depth','order','probability']) if (settings[field] !== undefined && !Number.isFinite(settings[field])) throw new Error('世界书 '+field+' 必须是数字');
  for (const field of ['key','keysecondary']) if (settings[field] !== undefined && (!Array.isArray(settings[field]) || settings[field].some(key=>typeof key!=='string'))) throw new Error('世界书关键词必须是文本数组');
}
export function validateSnapshotResources(resources) {
  if (!object(resources) || !object(resources.worlds) || !object(resources.regex)) throw new Error('快照资源格式无效');
  safeJson(resources);
  const names=new Set();
  for (const scope of ['global','character','chat']) {
    const values=resources.worlds[scope];
    if (!Array.isArray(values) || values.some(name=>typeof name!=='string'||!name) || new Set(values).size!==values.length || (scope==='chat'&&values.length>1)) throw new Error('世界书挂载列表无效（聊天最多一本）');
    values.forEach(name=>names.add(name));
  }
  unique(resources.worldEntries,'name');
  for (const book of resources.worldEntries) {
    if (!names.has(book.name)) throw new Error('世界书配置与挂载列表不一致');
    unique(book.entries,'uid');
    for (const entry of book.entries) validateWorldSettings(entry.settings);
  }
  if (resources.worldEntries.length!==names.size) throw new Error('所选世界书配置尚未读取完成');
  for (const scope of ['global','preset','character']) {
    unique(resources.regex[scope],'id');
    if (resources.regex[scope].some(item=>typeof item.enabled!=='boolean')) throw new Error('正则开关格式无效');
  }
  return resources;
}
