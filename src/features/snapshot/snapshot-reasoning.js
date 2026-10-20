// 快照自动解析绑定：仅复制解析开关与格式字段，不保存或修改其他推理选项。
export const REASONING_FIELDS = ['auto_parse', 'name', 'prefix', 'suffix', 'separator'];

export function normalizeSnapshotReasoning(value) {
  if (!value || value.version !== 1 || typeof value.auto_parse !== 'boolean'
    || ['name', 'prefix', 'suffix', 'separator'].some(key => typeof value[key] !== 'string')) {
    throw new Error('自动解析设置无效，请重新绑定');
  }
  return {version:1, ...Object.fromEntries(REASONING_FIELDS.map(key => [key, value[key]]))};
}

export function captureSnapshotReasoning(reasoning) {
  return normalizeSnapshotReasoning({...reasoning, name:reasoning?.name ?? '', version:1});
}

export function sameSnapshotReasoning(reasoning, binding) {
  try {
    const current = captureSnapshotReasoning(reasoning), saved = normalizeSnapshotReasoning(binding);
    return REASONING_FIELDS.every(key => current[key] === saved[key]);
  } catch {return false;}
}
