// 调用真实编辑器拖入函数，验证副本落点/分组、实际开关、草稿引用和整批撤回。
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clone,createIdentifier,findPromptOrderEntry} from '../src/features/preset/core.js';
import {createSameIdDropCopy} from '../src/features/preset/prompt-drop-copy.js';

const source=readFileSync(new URL('../src/ui/app.js',import.meta.url),'utf8');
function range(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return source.slice(a,b);}
const line=start=>range(start,'\n');
const code=[range('function moveSnapshot(','function setFreeSelect('),range('function movePrompt(','let outerScrollTouch='),range('function assignPromptToGroup(','function togglePromptGroup('),range('function getBaiBaiGroupState(','function prepareGroupDrag('),range('function applyDropGroup(','function onDragOver('),line('function promptEnabled('),line('function orderArray('),line('function syncOrderEnabled('),line('function rebuildCache('),line('function undoLast(')].join('\n');
const makePreset=(content,enabled)=>({
  prompts:[{identifier:'same',name:'角色要求',content,enabled:!enabled,unknown:{keep:true}},{identifier:'tail',name:'末尾',content:'tail'}],
  prompt_order:[{character_id:100001,order:[{identifier:'same',enabled},{identifier:'tail',enabled:true}]}],
  extensions:{baibaiToolkit:{presetPromptGroups:{groups:[{id:'g',name:'原组'},{id:'h',name:'目标组'}],prompts:{same:{groupId:'g'},tail:{groupId:'h'}}}}}
});
function harness({overwrite=false,counterpart='same'}={}){
  const state={old:makePreset('source',false),new:makePreset('target',true),cache:{maps:{},ordered:{}},dirty:{old:false,new:false},dragged:{old:new Set(),new:new Set()},history:[]};
  const preferences={overwriteSameIdOnDrop:overwrite};
  const deps={state,editorPreferences:preferences,clone,createIdentifier,createSameIdDropCopy,promptOrderEntry:findPromptOrderEntry,listOrderIndex:{},rebuildComparisonCache(){},byId:side=>state.cache.maps[side],counterpartId:()=>counterpart,pushUndo:action=>state.history.push(action),renderList(){},renderAll(){},hideCompare(){},updateUndoButton(){},pcmToastr:{success(){},warning(){}},snapshotGroupChange:side=>state.history.push(api.moveSnapshot(side))};
  const api=new Function(...Object.keys(deps),code+'\nrebuildCache();return {movePrompt,movePrompts,assignPromptToGroup,placeDroppedPrompts:typeof placeDroppedPrompts==="function"?placeDroppedPrompts:null,moveSnapshot,undoLast};')(...Object.values(deps));
  return {state,preferences,...api};
}
test('same-id drag off inserts a copy at the requested position and keeps original object drafts',()=>{
  const h=harness(),original=h.state.new.prompts[0],sourcePrompt=h.state.old.prompts[0],drafts=new WeakMap([[original,{content:'pending target'}],[sourcePrompt,{content:'pending source'}]]);
  const id=h.movePrompt('old','new','same','tail');
  assert.notEqual(id,'same');assert.equal(h.state.new.prompts.find(p=>p.identifier==='same'),original);
  assert.deepEqual(h.state.new.prompt_order[0].order.map(p=>p.identifier),['same',id,'tail']);
  assert.equal(h.state.new.prompts.find(p=>p.identifier===id).name,'角色要求（1）');
  assert.equal(h.state.new.prompts.find(p=>p.identifier===id).enabled,false);assert.equal(h.state.new.prompt_order[0].order.find(p=>p.identifier===id).enabled,false);
  assert.equal(drafts.get(original).content,'pending target');assert.equal(drafts.get(sourcePrompt).content,'pending source');
  h.undoLast();assert.equal(h.state.new.prompts.length,2);assert.equal(h.state.new.prompts[0],original);assert.equal(drafts.get(original).content,'pending target');
});
test('default enabled drag retains safe overwrite and same-side reorder never duplicates',()=>{
  const h=harness({overwrite:true});assert.equal(h.movePrompt('old','new','same','tail'),'same');
  assert.equal(h.state.new.prompts.length,2);assert.equal(h.state.new.prompts[0].content,'source');
  h.preferences.overwriteSameIdOnDrop=false;const original=h.state.new.prompts[0];h.movePrompt('new','new','same',null);
  assert.equal(h.state.new.prompts.length,2);assert.equal(h.state.new.prompts.at(-1),original);assert.equal(original.name,'角色要求');
});
test('group assignment creates the numbered copy and leaves existing member in its group',()=>{
  const h=harness(),original=h.state.new.prompts[0];h.assignPromptToGroup('old','new','same','h');
  const copy=h.state.new.prompts.find(p=>!['same','tail'].includes(p.identifier)),meta=h.state.new.extensions.baibaiToolkit.presetPromptGroups;
  assert(copy);assert.equal(copy.name,'角色要求（1）');assert.equal(meta.prompts[copy.identifier].groupId,'h');assert.equal(meta.prompts.same.groupId,'g');
  assert.equal(h.state.new.prompts.find(p=>p.identifier==='same'),original);
});
test('row drop places only the new target IDs in the destination group and batch undo restores originals',()=>{
  const h=harness(),original=h.state.new.prompts[0];assert(h.placeDroppedPrompts,'shared row-drop commit must exist');
  const mapping=h.placeDroppedPrompts('old','new',['same','tail'],null,'h');
  assert.equal(mapping.size,2);assert.notEqual(mapping.get('same'),'same');assert.notEqual(mapping.get('tail'),'tail');
  const meta=h.state.new.extensions.baibaiToolkit.presetPromptGroups;
  assert.equal(meta.prompts.same.groupId,'g');assert.equal(meta.prompts[mapping.get('same')].groupId,'h');
  assert.equal(h.state.history.length,1);h.undoLast();assert.equal(h.state.new.prompts.length,2);assert.equal(h.state.new.prompts[0],original);assert.equal(h.state.new.extensions.baibaiToolkit.presetPromptGroups.prompts.same.groupId,'g');
});
test('enabled mode keeps ambiguous same-ID pairing safe and disabled mode does not overwrite another counterpart',()=>{
  const h=harness({overwrite:true,counterpart:null});const id=h.movePrompt('old','new','same',null);assert.notEqual(id,'same');assert.equal(h.state.new.prompts.find(p=>p.identifier==='same').content,'target');
  const off=harness({counterpart:'tail'}),tail=off.state.new.prompts[1],copyId=off.movePrompt('old','new','same',null);assert(!['same','tail'].includes(copyId));assert.equal(off.state.new.prompts.find(p=>p.identifier==='tail'),tail);
});
test('cross-side same-ID drop keeps the target boundary instead of using the source next row',()=>{
  const code=range('function processDragAt(','function onTouchEnd('),list={dataset:{list:'new'}},targetRow={dataset:{dragId:'same',dragSide:'new'}},sourceRow={dataset:{dragId:'same',dragSide:'old'}};
  const hit={closest:selector=>selector==='.pcm-list'?list:selector==='.pcm-row'?targetRow:null};let excluded;
  const deps={document:{elementFromPoint:()=>hit},dragIdsFor:()=>null,clearDropMarker(){},markDropTarget:(row,event,ids)=>{excluded=ids;return 'same';},nextOrderedRowId:()=> 'source-next',groupIdForRow:()=>null};
  const run=new Function(...Object.keys(deps),code+';return processDragAt;')(...Object.values(deps));
  const drag={holding:true,mx:100,my:100,x:0,y:0,row:sourceRow};run(drag);
  assert.equal(drag.beforeId,'same');assert.equal(drag.targetSide,'new');assert.equal(excluded,null);
});
