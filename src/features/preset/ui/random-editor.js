// random 原生 textarea 分块视图；完整源码输入框仍为唯一表单字段。
import {createRandomEditorState,partitionRandomSource,updateRandomBlock} from '../random-editor-state.js';
import {scanRandomMacros,planRandomAppend} from '../random-macros.js';
export function installRandomEditor({container,adapter,scan=scanRandomMacros,append=planRandomAppend}) {
 const area=adapter.area, doc=area.ownerDocument, wrap=area.closest('.pcm-editwrap') || area;
 const root=doc.createElement('div'); root.className='pcm-random-editor'; root.hidden=true;
 const tools=doc.createElement('div');tools.className='pcm-random-editor-tools';
 const undo=doc.createElement('button');undo.type='button';undo.className='menu_button';undo.textContent='撤销';undo.addEventListener('click',()=>adapter.undo());tools.append(undo);
 const hint=doc.createElement('span');hint.textContent='跨块选择请切回完整源码；空白候选可能抽到空白内容';tools.append(hint);
 const body=doc.createElement('div');root.append(tools,body);container.append(root);
 let enabled=false,state=createRandomEditorState(adapter.getText(),scan),detach=null,composing=false,local=false,active=null,scroll=0,originalHidden=wrap.hidden;
 const selection=()=>active&&active.isConnected?{start:Number(active.dataset.start)+active.selectionStart,end:Number(active.dataset.start)+active.selectionEnd}:state.selection;
 function focusRange(start,end){
  const targets=[...body.querySelectorAll('textarea')], field=targets.find(a=>start>=Number(a.dataset.start)&&end<=Number(a.dataset.end));
  state.selection={start,end};
  if(field){active=field;field.focus();field.setSelectionRange(start-Number(field.dataset.start),end-Number(field.dataset.start));}
  else {api.setEnabled(false);adapter.setSelection(start,end);area.focus();}
 }
 function rebuild(text,sel){
  if(composing)return; const hadFocus=body.contains(doc.activeElement);
  state={...state,text,blocks:partitionRandomSource(text,scan),selection:sel,pendingReparse:false};
  const previous=new Map([...body.children].map(n=>[n.dataset.key,n])); const fragment=doc.createDocumentFragment();
  for(const block of state.blocks){
   let section=previous.get(block.key);if(!section){section=doc.createElement('section');section.dataset.key=block.key;const field=doc.createElement('textarea');field.spellcheck=false;field.placeholder='在此输入正文';field.setAttribute('aria-label',block.type==='random'?'random 宏源码':'普通正文');section.append(field);
    field.addEventListener('focus',()=>{active=field;});
    field.addEventListener('select',()=>{state.selection=selection();});
    field.addEventListener('beforeinput',()=>adapter.captureBeforeInput(selection()));
    field.addEventListener('compositionstart',()=>{adapter.captureBeforeInput(selection());composing=true;field._pcmGroup=`ime-${Date.now()}`;});
    field.addEventListener('input',()=>{
     const key=section.dataset.key,b=state.blocks.find(x=>x.key===key);if(!b)return;
     const sel={start:b.start+field.selectionStart,end:b.start+field.selectionEnd};
     state=updateRandomBlock(state,key,field.value,sel,{composing}).state;
     for(const node of body.querySelectorAll('textarea')){const current=state.blocks.find(x=>x.key===node.parentElement.dataset.key);if(current){node.dataset.start=current.start;node.dataset.end=current.end;}}
     const now=Date.now();if(!field._pcmTyping || now-(field._pcmLastInput||0)>750)field._pcmTyping=`typing-${key}-${now}`;field._pcmLastInput=now;local=true;adapter.updateText(state.text,sel,{group:field._pcmGroup || field._pcmTyping,deferRender:true});local=false;
     const button=section.querySelector('button');if(button){const parsed=scan(field.value);const complete=(Array.isArray(parsed)?parsed:parsed.macros || []).some(m=>m.start===0&&m.end===field.value.length&&m.complete!==false);button.disabled=!complete;button.textContent=complete?'＋ 增加候选':'宏未闭合或不受支持，请编辑源码';}
    });
    field.addEventListener('compositionend',()=>{composing=false;field._pcmGroup=null;rebuild(state.text,selection());focusRange(state.selection.start,state.selection.end);});
    field.addEventListener('blur',()=>{if(!composing&&state.pendingReparse)rebuild(state.text,selection());});
   }
   section.className=`pcm-random-block pcm-random-block-${block.type}`; const field=section.querySelector('textarea');
   field.dataset.start=block.start;field.dataset.end=block.end;if(field.value!==block.text)field.value=block.text;
   field.rows=Math.min(18,Math.max(block.type==='random'?3:1,block.text.split('\n').length));
   section.querySelector('button')?.remove();
   if(block.type==='random'){const button=doc.createElement('button');button.type='button';button.className='menu_button pcm-random-add';button.textContent=block.complete?'＋ 增加候选':'宏未闭合，请先编辑源码';button.disabled=!block.complete;
    button.addEventListener('pointerdown',e=>e.preventDefault());button.addEventListener('mousedown',e=>e.preventDefault());button.addEventListener('click',()=>{try{adapter.replace(append(adapter.getText(),state.blocks.find(b=>b.key===section.dataset.key)?.start));const s=adapter.getSelection();focusRange(s.start,s.end);}catch(error){hint.textContent=error.message;}});section.append(button);}
   fragment.append(section);
  }
  body.replaceChildren(fragment);if(hadFocus)focusRange(sel.start,sel.end);
 }
 const unsubscribe=()=>{};
 const api={
  setEnabled(value){value=Boolean(value);if(value===enabled)return;
   if(value){state.selection=adapter.getSelection();scroll=area.scrollTop;enabled=true;root.hidden=false;wrap.hidden=true;detach=adapter.attachView({getSelection:selection,focusRange,render:rebuild});focusRange(state.selection.start,state.selection.end);}
   else{const sel=selection();enabled=false;detach?.();detach=null;root.hidden=true;wrap.hidden=originalHidden;area.scrollTop=scroll;adapter.setSelection(sel.start,sel.end);area.focus();}
   area.dispatchEvent(new doc.defaultView.CustomEvent('pcm-random-mode',{bubbles:true,detail:{enabled}}));
  },isEnabled:()=>enabled,
  dispose(){if(enabled)api.setEnabled(false);unsubscribe();root.remove();if(area._pcmRandomEditor===api)delete area._pcmRandomEditor;}
 };
 area._pcmRandomEditor=api;return api;
}
