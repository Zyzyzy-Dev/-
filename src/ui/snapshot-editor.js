// 快照草稿编辑页：选择预设和三种挂载、调整正则及世界书配置，保存前不改变宿主设置。
export function createSnapshotEditor({host, model, existingId, onCancel, onSaved, toast}) {
  const draft=JSON.parse(JSON.stringify(model.draft)),context=model.context;
  let disposed=false,busy=false;
  const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  const element=node('section','pcm-snapshot-editor');element.setAttribute('aria-label',existingId?'修改快照':'创建快照');
  const status=node('p','pcm-snapshot-status');status.setAttribute('role','status');
  const form=node('div','pcm-snapshot-form');
  const name=node('input');name.type='text';name.maxLength=120;name.value=existingId?draft.name:'';name.placeholder='给这份设置起个名字';
  form.append(label('快照名称',name));
  const preset=node('select');preset.setAttribute('aria-label','预设选择');
  for(const value of new Set([draft.presetName,...model.presets])){const option=node('option','',value);option.value=value;preset.append(option);}preset.value=draft.presetName;
  form.append(label('预设选择',preset));
  const presetInfo=node('p','pcm-snapshot-notice');form.append(presetInfo);updatePresetInfo();
  preset.addEventListener('change',()=>run(async()=>{
    const selected=preset.value;
    try {
      const value=await host.request('snapshot-draft-preset',{presetName:selected,contextKey:context.key});
      if(disposed)return;
      for(const key of ['presetName','orderCharacterId','entries','groups'])draft[key]=value[key];
      draft.resources.regex.preset=value.regex;updatePresetInfo();renderRegex();
    } catch(error){preset.value=draft.presetName;throw error;}
  }));
  const mounts=node('div','pcm-snapshot-mount-grid');
  const bookCache=new Map(draft.resources.worldEntries.map(book=>[book.name,book]));
  const bookDetails=node('div','pcm-snapshot-book-configs');
  const worldNames=[...new Set([...model.worldNames,...Object.values(draft.resources.worlds).flat()])];
  for(const scope of ['global','character','chat']) {
    const group=node('section','pcm-snapshot-field-group');
    const title={global:'全局世界书',character:'角色附加世界书',chat:'聊天附加世界书'}[scope];
    group.append(node('h3','',title));
    const available=scope==='global'||(scope==='character'?context.canBindCharacter:context.canBindChat);
    if(!available)group.append(node('small','','请先在酒馆打开'+(scope==='character'?'角色':'聊天')+'后设置'));
    if(scope==='chat') {
      const select=node('select');select.setAttribute('aria-label',title);select.dataset.unavailable=String(!available);
      for(const value of ['',...worldNames]){const option=node('option','',value||'不挂载');option.value=value;select.append(option);}select.value=draft.resources.worlds.chat[0]||'';
      select.addEventListener('change',()=>run(async()=>{try{await setWorlds(scope,select.value?[select.value]:[]);}catch(error){select.value=draft.resources.worlds.chat[0]||'';throw error;}}));
      group.append(select,node('small','','酒馆原生支持一本聊天世界书'));
    } else {
      const choices=node('div','pcm-snapshot-world-choices');
      if(!worldNames.length)choices.append(node('small','','没有可用世界书'));
      for(const value of worldNames) {
        const checkbox=node('input');checkbox.type='checkbox';checkbox.checked=draft.resources.worlds[scope].includes(value);checkbox.dataset.unavailable=String(!available);
        checkbox.addEventListener('change',()=>run(async()=>{
          const next=checkbox.checked?[...draft.resources.worlds[scope],value]:draft.resources.worlds[scope].filter(n=>n!==value);
          try{await setWorlds(scope,next);}catch(error){checkbox.checked=draft.resources.worlds[scope].includes(value);throw error;}
        }));choices.append(label(value,checkbox,'pcm-snapshot-check'));
      }group.append(choices);
    }mounts.append(group);
  }
  const regex=node('section','pcm-snapshot-editor-regex');
  const controls=node('div','pcm-snapshot-editor-actions');
  const save=button('保存',()=>{if(existingId){saveChoices.hidden=false;}else void persist(false);});save.className='pcm-snapshot-primary';
  const cancel=button('取消编辑',onCancel);
  const saveChoices=node('div','pcm-snapshot-save-choices');saveChoices.hidden=true;
  saveChoices.append(node('span','','保存方式'),button('覆盖当前快照',()=>persist(true)),button('另存为一个新的快照',()=>persist(false)),button('返回编辑',()=>{saveChoices.hidden=true;}));
  controls.append(save,cancel);
  element.append(form,mounts,regex,node('p','pcm-snapshot-notice','世界书保存条目配置，保留最新正文；应用配置会影响所有引用同一本书的位置。正则开关对后续处理生效，已有消息的显示需刷新聊天。'),bookDetails,status,controls,saveChoices);
  for(const warning of [...(model.warnings||[]),...(context.regexAuthorization||[])])form.append(node('p','pcm-snapshot-notice',warning));
  renderRegex();renderBooks();setBusy(false);

  function label(text,input,cls='pcm-snapshot-field') {const row=node('label',cls);row.append(node('span','',text),input);return row;}
  function button(text,action){const b=node('button','',text);b.type='button';b.addEventListener('click',event=>{event.stopPropagation();action();});return b;}
  function setBusy(value){busy=value;element.setAttribute('aria-busy',String(value));for(const el of element.querySelectorAll('input,select,textarea,button'))el.disabled=(value&&el!==cancel)||el.dataset.unavailable==='true';}
  async function run(action){if(busy||disposed)return;setBusy(true);status.textContent='';try{await action();}catch(error){if(!disposed){status.textContent=error.message;status.classList.add('is-error');toast.error(error.message);}}finally{if(!disposed)setBusy(false);}}
  function updatePresetInfo(){presetInfo.textContent='将保存 '+draft.entries.filter(item=>item.enabled).length+'/'+draft.entries.length+' 个条目开启状态，以及 '+draft.groups.length+' 个分组的独立开关。';}
  async function setWorlds(scope,names){
    const missing=names.filter(name=>!bookCache.has(name));
    if(missing.length){const values=await host.request('snapshot-draft-worlds',{names:missing,contextKey:context.key});if(disposed)return;for(const value of values)bookCache.set(value.name,value);}
    draft.resources.worlds[scope]=[...new Set(names)];
    const selected=[...new Set(Object.values(draft.resources.worlds).flat())];
    draft.resources.worldEntries=selected.map(name=>bookCache.get(name));draft.worldNames=[...draft.resources.worlds.global];renderBooks();
  }
  function renderRegex(){
    regex.replaceChildren(node('h3','','正则开关'));
    for(const scope of ['global','preset','character']) {
      const scripts=draft.resources.regex[scope],details=node('details','pcm-snapshot-regex-details');details.open=false;
      const summary=node('summary','',({global:'全局正则',preset:'预设正则',character:'角色正则'})[scope]+' · '+scripts.filter(s=>s.enabled).length+'/'+scripts.length+' 开启');details.append(summary);
      const choices=node('div','pcm-snapshot-regex-choices');
      if(!scripts.length)choices.append(node('small','','没有正则'));
      for(const script of scripts){const checkbox=node('input');checkbox.type='checkbox';checkbox.checked=script.enabled;checkbox.dataset.unavailable=String(scope==='character'&&!context.canBindCharacter);checkbox.addEventListener('change',()=>{script.enabled=checkbox.checked;summary.textContent=({global:'全局正则',preset:'预设正则',character:'角色正则'})[scope]+' · '+scripts.filter(s=>s.enabled).length+'/'+scripts.length+' 开启';});choices.append(label(script.name||script.id,checkbox,'pcm-snapshot-check'));}
      details.append(choices);regex.append(details);
    }
  }
  function renderBooks(){
    const expanded=new Set([...bookDetails.querySelectorAll('details[open][data-book]')].map(el=>el.dataset.book));
    bookDetails.replaceChildren(node('h3','','世界书条目配置'));
    if(!draft.resources.worldEntries.length)bookDetails.append(node('p','pcm-snapshot-notice','选择世界书后读取其条目配置。'));
    for(const book of draft.resources.worldEntries){
      const section=node('details','pcm-snapshot-book');section.dataset.book=book.name;section.open=expanded.has(book.name);section.append(node('summary','',book.name+' · '+book.entries.length+' 条'));
      for(const entry of book.entries){
        const row=node('details','pcm-snapshot-world-entry');row.append(node('summary','',entry.name||entry.uid));
        const fields=node('div','pcm-snapshot-entry-fields');
        const enabled=node('input');enabled.type='checkbox';enabled.checked=!entry.settings.disable;
        const state=node('select');state.setAttribute('aria-label','触发状态');for(const [value,text] of [['constant','永久'],['keyword','关键词'],['vector','向量化']]){const o=node('option','',text);o.value=value;state.append(o);}state.value=entry.settings.constant?'constant':entry.settings.vectorized?'vector':'keyword';
        const position=node('select');position.setAttribute('aria-label','插入方式');for(const [value,text] of [[0,'角色定义之前'],[1,'角色定义之后'],[2,'作者注释之前'],[3,'作者注释之后'],[4,'指定深度'],[5,'示例消息之前'],[6,'示例消息之后'],[7,'出口']]){const o=node('option','',text);o.value=String(value);position.append(o);}position.value=String(entry.settings.position??0);
        const depth=node('input');depth.type='number';depth.value=entry.settings.depth??4;depth.setAttribute('aria-label','深度');
        const order=node('input');order.type='number';order.value=entry.settings.order??100;order.setAttribute('aria-label','顺序');
        const advanced=node('details','pcm-snapshot-json');advanced.append(node('summary','','全部条目配置（JSON）'));
        const json=node('textarea');json.rows=9;json.spellcheck=false;json.setAttribute('aria-label','全部条目配置');json.value=JSON.stringify(entry.settings,null,2);advanced.append(json);
        const sync=()=>{json.value=JSON.stringify(entry.settings,null,2);json.setCustomValidity('');};
        enabled.addEventListener('change',()=>{entry.settings.disable=!enabled.checked;sync();});
        state.addEventListener('change',()=>{entry.settings.constant=state.value==='constant';entry.settings.vectorized=state.value==='vector';sync();});
        position.addEventListener('change',()=>{entry.settings.position=Number(position.value);sync();});
        for(const [input,key] of [[depth,'depth'],[order,'order']])input.addEventListener('change',()=>{if(input.value!==''&&Number.isFinite(input.valueAsNumber)){entry.settings[key]=input.valueAsNumber;input.setCustomValidity('');sync();}else input.setCustomValidity('请输入数字');});
        json.addEventListener('input',()=>{try{const value=JSON.parse(json.value);if(!value||Array.isArray(value)||typeof value!=='object'||['content','comment','uid','__proto__','constructor','prototype'].some(key=>Object.hasOwn(value,key)))throw Error('只允许修改条目配置');entry.settings=value;json.setCustomValidity('');enabled.checked=!value.disable;state.value=value.constant?'constant':value.vectorized?'vector':'keyword';position.value=String(value.position??0);depth.value=value.depth??4;order.value=value.order??100;}catch{json.setCustomValidity('请输入有效配置 JSON，不能包含正文、名称或 UID');}});
        fields.append(label('开启',enabled,'pcm-snapshot-check'),label('触发状态',state),label('插入方式',position),label('深度',depth),label('顺序',order));row.append(fields,advanced);section.append(row);
      }bookDetails.append(section);
    }
  }
  async function persist(overwrite){
    if(busy||disposed)return;
    for(const input of element.querySelectorAll('input,select,textarea'))if(!input.checkValidity()){
      let parent=input.parentElement;while(parent&&parent!==element){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}
      input.reportValidity();status.textContent=input.validationMessage||'请检查配置';status.classList.add('is-error');return;
    }
    await run(async()=>{
    const value=name.value.trim();if(!value)throw new Error('请输入快照名称');
    const result=await host.request('snapshot-save-draft',{id:overwrite?existingId:undefined,name:value,draft,contextKey:context.key});
    if(!disposed){toast.success(overwrite?'快照已更新':'快照已保存');onSaved(result);}
    });
  }
  return {element,destroy(){disposed=true;element.remove();}};
}
