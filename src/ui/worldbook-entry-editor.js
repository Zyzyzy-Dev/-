// 世界书条目编辑与并排正文差异：隔离输入草稿，完整JSON保留未知字段，不访问宿主。
import {clone, diffLines, buildRows} from '../core.js';
import {normalizeWorkbenchBook} from '../worldbook-workbench.js';

export function openWorkbenchEntryEditor({parent, entry, peer, title, onSave, inline=false}) {
  const node=(tag,cls='',text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  const dialog=node(inline?'section':'dialog','pcm-wb-modal pcm-wb-entry-modal'+(inline?' pcm-wb-inline-editor':''));dialog.setAttribute('aria-label','编辑世界书条目');
  const form=node('form','pcm-wb-entry-form');form.method='dialog';
  const head=node('header','pcm-wb-modal-head');head.append(node('strong','',title));
  const close=node('button','','取消');close.type='button';close.addEventListener('click',()=>dialog.remove());head.append(close);
  const fields=node('div','pcm-wb-entry-fields'),error=node('p','pcm-wb-error');error.setAttribute('role','status');
  let draft=clone(entry), sync=()=>{};
  const bindings=[];
  function field(text,key,{type='text',options,rows,defaultValue='',min,max}={}) {
    const label=node('label','pcm-wb-field');label.append(node('span','',text));
    const input=node(options?'select':rows?'textarea':'input');input.setAttribute('aria-label',text);
    if(options)for(const [value,label] of options){const option=node('option','',label);option.value=String(value);input.append(option);}
    else if(rows){input.rows=rows;input.spellcheck=false;}else input.type=type;
    if(min!==undefined)input.min=String(min);if(max!==undefined)input.max=String(max);if(type==='number')input.step='any';
    if(type==='checkbox')input.classList.add('pcm-native-switch');
    bindings.push(()=>{const value=draft[key]??defaultValue;if(type==='checkbox')input.checked=Boolean(value);else input.value=Array.isArray(value)?value.join('\n'):String(value);});
    input.addEventListener(type==='checkbox'||options?'change':'input',()=>{
      if(type==='number' && !input.validity.valid)return;
      draft[key]=type==='checkbox'?input.checked:type==='number'||options?Number(input.value):key==='key'||key==='keysecondary'?input.value.split('\n').map(s=>s.trim()).filter(Boolean):input.value;
      sync();
    });label.append(input);fields.append(label);return {input,label};
  }
  field('条目名称','comment');
  const enabled=field('禁用此条目','disable',{type:'checkbox',defaultValue:false});
  const trigger=node('label','pcm-wb-field');trigger.append(node('span','','触发方式'));const triggerInput=node('select');triggerInput.setAttribute('aria-label','触发方式');
  for(const [value,text] of [['constant','🔵 常驻'],['keyword','🟢 关键词'],['vector','🟣 向量']]){const option=node('option','',text);option.value=value;triggerInput.append(option);}trigger.append(triggerInput);fields.append(trigger);
  const position=field('插入位置','position',{options:[[0,'角色定义前'],[1,'角色定义后'],[2,'作者注释前'],[3,'作者注释后'],[4,'指定深度 @D'],[5,'示例消息前'],[6,'示例消息后'],[7,'出口']],defaultValue:0});
  const depth=field('深度','depth',{type:'number',defaultValue:4,min:0});field('注入顺序','order',{type:'number',defaultValue:100});
  field('触发概率 %','probability',{type:'number',defaultValue:100,min:0,max:100});
  field('消息角色','role',{options:[[0,'system'],[1,'user'],[2,'assistant']],defaultValue:0});
  const content=field('条目正文','content',{rows:10});content.label.classList.add('pcm-wb-field-wide');
  field('主要关键词（每行一个）','key',{rows:3,defaultValue:[]});field('辅助关键词（每行一个）','keysecondary',{rows:3,defaultValue:[]});
  field('启用辅助关键词','selective',{type:'checkbox',defaultValue:false});
  field('关键词匹配逻辑','selectiveLogic',{options:[[0,'AND ANY'],[1,'NOT ALL'],[2,'NOT ANY'],[3,'AND ALL']],defaultValue:0});
  for(const [key,text,defaultValue] of [['useProbability','启用概率',true],['excludeRecursion','排除递归',false],['preventRecursion','阻止后续递归',false],['ignoreBudget','忽略预算',false]])field(text,key,{type:'checkbox',defaultValue});
  const jsonDetails=node('details','pcm-wb-json');jsonDetails.append(node('summary','','全部条目配置（JSON）'));
  const json=node('textarea');json.rows=12;json.spellcheck=false;json.setAttribute('aria-label','全部条目JSON');jsonDetails.append(json);
  const compare=node('details','pcm-wb-comparison');compare.append(node('summary','','查看两侧差异'));
  const compareBody=node('div');compare.append(compareBody);
  function renderCompare(){
    compareBody.replaceChildren();
    if(!peer){compareBody.append(node('p','','另一侧没有自动配对条目。'));return;}
    const columns=node('div','pcm-wb-diff-columns');
    const operations=buildRows(diffLines(draft.content,peer.content));
    for(const side of ['left','right']){
      const column=node('section');column.append(node('h4','',side==='left'?'当前编辑':('另一侧 · '+(peer.comment||'未命名条目'))));
      const pre=node('div','pcm-wb-diff-text');
      for(const row of operations){if(side==='left'&&row.t==='+'||side==='right'&&row.t==='-')continue;
        const line=node('div','pcm-wb-diff-line'+(row.t==='-'?' is-removed':row.t==='+'?' is-added':''));
        for(const seg of row.segs){if(side==='left'&&seg.t==='+'||side==='right'&&seg.t==='-')continue;line.append(node('span',seg.t==='-'?'pcm-wb-removed':seg.t==='+'?'pcm-wb-added':'',seg.text));}
        if(!line.textContent)line.append(document.createTextNode('\u00a0'));pre.append(line);
      }column.append(pre);columns.append(column);
    }compareBody.append(columns);
    const differences=node('dl','pcm-wb-setting-diff');
    for(const key of new Set([...Object.keys(draft),...Object.keys(peer)])){
      if(['uid','displayIndex','content'].includes(key)||JSON.stringify(draft[key])===JSON.stringify(peer[key]))continue;
      differences.append(node('dt','',key),node('dd','',JSON.stringify(draft[key])+' → '+JSON.stringify(peer[key])));
    }if(differences.childNodes.length){compareBody.append(node('h4','','配置差异'),differences);}
  }
  const syncDepth=()=>{depth.input.disabled=Number(draft.position??0)!==4;depth.input.dataset.unavailable=String(depth.input.disabled);};
  const refresh=()=>{for(const bind of bindings)bind();triggerInput.value=draft.constant?'constant':draft.vectorized?'vector':'keyword';syncDepth();};
  sync=()=>{if(!json.validity.customError)json.value=JSON.stringify(draft,null,2);syncDepth();if(compare.open)renderCompare();};
  triggerInput.addEventListener('change',()=>{draft.constant=triggerInput.value==='constant';draft.vectorized=triggerInput.value==='vector';sync();});
  compare.addEventListener('toggle',()=>{if(compare.open)renderCompare();});
  json.addEventListener('input',()=>{try{const next=JSON.parse(json.value);if(String(next.uid)!==String(entry.uid))throw Error('条目UID不可修改');normalizeWorkbenchBook({entries:{[entry.uid]:next}});draft=next;json.setCustomValidity('');refresh();if(compare.open)renderCompare();}catch(e){json.setCustomValidity(e.message||'请输入有效JSON');}});
  const actions=node('div','pcm-wb-actions');const save=node('button','pcm-wb-primary','应用到草稿');save.type='submit';actions.append(save);
  form.addEventListener('submit',e=>{e.preventDefault();if(!form.reportValidity())return;try{normalizeWorkbenchBook({entries:{[entry.uid]:draft}});onSave(clone(draft));inline?dialog.remove():dialog.close();}catch(e){error.textContent=e.message;}});
  form.addEventListener('invalid',e=>{e.target.closest('details')?.setAttribute('open','');},true);
  dialog.addEventListener('click',e=>e.stopPropagation());dialog.addEventListener('keydown',e=>e.stopPropagation());if(!inline)dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  refresh();sync();form.append(head,fields,jsonDetails,compare,error,actions);dialog.append(form);parent.append(dialog);if(!inline)dialog.showModal();
  return dialog;
}
