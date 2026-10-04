// 组装器拒绝模型越权、严格保留原文与已有字段，并验证变量执行顺序。
import test from 'node:test';import assert from 'node:assert/strict';
import { assembleStitch, makeStitchInput } from '../src/features/preset/ai-stitch/core.js';
const base=()=>({unknown:{keep:1},prompts:[{identifier:'a',name:'定义',content:'{{setvar::tone::}}',role:'system'},{identifier:'b',name:'读取',content:'前\r\n{{getvar::tone}} 后',role:'system'}],prompt_order:[{character_id:100001,order:[{identifier:'a',enabled:true},{identifier:'b',enabled:true}]}],extensions:{baibaiToolkit:{presetPromptGroups:{groups:[{id:'g',name:'组',enabled:true}],prompts:{a:{groupId:'g'},b:{groupId:'g'}}}},regex_scripts:[{x:1}]}});
const input=(content=' \r\n中文😀\n{{user}}\r\n ' )=>makeStitchInput(base(),[{id:'s',name:'来源',content}], '指导','session',1);
const plan=(i,extra={})=>({schemaVersion:1,sessionId:i.sessionId,revision:i.revision,items:[{sourceId:'s',anchorId:'a',placement:'after',groupId:'g',mode:'direct',role:'system',reason:'相关',...extra}]});
test('多种 Unicode/CRLF/嵌套宏原文与非目标字段逐字保留',()=>{const i=input(),before=structuredClone(i);const r=assembleStitch(i,plan(i));assert.equal(r.preset.prompts.find(p=>!['a','b'].includes(p.identifier)).content,i.sources[0].content);assert.deepEqual(r.preset.prompts.filter(p=>['a','b'].includes(p.identifier)),i.baseline.prompts);assert.deepEqual(r.preset.unknown,{keep:1});assert.deepEqual(r.preset.extensions.regex_scripts,[{x:1}]);assert.deepEqual(i,before);});
test('模型不能提供正文、未知ID、重复或遗漏材料、任意补丁',()=>{const i=input();for(const mutate of [p=>p.items[0].content='改写',p=>p.items[0].anchorId='fake',p=>p.items.push({...p.items[0]}),p=>p.items=[],p=>p.patch={}]){const p=plan(i);mutate(p);assert.throws(()=>assembleStitch(i,p));}});
test('addvar使用本地原文包裹且已有正文不变',()=>{const i=input();const r=assembleStitch(i,plan(i,{mode:'append',variable:'tone',scope:'local'}));assert.equal(r.preset.prompts[1].content,'{{addvar::tone::'+i.sources[0].content+'}}');assert.deepEqual(r.preset.prompts[2],i.baseline.prompts[1]);});
test('变量读前定义、禁用组、边界混淆、同名定义被拒绝',()=>{let i=input();assert.throws(()=>assembleStitch(i,plan(i,{mode:'append',variable:'tone',scope:'local',anchorId:'b'})));i=input('unbalanced }}');assert.throws(()=>assembleStitch(i,plan(i,{mode:'append',variable:'tone',scope:'local'})));i=input();i.baseline.extensions.baibaiToolkit.presetPromptGroups.groups[0].enabled=false;assert.throws(()=>assembleStitch(i,plan(i)));i=input();assert.throws(()=>assembleStitch(i,plan(i,{mode:'define',variable:'tone',scope:'local',readId:'b'})));});
test('定义新变量仅追加白名单读取宏，已有字串保持前缀完全一致',()=>{const i=input();const r=assembleStitch(i,plan(i,{mode:'define',variable:'new_tone',scope:'local',readId:'b'}));assert.equal(r.preset.prompts[2].content,i.baseline.prompts[1].content+'\r\n{{getvar::new_tone}}');assert.equal(r.changes.length,1);});
test('来源变量缺依赖不可默默修复，来源 set 不覆盖现有变量',()=>{for(const content of ['{{getvar::missing}}','{{setvar::tone::overwrite}}']){const i=input(content);assert.throws(()=>assembleStitch(i,plan(i)));}});
test('多个同锚点材料保持输入顺序且ID唯一，取消材料不保存',()=>{const i=input();i.sources.push({id:'s2',name:'重名',content:'第二'});const p=plan(i);p.items.push({...p.items[0],sourceId:'s2'});let r=assembleStitch(i,p);assert.deepEqual(r.preset.prompts.slice(1,3).map(x=>x.content),[i.sources[0].content,'第二']);assert.equal(new Set(r.preset.prompts.map(x=>x.identifier)).size,4);r=assembleStitch(i,p,new Set(['s2']));assert.equal(r.preset.prompts.length,3);});
test('会话修订不匹配和待处理项阻止保存',()=>{const i=input();assert.throws(()=>assembleStitch(i,{...plan(i),revision:2}));assert.throws(()=>assembleStitch(i,plan(i,{mode:'pending',reason:'无合适位置'})));});
test('追加后被重新定义覆盖、条件依赖、嵌套变量定义均拒绝',()=>{
 let i=input();i.baseline.prompts[1].content='{{setvar::tone::reset}}{{getvar::tone}}';assert.throws(()=>assembleStitch(i,plan(i,{mode:'append',scope:'local',variable:'tone'})));
 i=input('{{getvar::tone}}');i.baseline.prompts[0].injection_trigger=['normal'];assert.throws(()=>assembleStitch(i,plan(i,{anchorId:'b',placement:'before'})));
 i=input('{{getvar::tone}}');i.baseline.prompts[0].content='{{if::x::{{setvar::tone::x}}}}';assert.throws(()=>assembleStitch(i,plan(i)));
});
test('来源条件写入和定义自身读取不被当作无条件初始化',()=>{
 for(const content of ['{{if::false::{{setvar::fresh::x}}}}{{getvar::fresh}}','<% if(false){ %>{{setvar::fresh::x}}<% } %>{{getvar::fresh}}']){const i=input(content);assert.throws(()=>assembleStitch(i,plan(i)));}
 const i=input('{{getvar::fresh}}');assert.throws(()=>assembleStitch(i,plan(i,{mode:'define',variable:'fresh',scope:'local',readId:'b'})));
});
