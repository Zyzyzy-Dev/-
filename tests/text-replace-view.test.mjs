// 查找替换条目视图回归：候选与范围分离、完整分组成员和安全全文预览。
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReplacementView, createEntryReplacementPreview} from '../src/features/preset/ui/text-replace-view.js';

const entries = [
  {identifier: 'a', name: 'Alpha', content: 'first needle\nlast needle'},
  {identifier: 'b', name: 'needle name', content: 'hidden member'},
  {identifier: 'c', name: 'Third', content: '<b>NEEDLE</b>'},
];
const context = {entries, orderedIds: ['c', 'a', 'b'], groups: [{id: 'g', name: 'Group', ids: ['a', 'b']}]};

test('empty query lists every entry in preset order, retaining complete group membership', () => {
  const view = buildReplacementView(context, {query: '', fields: ['content'], caseSensitive: true});
  assert.deepEqual(view.entries.map(item => item.id), ['c', 'a', 'b']);
  assert.deepEqual(view.candidates.map(item => item.id), ['c', 'a', 'b']);
  assert.deepEqual(view.groups.find(group => group.id === 'g').ids, ['a', 'b']);
});

test('live candidates follow enabled fields and case but never local target selection', () => {
  const view = buildReplacementView({...context, selectedIds: ['b']}, {query: 'needle', fields: ['content'], caseSensitive: true});
  assert.deepEqual(view.candidates.map(item => item.id), ['a']);
  assert.deepEqual(view.groups.find(group => group.id === 'g').ids, ['a', 'b']);
  assert.deepEqual(buildReplacementView(context, {query: 'needle', fields: ['name'], caseSensitive: true}).candidates.map(item => item.id), ['b']);
  assert.deepEqual(buildReplacementView(context, {query: 'needle', fields: ['content'], caseSensitive: false}).candidates.map(item => item.id), ['c', 'a']);
  assert.equal(buildReplacementView(context, {query: 'needle', fields: [], caseSensitive: true}).candidates.length, 0);
});

test('whole group IDs include hidden members and entries beyond a page', () => {
  const items = Array.from({length: 81}, (_, i) => ({identifier: String(i), name: 'Entry', content: i % 2 ? 'other' : 'needle'}));
  const view = buildReplacementView({entries: items, groups: [{id: 'g', ids: items.map(item => item.identifier)}]}, {query: 'needle', fields: ['content']});
  assert.equal(view.groups[0].ids.length, 81);
  assert.equal(view.candidates.length, 41);
});

test('group order follows the preset rather than metadata creation order', () => {
  const view = buildReplacementView({...context, groups: [{id: 'later', ids: ['a', 'b']}, {id: 'first', ids: ['c']}]});
  assert.deepEqual(view.groups.map(group => group.id), ['first', 'later']);
  assert.deepEqual(view.groups[1].entries.map(item => item.id), ['a', 'b']);
  const ungroupedFirst = buildReplacementView(context);
  assert.deepEqual(ungroupedFirst.groups.map(group => group.id), ['__ungrouped__', 'g']);
});

test('groups and ungrouped entries follow their first member in actual preset order', () => {
  const view = buildReplacementView({...context, groups: [{id: 'g', ids: ['b', 'a']}]});
  assert.deepEqual(view.groups.map(group => group.id), ['__ungrouped__', 'g']);
  assert.deepEqual(view.groups[1].entries.map(item => item.id), ['a', 'b']);
});

test('missing and duplicate IDs cannot become individually selectable rows', () => {
  const view = buildReplacementView({entries: [...entries, {...entries[0]}, {name: 'missing', content: 'needle'}]}, {query: 'needle', fields: ['content']});
  assert.equal(view.invalidCount, 3);
  assert.ok(view.entries.filter(item => item.id === 'a' || item.id === '').every(item => !item.selectable));
  assert.equal(new Set(view.entries.map(item => item.key)).size, 5);
});

test('preview freezes exact plan and returns whole changed text without mutating originals', () => {
  const original = JSON.stringify(entries);
  const preview = createEntryReplacementPreview(entries, {query: 'needle', replacement: '$&\nNEW', fields: ['content'], caseSensitive: true});
  assert.equal(preview.afterById.get('a').content, 'first $&\nNEW\nlast $&\nNEW');
  assert.equal(preview.afterById.has('b'), false);
  assert.equal(preview.plan.matches.length, 2);
  assert.equal(Object.isFrozen(preview.plan), true);
  assert.equal(Object.isFrozen(preview.plan.matches[0]), true);
  assert.equal(JSON.stringify(entries), original);
});

test('duplicate IDs fail preview atomically instead of guessing a target', () => {
  const duplicate = [...entries, {...entries[0]}];
  const original = JSON.stringify(duplicate);
  assert.throws(() => createEntryReplacementPreview(duplicate, {query: 'needle', replacement: 'x', fields: ['content']}), /重复/);
  assert.equal(JSON.stringify(duplicate), original);
});
