const APP_ID = 'preset-diff-migrator';
const state = { oldPreset: null, newPreset: null, result: null, oldName: '', newName: '', activeId: null, filter: 'all', query: '', selected: new Set() };
const labels = { added: '新版新增', removed: '旧版独有', changed: '内容已修改', same: '内容相同' };
const fields = ['name','role','enabled','injection_position','injection_depth','injection_order','system_prompt','marker','forbid_overrides','injection_trigger','content'];
const clone = value => structuredClone(value);
const byId = preset => new Map((preset && preset.prompts || []).map(prompt => [prompt.identifier, prompt]));
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
function validatePreset(data) {
    if (!data || !Array.isArray(data.prompts)) throw new Error('不是有效的 SillyTavern OpenAI 预设：缺少 prompts 数组。');
    const ids = new Set();
    data.prompts.forEach(prompt => {
        if (!prompt || typeof prompt.identifier !== 'string' || !prompt.identifier) throw new Error('存在没有 identifier 的条目。');
        if (ids.has(prompt.identifier)) throw new Error('条目 ID 重复：' + prompt.identifier);
        ids.add(prompt.identifier);
    });
    return data;
}
function compareRows() {
    const oldMap = byId(state.oldPreset), newMap = byId(state.newPreset);
    const ids = new Set([...oldMap.keys(), ...newMap.keys()]);
    return [...ids].map(id => {
        const oldPrompt = oldMap.get(id), newPrompt = newMap.get(id);
        let status = 'same';
        if (oldPrompt && !newPrompt) status = 'removed';
        else if (!oldPrompt && newPrompt) status = 'added';
        else if (!equal(oldPrompt, newPrompt)) status = 'changed';
        return { id, oldPrompt, newPrompt, status, prompt: newPrompt || oldPrompt };
    });
}
function filteredRows() {
    const query = state.query.trim().toLocaleLowerCase();
    const rank = { changed: 0, removed: 1, added: 2, same: 3 };
    return compareRows().filter(row => {
        if (state.filter !== 'all' && row.status !== state.filter) return false;
        if (!query) return true;
        const text = [row.id, row.prompt && row.prompt.name, row.oldPrompt && row.oldPrompt.content, row.newPrompt && row.newPrompt.content].join('\n').toLocaleLowerCase();
        return text.includes(query);
    }).sort((a,b) => rank[a.status] - rank[b.status] || String(a.prompt.name || a.id).localeCompare(String(b.prompt.name || b.id), 'zh-CN'));
}
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
}
function button(text, action, className) {
    const node = el('button', 'menu_button ' + (className || ''), text);
    node.type = 'button'; node.dataset.action = action; return node;
}
function shell() {
    let dialog = document.getElementById(APP_ID + '-dialog');
    if (dialog) return dialog;
    dialog = el('dialog', 'pdm-dialog'); dialog.id = APP_ID + '-dialog';
    const app = el('div','pdm-app'); dialog.append(app);
    const header = el('header','pdm-header');
    const title = el('div'); title.append(el('h2','', '预设差异与迁移'), el('p','', '旧版与新版逐条对比，编辑后导出')); header.append(title, button('导出结果','export','pdm-primary'), button('×','close','pdm-close')); app.append(header);
    const imports = el('section','pdm-imports'); imports.append(fileBox('old','旧版本'), fileBox('new','新版本')); app.append(imports);
    const toolbar = el('section','pdm-toolbar');
    const search = el('input'); search.type='search'; search.placeholder='搜索名称、ID 或正文'; search.dataset.action='search';
    const filter = el('select'); filter.dataset.action='filter'; [['all','全部'],['changed','内容已修改'],['removed','旧版独有'],['added','新版新增'],['same','内容相同']].forEach(item => { const o=el('option','',item[1]);o.value=item[0];filter.append(o); });
    toolbar.append(search,filter,button('选择旧版独有','select-removed'),button('迁移所选旧条目','migrate','pdm-primary')); app.append(toolbar);
    app.append(el('section','pdm-summary','请导入旧版本和新版本。'));
    const main=el('main','pdm-main'); main.append(el('section','pdm-list'),el('section','pdm-detail','选择一个条目查看内容')); app.append(main);
    dialog.addEventListener('click', onClick); dialog.addEventListener('change', onChange); dialog.addEventListener('input', onInput); document.body.append(dialog); return dialog;
}
function fileBox(key,title) {
    const label=el('label','pdm-file'); label.append(el('span','',title)); const name=el('strong','pdm-file-name','选择 JSON');name.dataset.name=key;label.append(name);
    const input=el('input');input.type='file';input.accept='.json,application/json';input.dataset.file=key;label.append(input);return label;
}
async function loadPreset(key,file) {
    try {
        const data=validatePreset(JSON.parse(await file.text()));
        if(key==='old'){state.oldPreset=data;state.oldName=file.name;}else{state.newPreset=data;state.newName=file.name;state.result=clone(data);}
        document.querySelector('[data-name="'+key+'"]').textContent=file.name+' · '+data.prompts.length+' 条'; render();
    } catch(error) { if(window.toastr) toastr.error(error.message,'导入失败'); else alert(error.message); }
}
function render() {
    if(!state.oldPreset||!state.newPreset)return;
    const all=compareRows(), count=status=>all.filter(row=>row.status===status).length;
    document.querySelector('.pdm-summary').textContent='共 '+all.length+' 个唯一条目 · 修改 '+count('changed')+' · 旧版独有 '+count('removed')+' · 新版新增 '+count('added')+' · 相同 '+count('same')+' · 已选 '+state.selected.size;
    const list=document.querySelector('.pdm-list'); list.replaceChildren();
    filteredRows().forEach(row=>{
        const item=el('article','pdm-row'+(row.id===state.activeId?' active':''));
        const check=el('input');check.type='checkbox';check.checked=state.selected.has(row.id);check.dataset.select=row.id;check.setAttribute('aria-label','选择 '+(row.prompt.name||row.id));
        const open=el('button','pdm-open');open.type='button';open.dataset.open=row.id;open.append(el('span','pdm-name',row.prompt.name||'(未命名)'),el('code','',row.id));
        item.append(check,open,el('span','pdm-badge pdm-'+row.status,labels[row.status]));list.append(item);
    });
    if(state.activeId) renderDetail(state.activeId);
}
function displayValue(value) {
    if(value===undefined)return '此版本没有该条目';
    if(typeof value==='string')return value;
    return JSON.stringify(value,null,2);
}
function renderDetail(id) {
    const row=compareRows().find(item=>item.id===id), detail=document.querySelector('.pdm-detail'); detail.replaceChildren();
    if(!row)return;
    const head=el('div','pdm-detail-head'); const info=el('div');info.append(el('span','pdm-badge pdm-'+row.status,labels[row.status]),el('h3','',row.prompt.name||'(未命名)'),el('code','',row.id));
    const actions=el('div','pdm-detail-actions');
    if(row.oldPrompt)actions.append(button('采用旧版并编辑','use-old'));
    if(row.newPrompt)actions.append(button('采用新版并编辑','use-new'));
    head.append(info,actions);detail.append(head);
    const changed=fields.filter(field=>!equal(row.oldPrompt&&row.oldPrompt[field],row.newPrompt&&row.newPrompt[field]));
    fields.forEach(field=>{
        const section=el('section','pdm-field'+(changed.includes(field)?' is-different':''));section.append(el('h4','',field+(changed.includes(field)?' · 有差异':'')));
        const grid=el('div','pdm-field-grid');grid.append(valuePanel('旧版本',row.oldPrompt&&row.oldPrompt[field],field==='content'),valuePanel('新版本',row.newPrompt&&row.newPrompt[field],field==='content'));section.append(grid);detail.append(section);
    });
}
function valuePanel(title,value,large) {
    const panel=el('div','pdm-value');panel.append(el('small','',title));
    if(large){const area=el('textarea');area.readOnly=true;area.value=displayValue(value);panel.append(area);}else panel.append(el('pre','',displayValue(value)));return panel;
}
function editPrompt(prompt) {
    document.querySelector('.pdm-editor')?.remove(); const detail=document.querySelector('.pdm-detail'), form=el('form','pdm-editor');
    form.append(el('h3','', '编辑迁移结果'));
    [['name','名称','text'],['role','角色','text'],['injection_position','注入位置','number'],['injection_depth','注入深度','number']].forEach(spec=>{const label=el('label','',spec[1]);const input=el('input');input.name=spec[0];input.type=spec[2];input.value=prompt[spec[0]]??'';label.append(input);form.append(label);});
    const enabled=el('label','pdm-enabled','启用');const check=el('input');check.type='checkbox';check.name='enabled';check.checked=prompt.enabled!==false;enabled.prepend(check);form.append(enabled);
    const contentLabel=el('label','pdm-content-label','正文');const content=el('textarea');content.name='content';content.value=prompt.content||'';contentLabel.append(content);form.append(contentLabel);
    const save=button('保存到结果','save-edit','pdm-primary');save.type='submit';form.append(save);form.dataset.id=prompt.identifier;form.addEventListener('submit',saveEdit);detail.append(form);form.scrollIntoView({behavior:'smooth',block:'end'});
}
function syncOrder(id,enabled) {
    if(!Array.isArray(state.result.prompt_order))state.result.prompt_order=[{character_id:100001,order:[]}];
    if(!state.result.prompt_order[0])state.result.prompt_order[0]={character_id:100001,order:[]};
    const order=state.result.prompt_order[0].order||(state.result.prompt_order[0].order=[]), item=order.find(entry=>entry.identifier===id);
    if(item)item.enabled=enabled;else order.push({identifier:id,enabled});
}
function putResult(prompt) {
    const copy=clone(prompt), index=state.result.prompts.findIndex(item=>item.identifier===copy.identifier);
    if(index<0)state.result.prompts.push(copy);else state.result.prompts[index]=copy;syncOrder(copy.identifier,copy.enabled!==false);
}
function saveEdit(event) {
    event.preventDefault(); const form=event.currentTarget,data=new FormData(form),current=byId(state.result).get(form.dataset.id)||byId(state.oldPreset).get(form.dataset.id)||byId(state.newPreset).get(form.dataset.id),prompt=clone(current);
    prompt.name=String(data.get('name'));prompt.role=String(data.get('role'));prompt.content=String(data.get('content'));prompt.enabled=data.get('enabled')==='on';prompt.injection_position=Number(data.get('injection_position'));prompt.injection_depth=Number(data.get('injection_depth'));putResult(prompt);form.remove();if(window.toastr)toastr.success('已保存到导出结果');
}
function exportResult() {
    if(!state.result)return;const blob=new Blob([JSON.stringify(state.result,null,2)],{type:'application/json;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(state.newName||'new-preset').replace(/\.json$/i,'')+'-已迁移.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function onChange(event) {
    if(event.target.dataset.file&&event.target.files[0])loadPreset(event.target.dataset.file,event.target.files[0]);
    if(event.target.dataset.action==='filter'){state.filter=event.target.value;render();}
    if(event.target.dataset.select){event.target.checked?state.selected.add(event.target.dataset.select):state.selected.delete(event.target.dataset.select);render();}
}
function onInput(event){if(event.target.dataset.action==='search'){state.query=event.target.value;render();}}
function onClick(event) {
    const target=event.target.closest('button');if(!target)return;const action=target.dataset.action;
    if(action==='close')event.currentTarget.close();
    if(action==='export')exportResult();
    if(action==='select-removed'){compareRows().filter(row=>row.status==='removed').forEach(row=>state.selected.add(row.id));render();}
    if(action==='migrate'){state.selected.forEach(id=>{const prompt=byId(state.oldPreset).get(id);if(prompt)putResult(prompt);});if(window.toastr)toastr.success('所选旧版条目已合入新版结果');render();}
    if(target.dataset.open){state.activeId=target.dataset.open;render();}
    if(action==='use-old'||action==='use-new'){const row=compareRows().find(item=>item.id===state.activeId),prompt=action==='use-old'?row.oldPrompt:row.newPrompt;if(prompt){putResult(prompt);editPrompt(prompt);}}
}
function addMenuButton() {
    const menu=document.getElementById('extensionsMenu');if(!menu||document.getElementById(APP_ID+'-button'))return false;
    const entry=el('div','list-group-item flex-container flexGap5 interactable');entry.id=APP_ID+'-button';entry.tabIndex=0;entry.append(el('span','fa-solid fa-code-compare'),el('span','', '预设差异与迁移'));entry.addEventListener('click',()=>shell().showModal());menu.append(entry);return true;
}
jQuery(()=>{if(!addMenuButton()){const observer=new MutationObserver(()=>{if(addMenuButton())observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});}});
