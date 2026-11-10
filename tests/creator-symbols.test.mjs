// 符号编辑回归：保留选区外文本、换行、Unicode 与模板宏，计划可交由现有适配器撤销。
import test from 'node:test';
import assert from 'node:assert/strict';
import {CREATOR_SYMBOLS,planCreatorSymbol} from '../src/features/preset/creator-symbols.js';
import {applySourceEdit} from '../src/features/preset/random-macros.js';
import {createContentEditorState,recordContentChange,undoContentChange} from '../src/features/preset/content-editor-state.js';

test('all paired symbols wrap only the exact selected text without interpreting macros',()=>{
  const text='之前😀{{getvar::角色}}之后',start=2,end=text.length-2;
  for(const {id,open,close} of CREATOR_SYMBOLS.filter(x=>x.open)){
    const edit=planCreatorSymbol(text,start,end,id),result=applySourceEdit(text,edit);
    assert.equal(result.text,'之前'+open+'😀{{getvar::角色}}'+close+'之后');
    assert.equal(result.text.slice(result.selectionStart,result.selectionEnd),edit.replacement);
  }
});
test('prefixes preserve CRLF and blank lines, including a selection ending at a line boundary',()=>{
  const text='前言\r\n第一行\r\n\r\n  \r\n第二行\r\n后记';
  for(const {id,prefix} of CREATOR_SYMBOLS.filter(x=>x.prefix)){
    const result=applySourceEdit(text,planCreatorSymbol(text,4,text.length-2,id));
    assert.equal(result.text,'前言\r\n'+prefix+'第一行\r\n\r\n  \r\n'+prefix+'第二行\r\n后记');
  }
});
test('mid-line selection inserts at its start and does not rewrite unselected text',()=>{
  const text='不要改前面，选中这里，别动后面';
  assert.equal(applySourceEdit(text,planCreatorSymbol(text,6,10,'h2')).text,'不要改前面，## 选中这里，别动后面');
});
test('each symbol operation has one reversible content history step',()=>{
  const text='abc\ndef',state=createContentEditorState(text),result=applySourceEdit(text,planCreatorSymbol(text,0,7,'list'));
  const changed=recordContentChange(state,result.text,{start:result.selectionStart,end:result.selectionEnd});
  assert.equal(undoContentChange(changed).text,text);
});
test('stale plans, empty or invalid selections and unknown symbols cannot overwrite text',()=>{
  const edit=planCreatorSymbol('原文',0,2,'bold');assert.throws(()=>applySourceEdit('新原文',edit));
  for(const [text,start,end,id] of [['abc',1,1,'bold'],[' \n',0,2,'h1'],['abc',-1,2,'h1'],['abc',0,4,'h1'],['abc',0,2,'bad']])assert.throws(()=>planCreatorSymbol(text,start,end,id));
});
