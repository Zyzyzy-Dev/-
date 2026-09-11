// 自选世界书条目正文对比：可直接编辑正文、保留差异标注并显式保存，不修改配置。
import {diffLines,buildRows} from '../core.js';

export function openWorldbookContentCompare({parent,items,onSave,onClose}) {
  const node=(tag,cls='',text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  const dialog=node('dialog','pcm-wb-modal pcm-wb-compare-modal');dialog.setAttribute('aria-label','世界书正文对比');
  const head=node('header','pcm-wb-modal-head');head.append(node('strong','','世界书正文对比'));
  const close=node('button','','取消');close.type='button';close.addEventListener('click',()=>dialog.close());head.append(close);
  const actions=node('div','pcm-wb-actions'),save=node('button','pcm-wb-primary','确认');save.type='button';actions.append(save);
  const columns=node('div','pcm-wb-diff-columns'),editors=[],previews=[],backdrops=[],initialValues=[];let editing=false;
  items.forEach((item,index)=>{
    const column=node('section','pcm-wb-compare-column');column.append(node('h4','',item.title));
    const editor=node('div','pcm-wb-compare-editor');
    const backdrop=node('div','pcm-wb-diff-text pcm-wb-diff-backdrop');backdrop.setAttribute('aria-hidden','true');
    const input=node('textarea','pcm-wb-compare-input');input.value=item.content;input.spellcheck=false;input.setAttribute('aria-label',index===0?'第一条正文':'第二条正文');
    const preview=node('div','pcm-wb-diff-text pcm-wb-compare-preview');preview.tabIndex=0;preview.setAttribute('aria-label',index===0?'第一条差异':'第二条差异');
    editors.push(input);backdrops.push(backdrop);previews.push(preview);initialValues.push(input.value);
    editor.append(backdrop,input);column.append(editor,preview);columns.append(column);
    preview.addEventListener('click',()=>enterEdit(index));
    input.addEventListener('input',render);input.addEventListener('scroll',()=>{backdrop.scrollTop=input.scrollTop;backdrop.scrollLeft=input.scrollLeft;});
  });
  function fillDiff(target,index){
    const rows=buildRows(diffLines(editors[0].value,editors[1].value));target.replaceChildren();
    for(const row of rows){if(index===0&&row.t==='+'||index===1&&row.t==='-')continue;const changed=row.t!==' ';const line=node('div','pcm-wb-diff-line'+(changed?(index===0?' is-removed':' is-added'):''));for(const seg of row.segs){if(index===0&&seg.t==='+'||index===1&&seg.t==='-')continue;line.append(node('span',seg.t==='-'?'pcm-wb-removed':seg.t==='+'?'pcm-wb-added':'',seg.text));}if(!line.textContent)line.textContent='\u00a0';target.append(line);}
    if(!target.childNodes.length)target.append(node('p','pcm-wb-empty','正文为空'));
  }
  function render(){fillDiff(previews[0],0);fillDiff(previews[1],1);fillDiff(backdrops[0],0);fillDiff(backdrops[1],1);}
  function enterEdit(index=0){if(editing)return;editing=true;dialog.classList.add('is-editing');previews.forEach(el=>el.hidden=true);editors.forEach(el=>el.hidden=false);render();editors[index].focus();}
  const error=node('p','pcm-wb-error');error.setAttribute('role','status');
  save.addEventListener('click',()=>{try{onSave(editors.map((el,index)=>el.value===initialValues[index]?items[index].content:el.value));dialog.close();}catch(e){error.textContent=e.message;}});
  dialog.addEventListener('click',e=>e.stopPropagation());dialog.addEventListener('keydown',e=>e.stopPropagation());dialog.addEventListener('close',()=>{dialog.remove();onClose?.();},{once:true});
  dialog.append(head,actions,columns,error);parent.append(dialog);render();dialog.showModal();return dialog;
}
