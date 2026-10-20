// Auto-parse bindings preserve exact formatting and reject malformed persisted data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {captureSnapshotReasoning, normalizeSnapshotReasoning, sameSnapshotReasoning} from '../src/features/snapshot/snapshot-reasoning.js';
import {validateSnapshot, selectSnapshotScope} from '../src/features/snapshot/snapshot.js';

const config={version:1,auto_parse:false,name:'自定义',prefix:'\r\n<think> ',suffix:' </think>\n',separator:'\n\n'};
test('binding preserves false and exact whitespace while excluding unrelated options',()=>{
  const saved=captureSnapshotReasoning({...config,auto_expand:true,max_additions:9,secret:'excluded'});
  assert.deepEqual(saved,config);assert.notEqual(saved,config);
  assert(sameSnapshotReasoning({...config,show_hidden:true},saved));
  assert(!sameSnapshotReasoning({...config,prefix:config.prefix.trim()},saved));
});
test('malformed reasoning records cannot silently become an active configuration',()=>{
  for(const value of [null,{}, {...config,version:2},{...config,auto_parse:'false'},{...config,suffix:null},{...config,name:42}])assert.throws(()=>normalizeSnapshotReasoning(value),/自动解析/);
});
test('old snapshots remain valid; bindings survive base scope filtering',()=>{
  const base={id:'s',name:'s',scope:{preset:false,worlds:true,regex:false},entries:[],groups:[],worldNames:[]};
  assert.equal(validateSnapshot(base),base);
  assert.deepEqual(selectSnapshotScope({...base,reasoning:config}).reasoning,config);
  assert.throws(()=>validateSnapshot({...base,reasoning:{...config,prefix:undefined}}),/自动解析/);
});
