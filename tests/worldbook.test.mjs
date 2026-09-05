// 世界书缝合回归：来源校验、正文完整性、开关/角色、插入位置、原数据隔离。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readWorldbook, stitchWorldbook } from '../src/worldbook.js';

const preset = () => ({
  temperature: 0.73,
  prompts: [{ identifier: 'a', content: 'existing' }, { identifier: 'b', content: 'end' }],
  prompt_order: [{ character_id: 7, order: [{ identifier: 'a', enabled: false }] },
    { character_id: 100001, order: [{ identifier: 'a', enabled: true }, { identifier: 'b', enabled: false }] }],
  extensions: { regex_scripts: [{ id: 'keep' }], presetEntryGroups: { anything: true } },
});
const book = () => ({ entries: {
  0: { comment: '<安全文本>', content: '  {{getvar::x}}\n\n', displayIndex: 1, disable: true, role: 2 },
  1: { name: '首条', content: '', displayIndex: 0, role: 'user' },
} });

test('worldbook reading preserves content, display order, names and disabled state', () => {
  const data = book(), before = structuredClone(data), items = readWorldbook(data, '测试');
  assert.deepEqual(items.map(item => item.name), ['首条', '<安全文本>']);
  assert.equal(items[0].content, '');
  assert.equal(items[1].content, '  {{getvar::x}}\n\n');
  assert.equal(items[1].enabled, false);
  assert.equal(items[1].source, '测试');
  assert.deepEqual(data, before);
  assert.equal(readWorldbook({ data: { character_book: { entries: [{ name: '角色书', content: 'x', enabled: false }] } } })[0].enabled, false);
});

test('worldbook parsing rejects script exports and malformed entries instead of importing script code', () => {
  assert.throws(() => readWorldbook({ type: 'script', content: 'throw new Error()' }), /缺少 entries/);
  assert.throws(() => readWorldbook({ entries: { a: null } }), /正文/);
  assert.throws(() => readWorldbook({ entries: { a: { content: 42 } } }), /正文/);
  assert.deepEqual(readWorldbook({ entries: {} }), []);
});

test('stitch inserts all selected entries before target, preserves metadata and only edits active order node', () => {
  const source = preset(), before = structuredClone(source);
  const result = stitchWorldbook(source, readWorldbook(book()), { beforeId: 'b' });
  const added = result.preset.prompts.slice(1, 3);
  assert.deepEqual(result.preset.prompts.map(item => item.identifier), ['a', ...result.identifiers, 'b']);
  assert.deepEqual(result.preset.prompt_order[1].order.slice(1, 3), added.map(({ identifier, enabled }) => ({ identifier, enabled })));
  assert.deepEqual(added.map(item => item.role), ['user', 'assistant']);
  assert.deepEqual(added.map(item => item.enabled), [true, false]);
  assert.ok(added.every(item => item.injection_position === 0 && item.marker === false));
  assert.equal(added[1].content, '  {{getvar::x}}\n\n');
  assert.deepEqual(result.preset.prompt_order[0], before.prompt_order[0]);
  assert.deepEqual(result.preset.extensions, before.extensions);
  assert.equal(result.preset.temperature, before.temperature);
  assert.deepEqual(source, before);
});

test('repeated imports receive independent IDs and do not overwrite same-name prompts', () => {
  const first = stitchWorldbook(preset(), readWorldbook(book()));
  const second = stitchWorldbook(first.preset, readWorldbook(book()), { keepDisabled: false });
  assert.equal(new Set([...first.identifiers, ...second.identifiers]).size, 4);
  assert.equal(second.preset.prompts.length, 6);
  assert.ok(second.preset.prompts.slice(-2).every(prompt => prompt.enabled));
  assert.equal(second.preset.prompt_order[1].order.at(-1).enabled, true);
});

test('missing order creates canonical node without activating previously uninjected entries', () => {
  const result = stitchWorldbook({ prompts: [{ identifier: 'unlinked' }] }, readWorldbook(book()));
  assert.equal(result.preset.prompt_order[0].character_id, 100001);
  assert.deepEqual(result.preset.prompt_order[0].order.map(item => item.identifier), result.identifiers);
  const fallback = stitchWorldbook({ prompts: [{ identifier: 'a' }], prompt_order: [{ character_id: 9, order: ['a'] }] }, readWorldbook(book()), { beforeId: 'a' });
  assert.equal(fallback.preset.prompt_order.length, 1);
  assert.equal(fallback.preset.prompt_order[0].order.at(-1), 'a');
});

test('invalid selection or stale insertion target never modifies the draft', () => {
  const source = preset(), before = structuredClone(source);
  assert.throws(() => stitchWorldbook(source, []), /勾选/);
  assert.throws(() => stitchWorldbook(source, readWorldbook(book()), { beforeId: 'missing' }), /失效/);
  assert.throws(() => stitchWorldbook(source, [{ content: 'ok' }, { content: null }]), /无效/);
  assert.deepEqual(source, before);
});
