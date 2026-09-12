// API 方案的数据校验与字段级切换计划；不访问宿主、不保存密钥明文或预设快照。
import { createIdentifier } from './core.js';

export const API_STORE_KEY = 'preset_compare_api_manager';
export const API_SOURCES = Object.freeze({
  custom: { label: '自定义（兼容 OpenAI）', model: 'custom_model', selector: '#custom_model_id', secret: 'api_key_custom', fields: ['custom_url'] },
});

export function normalizeApiProfile(value) {
  if (!value || typeof value !== 'object') throw new Error('API 方案格式无效');
  const source = String(value.source || 'custom');
  const config = API_SOURCES[source];
  if (!config) throw new Error('此 API 来源暂不支持');
  const name = String(value.name || '').trim();
  const model = String(value.model || '').trim();
  if (!name || name.length > 100) throw new Error('方案名称需为 1–100 个字符');
  if (!model || model.length > 500 || /[\r\n\0]/.test(model)) throw new Error('请输入有效的模型名称');
  const connection = {};
  for (const key of config.fields) connection[key] = String(value.connection?.[key] ?? (key === 'custom_url' ? value.apiUrl || '' : '')).trim();
  if (source === 'custom') {
    let url;
    try { url = new URL(connection.custom_url); } catch { throw new Error('请输入完整的 API 地址（http:// 或 https://）'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) throw new Error('API 地址必须为 HTTP(S)，不能包含账号、密码、查询参数或片段');
  }
  return { id: String(value.id || createIdentifier()), name, source, model, connection,
    secretId: String(value.secretId || ''), updatedAt: Number(value.updatedAt) || Date.now() };
}

export function planApiSwitch(settings, profile, mode) {
  if (!['api', 'model', 'both'].includes(mode)) throw new Error('请选择仅切 API、仅切模型或 API＋模型');
  const item = normalizeApiProfile(profile), config = API_SOURCES[item.source];
  if (settings.chat_completion_source !== item.source) throw new Error('请先在酒馆选择与方案相同的聊天补全来源');
  const patch = {};
  if (mode !== 'model') Object.assign(patch, item.connection);
  if (mode !== 'api') patch[config.model] = item.model;
  return { patch, secretKey: config.secret, secretId: mode === 'model' ? null : item.secretId };
}

export function importApiProfiles(value) {
  // Read data only: the script's content/buttons/snapshot fields are never executed or restored.
  const candidates = value?.profiles ?? value?.apiQuickSwitcher?.schemes ?? value?.data?.apiQuickSwitcher?.schemes;
  if (!Array.isArray(candidates) || !candidates.length || candidates.length > 500) throw new Error('文件中没有可导入的 API 方案（最多 500 个）');
  return candidates.map(item => normalizeApiProfile({ ...item, id: createIdentifier() }));
}
