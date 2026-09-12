// API 字段隔离、导入白名单与输入校验回归，不包含真实地址或用户密钥。
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeApiProfile, planApiSwitch, importApiProfiles } from '../src/api-manager.js';
const profile = { id: 'scheme-a', name: '测试 API', source: 'custom', model: 'new-model', connection: { custom_url: 'https://example.com/v1' }, secretId: 'key-a' };
const settings = { chat_completion_source: 'custom', custom_model: 'old-model', custom_url: 'https://old.example/v1', preset_settings_openai: '保留预设', temp_openai: 1.2, prompts: [{ content: '不可变更' }], custom_include_body: '保留' };
test('仅 API 只生成地址与密钥变更，模型及预设不变', () => {
  const before = structuredClone(settings), plan = planApiSwitch(settings, profile, 'api');
  assert.deepEqual(plan.patch, { custom_url: profile.connection.custom_url });
  assert.equal(plan.secretId, 'key-a'); assert.deepEqual(settings, before);
});
test('仅模型不切地址、密钥、预设或生成参数', () => {
  const plan = planApiSwitch(settings, profile, 'model');
  assert.deepEqual(plan.patch, { custom_model: 'new-model' }); assert.equal(plan.secretId, null);
});
test('组合切换也只允许两个字段，拒绝跨来源与非法模式', () => {
  assert.deepEqual(planApiSwitch(settings, profile, 'both').patch, { custom_url: profile.connection.custom_url, custom_model: 'new-model' });
  assert.throws(() => planApiSwitch({ ...settings, chat_completion_source: 'claude' }, profile, 'both'));
  assert.throws(() => planApiSwitch(settings, profile, 'preset'));
});
test('导入旧脚本只读取方案数据，不携带脚本、明文密钥、预设或正则', () => {
  const [result] = importApiProfiles({ content: 'throw Error("must not execute")', data: { apiQuickSwitcher: { schemes: [{ ...profile, secret: 'private', snapshot: { presetName: '不要切换' }, connection: { ...profile.connection, prompts: '不应写入' } }] } } });
  assert.notEqual(result.id, profile.id); assert.equal(result.secretId, profile.secretId);
  assert.equal(result.snapshot, undefined); assert.equal(result.secret, undefined); assert.deepEqual(result.connection, profile.connection);
});
test('无效导入整批拒绝，URL 不接受脚本协议及内嵌凭据', () => {
  for (const url of ['javascript:alert(1)', 'https://user:pass@example.com', 'https://example.com?key=private']) assert.throws(() => normalizeApiProfile({ ...profile, connection: { custom_url: url } }));
  assert.throws(() => importApiProfiles({ profiles: [profile, { ...profile, source: 'unknown' }] }));
});
