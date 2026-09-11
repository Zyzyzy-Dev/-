// 双世界书工作台：独立草稿、对比编辑、拖拽迁移、预设转换及显式保存，仅通过宿主桥读写。
import {clone} from '../core.js';
import {normalizeWorkbenchBook,workbenchEntries,compareWorldbooks,transferWorldEntries,reorderWorldEntries,presetWorkbenchEntries,insertPresetWorldEntries,createWorkbenchEntry} from '../worldbook-workbench.js';
import {openWorkbenchEntryEditor} from './worldbook-entry-editor.js';
import {openWorldbookContentCompare} from './worldbook-content-compare.js';
import {installWorkbenchDrag} from './worldbook-workbench-drag.js';

const names={left:'左侧',right:'右侧'},other=side=>side==='left'?'right':'left';
const statusNames={same:'相同',content:'正文不同',settings:'配置不同',only:'独有'};
export function createWorkbenchSession(){return Object.fromEntries(['left','right'].map(side=>[side,{book:null,base:null,source:null,name:'',query:'',filter:'all',active:null,history:[],dirty:false}]));}

export function createWorldbookWorkbench({host,session=createWorkbenchSession(),onBack,onClose,onCycleTheme,themeIcon,prompt,confirm,toast}) {
  const node=(tag,cls='',text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  const element=node('main','pcm-wb-workbench');element.setAttribute('aria-label','世界书工作台');
  let disposed=false,busy=false,pairs=[],activeModal=null,compareMode=false,compareFirst=null;
  const views={};
  function button(text,action,cls=''){const b=node('button',cls,text);b.type='button';b.addEventListener('click',e=>{e.stopPropagation();action();});return b;}
  function option(select,value,text){const op=node('option','',text);op.value=value;select.append(op);}
  const header=node('header','pcm-wb-header');const back=button('',onBack);back.classList.add('pcm-wb-icon');back.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/></svg>';back.setAttribute('aria-label','返回首页');back.title='首页';const title=node('h2','','世界书工作台');
  const theme=button('',onCycleTheme);theme.innerHTML=themeIcon;theme.dataset.themeToggle='';theme.setAttribute('aria-label','切换配色');
  const close=button('×',()=>requestClose());close.setAttribute('aria-label','关闭插件');const compareToggle=button('对比',()=>{compareMode=!compareMode;compareFirst=null;compareToggle.setAttribute('aria-pressed',String(compareMode));render();});compareToggle.setAttribute('aria-pressed','false');compareToggle.title='对比正文；开启后依次点选两个条目';compareToggle.setAttribute('aria-label',compareToggle.title);const undoAll=iconButton('<path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 7"/>','统一撤回两侧',undoBoth);undoAll.title='统一撤回两侧最近一次操作';undoAll.classList.remove('pcm-wb-row-icon');undoAll.classList.add('pcm-wb-header-icon');header.append(back,title,compareToggle,undoAll,node('span','pcm-wb-header-space'),theme,close);
  const status=node('p','pcm-wb-status');status.setAttribute('role','status');
  const columns=node('div','pcm-wb-columns');element.append(header,status,columns);
  for(const side of ['left','right']){
    const panel=node('section','pcm-wb-pane');panel.dataset.side=side;panel.setAttribute('aria-label',names[side]+'世界书');
    const heading=node('h3'),source=node('p','pcm-wb-source');
    const actions=node('div','pcm-wb-actions');
    const fileLabel=node('label','pcm-wb-file','导入文件'),file=node('input');file.type='file';file.accept='.json,application/json';file.setAttribute('aria-label',names[side]+'导入世界书');fileLabel.append(file);
    file.addEventListener('change',()=>{const value=file.files[0];file.value='';if(value)void run(async()=>{const raw=JSON.parse(await value.text());const book=normalizeWorkbenchBook(raw);if(await canReplace(side))load(side,book,value.name.replace(/\.json$/i,''),null,null);});});
    actions.append(fileLabel,button('酒馆世界书',()=>void run(()=>chooseBook(side)),'pcm-wb-tavern'),button('新建',()=>void run(async()=>{const name=await prompt('新世界书名称','新世界书');if(name?.trim()&&await canReplace(side))load(side,{entries:{}},name.trim(),null,null);})),button('保存',()=>void run(()=>save(side,false)),'pcm-wb-primary'),button('另存',()=>void run(()=>save(side,true))),button('导出',()=>void run(()=>exportBook(side))));
    const tools=node('div','pcm-wb-actions');
    const add=button('＋ 条目',()=>void run(()=>{requireBook(side);const result=createWorkbenchEntry(session[side].book);edit(side,result.ids[0],result.book);}));
    const convert=button('预设',()=>void run(()=>openPresetConverter(side)));convert.title='预设导入世界书';convert.setAttribute('aria-label','预设');
    tools.append(add,convert);
    const searchRow=node('div','pcm-wb-search');const search=node('input');search.type='search';search.placeholder='搜索名称、正文、关键词';search.setAttribute('aria-label',names[side]+'搜索');search.value=session[side].query;
    search.addEventListener('input',()=>{session[side].query=search.value;renderList(side);});
    const filter=node('select');filter.setAttribute('aria-label',names[side]+'筛选');for(const [value,text] of [['all','全部'],['different','所有差异'],['same','相同'],['content','正文不同'],['settings','配置不同'],['only','独有'],['enabled','已开启'],['disabled','已关闭']])option(filter,value,text);filter.value=session[side].filter;filter.addEventListener('change',()=>{session[side].filter=filter.value;renderList(side);});searchRow.append(search,filter,tools);
    const list=node('div','pcm-wb-list');list.dataset.side=side;list.setAttribute('role','list');
    const listHeader=node('div','pcm-wb-entry-header');listHeader.append(node('span',''),node('span',''),node('span','pcm-wb-col-title','标题（备忘）'));const settingHeader=node('div','pcm-wb-entry-config');for(const [text,cls] of [['触发策略','pcm-wb-entry-trigger'],['插入位置','pcm-wb-entry-placement'],['深度','pcm-wb-entry-number'],['顺序','pcm-wb-entry-number'],['触发频率','pcm-wb-entry-number']])settingHeader.append(node('span',cls+' pcm-wb-col-setting',text));listHeader.append(settingHeader);panel.append(heading,source,actions,searchRow,listHeader,list);columns.append(panel);views[side]={panel,heading,source,list,listHeader,search,filter,add,convert};
  }
  function announce(message,error=false){status.textContent=message;status.classList.toggle('is-error',error);}
  function setBusy(value){busy=value;element.setAttribute('aria-busy',String(value));for(const control of element.querySelectorAll('button,input,select,textarea'))control.disabled=value||control.dataset.unavailable==='true'||control.dataset.intrinsicDisabled==='true';}
  async function run(action){if(busy||disposed)return;setBusy(true);announce('');try{await action();}catch(e){if(!disposed){announce(e.message,true);const message=activeModal?.querySelector('.pcm-wb-error');if(message)message.textContent=e.message;toast.error(e.message);}}finally{if(!disposed)setBusy(false);}}
  function requireBook(side){if(!session[side].book)throw Error('请先导入或新建'+names[side]+'世界书');}
  async function canReplace(side){return !session[side].dirty||await confirm(names[side]+'有未保存修改。放弃这侧草稿并载入另一份世界书？');}
  function load(side,book,name,source,base){if(disposed)return;compareFirst=null;Object.assign(session[side],{book,base,source,name,query:'',filter:'all',active:null,history:[],dirty:false});views[side].search.value='';views[side].filter.value='all';render();}
  function change(side,book){const s=session[side];s.history.push(clone(s.book));if(s.history.length>50)s.history.shift();s.book=book;s.dirty=true;render();}
  function undoBoth(){const restored=[];for(const side of ['left','right']){const s=session[side];if(s.history.length)restored.push([side,s.history.pop()]);}for(const [side,book] of restored)Object.assign(session[side],{book,dirty:true,active:null});if(restored.length)render();}
  function entry(side,id){return workbenchEntries(session[side].book||{entries:{}}).find(row=>row.id===String(id))?.entry;}
  function pair(side,id){return pairs.find(row=>row[side+'Id']===id);}
  function visible(side){const s=session[side],query=s.query.trim().toLowerCase();return workbenchEntries(s.book||{entries:{}}).filter(({id,entry})=>{
    const state=pair(side,id)?.status||'only';
    if(s.filter==='different'&&state==='same'||Object.keys(statusNames).includes(s.filter)&&state!==s.filter||s.filter==='enabled'&&entry.disable||s.filter==='disabled'&&!entry.disable)return false;
    return !query||[entry.comment,entry.content,...entry.key||[],...entry.keysecondary||[]].join('\n').toLowerCase().includes(query);
  });}
  function render(){
    if(disposed)return;pairs=compareWorldbooks(session.left.book||{entries:{}},session.right.book||{entries:{}});
    for(const side of ['left','right']){
      const s=session[side],v=views[side];v.heading.textContent=names[side]+' · '+(s.name||'未导入')+(s.dirty?' *':'');
      v.source.textContent=s.source?'酒馆世界书 · '+s.source:s.book?'本地草稿 · 保存时可另存到酒馆':'导入文件、读取酒馆或新建空白世界书';
      v.add.dataset.unavailable=v.convert.dataset.unavailable=String(!s.book);renderList(side);
    }undoAll.dataset.unavailable=String(!session.left.history.length&&!session.right.history.length);setBusy(busy);
  }
  function entryPositionValue(entry){return Number(entry.position??0)===4?'4:'+Number(entry.role??0):String(entry.position??0);}
  function updateEntry(side,id,mutate){return void run(()=>{const book=clone(session[side].book);mutate(book.entries[id]);change(side,book);});}
  function iconButton(paths,label,action){const item=node('button','pcm-wb-icon pcm-wb-row-icon');item.type='button';item.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>';item.setAttribute('aria-label',label);item.title=label;item.addEventListener('click',e=>{e.stopPropagation();action();});return item;}
  const positionOptions=[['0','角色定义前（↑Char）'],['1','角色定义后（↓Char）'],['5','示例消息前（↑EM）'],['6','示例消息后（↓EM）'],['2','作者注释前（↑AN）'],['3','作者注释后（↓AN）'],['4:0','[系统⚙] 插入深度 @D'],['4:1','[用户👤] 插入深度 @D'],['4:2','[AI🤖] 插入深度 @D'],['7','➡️ 锚点']];
  function renderList(side){
    const s=session[side],v=views[side],rows=visible(side),scroll=v.list.scrollTop;v.list.replaceChildren();
    const ids=new Set(workbenchEntries(s.book||{entries:{}}).map(r=>r.id));if(s.active&&!ids.has(s.active))s.active=null;
    for(const {id,entry:value} of rows){
      const row=node('article','pcm-wb-entry');row.dataset.wbId=id;row.setAttribute('role','listitem');row.classList.toggle('is-off',value.disable===true);row.classList.toggle('is-active',s.active===id);row.classList.toggle('is-compare-selected',compareMode&&compareFirst?.side===side&&compareFirst.id===id);
      const drag=button('⠿',()=>{} ,'pcm-wb-drag');drag.dataset.wbDrag='';drag.setAttribute('aria-label','拖动 '+(value.comment||'未命名条目'));drag.title='拖动把手调整位置；手机长按后拖动';
      const enabled=node('input','pcm-native-switch');enabled.type='checkbox';enabled.checked=!value.disable;enabled.setAttribute('aria-label','启用 '+(value.comment||'未命名条目'));
      enabled.addEventListener('change',()=>void run(()=>{const book=clone(s.book);book.entries[id].disable=!enabled.checked;change(side,book);}));
      const name=node('input','pcm-wb-entry-name');name.type='text';name.value=value.comment||'';name.placeholder='未命名条目';name.setAttribute('aria-label','标题（备忘） '+(value.comment||'未命名条目'));name.title=value.content?.slice(0,240)||'';name.addEventListener('change',()=>{const next=name.value.trim()||'未命名条目';if(next!==(value.comment||'未命名条目'))updateEntry(side,id,entry=>{entry.comment=next;});});
      const trigger=node('select','pcm-wb-entry-trigger');trigger.setAttribute('aria-label','触发策略 '+(value.comment||'未命名条目'));const triggerValue=value.constant?'constant':value.vectorized?'vector':'keyword';for(const [optionValue,text] of [['constant','🔵 常驻'],['keyword','🟢 关键词'],['vector','🟣 向量']]){const op=node('option','',text);op.value=optionValue;if(optionValue===triggerValue)op.selected=true;trigger.append(op);}
      trigger.addEventListener('change',()=>updateEntry(side,id,entry=>{entry.constant=trigger.value==='constant';entry.vectorized=trigger.value==='vector';}));
      const placement=node('select','pcm-wb-entry-placement');placement.setAttribute('aria-label','插入位置 '+(value.comment||'未命名条目'));for(const [optionValue,text] of positionOptions){const op=node('option','',text);op.value=optionValue;if(optionValue===entryPositionValue(value))op.selected=true;placement.append(op);}
      placement.addEventListener('change',()=>updateEntry(side,id,entry=>{const [position,role]=placement.value.split(':').map(Number);entry.position=position;if(position===4)entry.role=role;}));
      const numeric=(key,label,min,max,def)=>{const input=node('input','pcm-wb-entry-number');input.type='number';input.inputMode='numeric';input.value=value[key]??def;input.min=String(min);if(max!==undefined)input.max=String(max);input.setAttribute('aria-label',label+' '+(value.comment||'未命名条目'));input.addEventListener('change',()=>{const next=Number(input.value);if(Number.isFinite(next)&&next>=min&&(max===undefined||next<=max)&&next!==Number(value[key]??def))updateEntry(side,id,entry=>{entry[key]=next;});else input.value=value[key]??def;});return input;};
      const depth=numeric('depth','深度',0,undefined,4);depth.disabled=Number(value.position??0)!==4;if(depth.disabled)depth.value='';depth.dataset.intrinsicDisabled=String(depth.disabled);
      const state=pair(side,id)?.status||'only',badge=node('span','pcm-wb-badge '+state,statusNames[state]);
      const config=node('div','pcm-wb-entry-config');config.append(trigger,placement,depth,numeric('order','顺序',0,undefined,100),numeric('probability','触发频率',0,100,100),badge);
      config.append(iconButton('<path d="M16 4h4v4"/><path d="M20 4 10 14"/><path d="M18 14v6H4V6h6"/>','编辑条目内容',()=>edit(side,id)));
      config.append(iconButton('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>','复制条目',()=>void run(()=>{const result=transferWorldEntries(s.book,s.book,[id],{afterId:id});change(side,result.book);})));
      config.append(iconButton('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>','删除条目',()=>void run(async()=>{if(await confirm('删除此条目？可撤回。')){const book=clone(s.book);delete book.entries[id];change(side,book);}})));
      row.append(drag,enabled,name,config);row.addEventListener('click',e=>{if(e.target.closest('button,input')||!compareMode)return;selectEntry(side,id);});v.list.append(row);
    }
    if(!rows.length)v.list.append(node('p','pcm-wb-empty',s.book?'没有符合筛选的条目，可新增或从另一侧迁移。':'导入世界书后在这里查看条目。'));
    v.list.scrollTop=scroll;
    for(const control of v.list.querySelectorAll('[data-unavailable]'))control.disabled=busy||control.dataset.unavailable==='true';
  }
  function selectEntry(side,id){
    if(busy||activeModal)return;
    if(!compareMode){session[side].active=id;renderList(side);edit(side,id);return;}
    if(!compareFirst){compareFirst={side,id};render();announce('已选 '+(entry(side,id)?.comment||'未命名条目')+'，请选择第二个条目');return;}
    if(compareFirst.side===side&&compareFirst.id===id){compareFirst=null;render();announce('已取消选择，请选择第一个条目');return;}
    const selections=[compareFirst,{side,id}],originals=selections.map(item=>entry(item.side,item.id));
    if(originals.some(value=>!value)){compareFirst=null;render();return;}
    const editor=openWorldbookContentCompare({parent:element,items:selections.map((item,index)=>({title:names[item.side]+' · '+session[item.side].name+' · '+(originals[index].comment||'未命名条目'),content:originals[index].content||''})),onSave(contents){
      const books=new Map();
      selections.forEach((item,index)=>{const current=entry(item.side,item.id);if(!current||current.content!==originals[index].content)throw Error('条目正文已变化，请重新选择对比');if(contents[index]===(current.content||''))return;if(!books.has(item.side))books.set(item.side,clone(session[item.side].book));books.get(item.side).entries[item.id].content=contents[index];});
      for(const book of books.values())normalizeWorkbenchBook(book);
      for(const [side,book] of books)change(side,book);
      announce(books.size?'正文已保存到对应草稿，可撤回；点击世界书“保存”写回酒馆':'正文没有变化');
    },onClose(){if(activeModal===editor)activeModal=null;compareFirst=null;render();}});activeModal=editor;
  }
  function edit(side,id,initialBook=session[side].book){
    const value=workbenchEntries(initialBook).find(row=>row.id===String(id))?.entry;if(!value)return;
    const editor=openWorkbenchEntryEditor({parent:element,entry:value,title:names[side]+' · '+(value.comment||'未命名条目'),onSave(value){const book=clone(initialBook);book.entries[id]=value;change(side,normalizeWorkbenchBook(book));announce('条目修改已应用到草稿');}});
    activeModal=editor;editor.addEventListener('close',()=>{if(activeModal===editor)activeModal=null;},{once:true});
  }
  function modal(title){
    const dialog=node('dialog','pcm-wb-modal');dialog.setAttribute('aria-label',title);const head=node('header','pcm-wb-modal-head');head.append(node('strong','',title),button('关闭',()=>dialog.close()));
    const body=node('div','pcm-wb-modal-body'),error=node('p','pcm-wb-error'),actions=node('div','pcm-wb-actions');error.setAttribute('role','status');dialog.append(head,body,error,actions);element.append(dialog);activeModal=dialog;
    dialog.addEventListener('click',e=>e.stopPropagation());dialog.addEventListener('keydown',e=>e.stopPropagation());dialog.addEventListener('close',()=>{dialog.remove();if(activeModal===dialog)activeModal=null;},{once:true});dialog.showModal();return {dialog,body,actions};
  }
  async function chooseBook(side){
    const values=await host.request('list-worldbooks');if(disposed)return;if(!values.length)throw Error('酒馆中没有世界书，可导入文件或新建');
    const {dialog,body}=modal('选择酒馆世界书');dialog.classList.add('pcm-wb-picker-modal');
    const search=node('input');search.type='search';search.placeholder='搜索世界书名称';search.setAttribute('aria-label','搜索酒馆世界书');
    const list=node('div','pcm-wb-book-picker');
    function renderBooks(){list.replaceChildren();const shown=values.filter(name=>name.toLowerCase().includes(search.value.trim().toLowerCase()));
      for(const name of shown){const item=button(name,()=>void run(async()=>{const value=await host.request('workbench-read-worldbook',{name});if(disposed||!dialog.isConnected||!dialog.open)return;const book=normalizeWorkbenchBook(value.book);if(await canReplace(side)&&dialog.open){load(side,book,value.name,value.name,clone(value.book));dialog.close();}}),'pcm-wb-book-choice');list.append(item);}
      if(!shown.length)list.append(node('p','pcm-wb-empty','没有匹配的世界书'));
    }
    search.addEventListener('input',renderBooks);body.append(search,list);renderBooks();search.focus();
  }

  async function save(side,asNew){
    requireBook(side);const s=session[side];let name=s.source,create=asNew||!s.source;
    if(create){name=await prompt('另存世界书名称（不能与已有世界书重名）',s.name+(s.source?' 副本':''));if(name===null)return;name=name.trim();if(!name)throw Error('请输入世界书名称');}
    const result=await host.request('workbench-save-worldbook',{name,book:clone(s.book),base:create?null:clone(s.base),create});
    if(disposed)return;s.book=normalizeWorkbenchBook(result.book);s.base=clone(result.book);s.name=result.name;s.source=result.name;s.dirty=false;render();announce('已保存到酒馆：'+result.name);toast.success('世界书已保存');
  }
  function exportBook(side){requireBook(side);const s=session[side],url=URL.createObjectURL(new Blob([JSON.stringify(s.book,null,2)],{type:'application/json'}));const link=node('a');link.href=url;link.download=(s.name||'世界书').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);announce('已导出'+names[side]+'世界书');}
  function openPresetConverter(side){
    requireBook(side);const original=session[side].book,{dialog,body,actions}=modal(names[side]+' · 预设条目转世界书');
    let entries=[],selected=new Set();const controls=node('div','pcm-wb-actions'),fileLabel=node('label','pcm-wb-file','导入预设JSON'),file=node('input');file.type='file';file.accept='.json,application/json';file.setAttribute('aria-label','导入预设JSON');fileLabel.append(file);
    const sourceSelect=node('select');sourceSelect.setAttribute('aria-label','酒馆预设名称');option(sourceSelect,'','选择酒馆预设');const presets=new Map();
    controls.append(fileLabel,button('读取酒馆预设',()=>void run(async()=>{const values=await host.request('list-presets');if(disposed||!dialog.isConnected)return;presets.clear();sourceSelect.replaceChildren();option(sourceSelect,'','选择酒馆预设');for(const [name,preset] of values){presets.set(name,preset);option(sourceSelect,name,name);}})),sourceSelect);
    const search=node('input');search.type='search';search.placeholder='搜索预设条目';search.setAttribute('aria-label','搜索预设条目');
    const all=node('input','pcm-native-switch');all.type='checkbox';all.setAttribute('aria-label','全选预设筛选结果');const total=node('span');
    const list=node('div','pcm-wb-preset-list');
    const options=node('div','pcm-wb-actions');const placement=node('select');placement.setAttribute('aria-label','转换插入位置');for(const [value,text] of [['end','插入末尾'],['start','插入最前'],['before','所选条目之前'],['after','所选条目之后']])option(placement,value,text);
    const anchor=node('select');anchor.setAttribute('aria-label','转换目标条目');option(anchor,'','选择目标条目');for(const {id,entry} of workbenchEntries(original))option(anchor,id,entry.comment||'未命名条目');
    const trigger=node('select');trigger.setAttribute('aria-label','转换触发方式');option(trigger,'constant','常驻（默认）');option(trigger,'keyword','关键词触发');options.append(placement,anchor,trigger);
    body.append(controls,node('p','pcm-wb-hint','保留名称、正文、开关和可转换的位置配置。虚拟占位条目不参与转换；关键词触发需要转换后填写关键词。'),search,all,total,list,options);
    const shown=()=>entries.filter(e=>[e.name,e.content].join('\n').toLowerCase().includes(search.value.trim().toLowerCase()));
    function renderEntries(){list.replaceChildren();const visible=shown();for(const item of visible){const label=node('label','pcm-wb-preset-entry'),input=node('input','pcm-native-switch');input.type='checkbox';input.checked=selected.has(item.id);input.setAttribute('aria-label','转换 '+item.name);input.addEventListener('change',()=>{input.checked?selected.add(item.id):selected.delete(item.id);renderEntries();});const preview=node('details');preview.append(node('summary','',item.name+(item.enabled?'':' · 已关闭')),node('pre','',item.content));label.append(input,preview);list.append(label);}const count=visible.filter(e=>selected.has(e.id)).length;all.checked=visible.length>0&&count===visible.length;all.indeterminate=count>0&&count<visible.length;total.textContent=selected.size+' 已选 / '+visible.length+' 条';}
    function loadPreset(data){entries=presetWorkbenchEntries(data);selected.clear();renderEntries();}
    file.addEventListener('change',()=>{const value=file.files[0];file.value='';if(value)void run(async()=>loadPreset(JSON.parse(await value.text())));});sourceSelect.addEventListener('change',()=>{if(presets.has(sourceSelect.value))void run(()=>loadPreset(presets.get(sourceSelect.value)));});search.addEventListener('input',renderEntries);all.addEventListener('change',()=>{for(const e of shown())all.checked?selected.add(e.id):selected.delete(e.id);renderEntries();});
    actions.append(button('转换并插入',()=>void run(()=>{if(session[side].book!==original)throw Error('目标草稿已变化，请重新打开转换面板');const chosen=entries.filter(e=>selected.has(e.id));if(!chosen.length)throw Error('请先勾选预设条目');let at={placement:placement.value};if(['before','after'].includes(placement.value)){if(!anchor.value)throw Error('请选择目标条目');at={[placement.value==='before'?'beforeId':'afterId']:anchor.value};}const result=insertPresetWorldEntries(original,chosen,{...at,trigger:trigger.value});change(side,result.book);renderList(side);dialog.close();announce('已转换并插入 '+result.ids.length+' 条，可整批撤回');}),'pcm-wb-primary'));renderEntries();
  }
  const drag=installWorkbenchDrag(element,{canDrag:(side)=>!busy&&!activeModal&&!compareMode&&!!session[side]?.book,onDrop:({fromSide,id,toSide,anchorId,after})=>void run(()=>{
    requireBook(toSide);const ids=[id];if(fromSide===toSide&&ids.includes(anchorId))return;
    const at=anchorId?{[after?'afterId':'beforeId']:anchorId}:{placement:'end'};
    const result=fromSide===toSide?reorderWorldEntries(session[fromSide].book,ids,at):transferWorldEntries(session[fromSide].book,session[toSide].book,ids,at);
    change(toSide,result.book);renderList(toSide);announce(fromSide===toSide?'显示顺序已调整，可撤回':'已迁移到'+names[toSide]+'草稿，来源保留');
  })});
  async function requestClose(){if(busy)return;if((session.left.dirty||session.right.dirty)&&!await confirm('世界书工作台有未保存修改，仍要关闭插件？'))return;onClose();}
  render();
  return {element,requestClose,hasDirty:()=>session.left.dirty||session.right.dirty,destroy(){disposed=true;drag.destroy();activeModal?.remove();element.remove();}};
}
