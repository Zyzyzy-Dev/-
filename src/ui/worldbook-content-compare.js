// 自选世界书条目正文对比：直接在红框区域内联编辑正文，删除列标题h4，不弹出额外编辑窗口。

export function openWorldbookContentCompare({parent,items,onSave,onClose,onMerge}) {
  const node=(tag,cls='',text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  const dialog=node('dialog','pcm-wb-modal pcm-wb-compare-modal');dialog.setAttribute('aria-label','世界书正文对比');
  const head=node('header','pcm-wb-modal-head');head.append(node('strong','','世界书正文对比'));
  const close=node('button','','取消');close.type='button';close.addEventListener('click',()=>dialog.close());head.append(close);
  const actions=node('div','pcm-wb-actions');
  const copyA=node('button','','复制版本A正文');copyA.type='button';copyA.addEventListener('click',()=>{navigator.clipboard?.writeText(textareas[0].value).catch(()=>{});});
  const copyB=node('button','','复制版本B正文');copyB.type='button';copyB.addEventListener('click',()=>{navigator.clipboard?.writeText(textareas[1].value).catch(()=>{});});
  const save=node('button','pcm-wb-primary','确认');save.type='button';
  actions.append(copyA,copyB,save);
  const columns=node('div','pcm-wb-diff-columns'),textareas=[],initialValues=[];
  items.forEach((item,index)=>{
    const column=node('section','pcm-wb-compare-column');
    const editor=node('div','pcm-wb-compare-editor');
    const textarea=node('textarea','pcm-wb-compare-input');textarea.value=item.content;textarea.spellcheck=false;textarea.setAttribute('aria-label',index===0?'第一条正文':'第二条正文');
    textareas.push(textarea);initialValues.push(textarea.value);
    editor.append(textarea);column.append(editor);columns.append(column);
  });
  const bottom=node('div','pcm-wb-actions');
  const mergeDown=node('button','','向下合并');mergeDown.type='button';
  const mergeUp=node('button','','向上合并');mergeUp.type='button';
  const cancel=node('button','','取消');cancel.type='button';
  cancel.addEventListener('click',()=>dialog.close());
  mergeUp.addEventListener('click',()=>{try{onMerge(0,1,textareas[0].value,textareas[1].value);dialog.close();}catch(e){error.textContent=e.message;}});
  mergeDown.addEventListener('click',()=>{try{onMerge(1,0,textareas[1].value,textareas[0].value);dialog.close();}catch(e){error.textContent=e.message;}});
  bottom.append(mergeUp,mergeDown,cancel);
  const error=node('p','pcm-wb-error');error.setAttribute('role','status');
  save.addEventListener('click',()=>{try{onSave(textareas.map((el,index)=>el.value===initialValues[index]?items[index].content:el.value));dialog.close();}catch(e){error.textContent=e.message;}});
  dialog.addEventListener('click',e=>e.stopPropagation());dialog.addEventListener('keydown',e=>e.stopPropagation());dialog.addEventListener('close',()=>{dialog.remove();onClose?.();},{once:true});
  dialog.append(head,actions,columns,bottom,error);parent.append(dialog);dialog.showModal();return dialog;
}
