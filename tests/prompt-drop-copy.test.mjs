// 同 ID 拖入副本：不改原条目、编号避重，并保留正文及未知条目设置。
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSameIdDropCopy} from '../src/features/preset/prompt-drop-copy.js';

const prompt=()=>({identifier:'same',name:'角色要求',content:'source text',role:'system',enabled:false,unknown:{nested:['retained']}});
test('disabled overwrite creates an independent named copy without mutating either preset',()=>{
  const source=prompt(),target={prompts:[{identifier:'same',name:'新版名称',content:'keep target'}]},before=structuredClone({source,target});
  const copy=createSameIdDropCopy(source,target,false);
  assert.notEqual(copy.identifier,source.identifier);assert.equal(copy.name,'角色要求（1）');
  assert.equal(copy.content,'source text');assert.equal(copy.enabled,false);assert.deepEqual(copy.unknown,source.unknown);
  copy.unknown.nested.push('copy only');assert.deepEqual({source,target},before);
});
test('successive copies choose the first unused numbered name',()=>{
  const source=prompt(),target={prompts:[{identifier:'same',name:'角色要求'},{identifier:'taken',name:'角色要求（2）'}]};
  const first=createSameIdDropCopy(source,target,false);target.prompts.push(first);
  const next=createSameIdDropCopy(source,target,false);target.prompts.push(next);
  assert.equal(first.name,'角色要求（1）');assert.equal(next.name,'角色要求（3）');
  assert.equal(new Set(target.prompts.map(p=>p.identifier)).size,4);
});
test('default overwrite and a free source ID do not request a duplicate',()=>{
  const source=prompt();
  assert.equal(createSameIdDropCopy(source,{prompts:[source]}),null);
  assert.equal(createSameIdDropCopy(source,{prompts:[source]},true),null);
  assert.equal(createSameIdDropCopy(source,{prompts:[{identifier:'other',name:source.name}]},false),null);
});
test('fresh IDs avoid dangling order references and metadata as well as existing prompts',()=>{
  const source=prompt(),target={prompts:[source],prompt_order:[{order:[{identifier:'order-only'},'string-order']}],extensions:{baibaiToolkit:{presetPromptGroups:{prompts:{'group-only':{}}}}}};
  const candidates=['same','order-only','string-order','group-only','fresh'];
  const copy=createSameIdDropCopy(source,target,false,()=>candidates.shift());
  assert.equal(copy.identifier,'fresh');
});
