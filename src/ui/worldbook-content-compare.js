// 自选世界书条目正文对比：隔离两份正文、差异预览与显式保存，不修改配置。
import {diffLines,buildRows} from '../core.js';

export function openWorldbookContentCompare({parent,items,onSave,onClose}) {
  const node=(tag,cls='',text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  const dialog=node('dialog','pcm-wb-modal pcm-wb-compare-modal');dialog.setAttribute('aria-label','世界书正文对比');
  const head=node('header','pcm-wb-modal-head');head.append(node('strong','','世界书正文对比'));
  const close=node('button','','取消');close.type='button';close.addEventListener('click',()=>dialog.close());head.append(close);
  const actions=node('div','pcm-wb-actions'),toggle=node('button','','编辑正文'),save=node('button','pcm-wb-primary','保存正文到草稿');toggle.type=save.type='button';toggle.setAttribute('aria-pressed','false');actions.append(toggle,save);
  const hint=node('p','pcm-wb-hint','红色为第一条独有内容，绿色为第二条独有内容。正文保存到对应草稿后，点击世界书的“保存”写回酒馆。');
  const columns=node('div','pcm-wb-diff-columns'),editors=[],previews=[],initialValues=[];let editing=false;
  items.forEach((item,index)=>{
    const column=node('section','pcm-wb-compare-column');column.append(node('h4','',item.title));
    const input=node('textarea','pcm-wb-compare-input');input.value=item.content;input.spellcheck=false;input.setAttribute('aria-label',index===0?'第一条正文':'第二条正文');input.hidden=true;editors.push(input);
    initialValues.push(input.value);
    const preview=node('div','pcm-wb-diff-text');preview.tabIndex=0;preview.setAttribute('aria-label',index===0?'第一条差异':'第二条差异');previews.push(preview);column.append(input,preview);columns.append(column);
  });
  function render(){
    const rows=buildRows(diffLines(editors[0].value,editors[1].value));
    previews.forEach((pre,index)=>{
      pre.replaceChildren();
      for(const row of rows){
        if(index===0&&row.t==='+'||index===1&&row.t==='-')continue;
        const changed=row.t!==' ';
        const line=node('div','pcm-wb-diff-line'+(changed?(index===0?' is-removed':' is-added'):''));
        for(const seg of row.segs){if(index===0&&seg.t==='+'||index===1&&seg.t==='-')continue;line.append(node('span',seg.t==='-'?'pcm-wb-removed':seg.t==='+'?'pcm-wb-added':'',seg.text));}
        if(!line.textContent)line.textContent='\u00a0';pre.append(line);
      }
      if(!rows.length)pre.append(node('p','pcm-wb-empty','正文为空'));
    });
  }
  toggle.addEventListener('click',()=>{editing=!editing;toggle.textContent=editing?'差异预览':'编辑正文';toggle.setAttribute('aria-pressed',String(editing));editors.forEach(el=>el.hidden=!editing);previews.forEach(el=>el.hidden=editing);if(editing)editors[0].focus();else render();});
  const error=node('p','pcm-wb-error');error.setAttribute('role','status');
  save.addEventListener('click',()=>{try{onSave(editors.map((el,index)=>el.value===initialValues[index]?items[index].content:el.value));dialog.close();}catch(e){error.textContent=e.message;}});
  dialog.addEventListener('click',e=>e.stopPropagation());dialog.addEventListener('keydown',e=>e.stopPropagation());dialog.addEventListener('close',()=>{dialog.remove();onClose?.();},{once:true});
  dialog.append(head,actions,hint,columns,error);parent.append(dialog);render();dialog.showModal();return dialog;
}
