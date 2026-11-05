// 设置快照／API 列表共用的分组展示和整理窗口；保存前全部操作只影响窗口草稿。
import {createIdentifier} from '../features/preset/core.js';
import {moveLibraryItems,validateLibraryFolders} from '../shared/library-folders.js';
const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const button=(label,action)=>{const b=node('button','',label);b.type='button';b.addEventListener('click',action);return b;};
export function folderCardTargets(list,folders,visible,folded,filtering,activeIds=[]){
  if(!folders?.length)return ()=>list;
  const targets=new Map(),assigned=new Map(folders.flatMap(f=>f.items.map(id=>[id,f.id]))),active=new Set(activeIds);
  const visibleByFolder=new Map();
  for(const item of visible){const id=assigned.get(item.id)||'';if(!visibleByFolder.has(id))visibleByFolder.set(id,[]);visibleByFolder.get(id).push(item);}
  for(const f of [...folders,{id:'',name:'未分组'}]){
    const entries=visibleByFolder.get(f.id)||[];
    if(!entries.length&&(filtering||!f.id))continue;
    const wrap=node('section','pcm-library-folder'),body=node('div','pcm-library-folder-body');
    const toggle=button('',()=>{if(!filtering){if(folded.has(f.id))folded.delete(f.id);else folded.add(f.id);}setOpen(body.hidden);});
    function setOpen(open){body.hidden=!open;toggle.setAttribute('aria-expanded',String(open));}
    toggle.className='pcm-library-folder-head';toggle.append(node('strong','',f.name),node('small','',entries.length+' 项'));
    if(entries.some(e=>active.has(e.id)))toggle.append(node('small','pcm-api-active-badge','含已启用方案'));
    setOpen(filtering||!folded.has(f.id));wrap.append(toggle,body);list.append(wrap);
    if(!entries.length)body.append(node('small','pcm-library-folder-empty','空分组'));
    for(const item of entries)targets.set(item.id,body);
  }
  return id=>targets.get(id)||list;
}

export function openFolderOrganizer({parent,label,items,folders=[],onSave}){
  if(parent.querySelector('.pcm-library-organizer'))return;
  const modal=node('dialog','pcm-api-modal pcm-library-organizer');modal.setAttribute('aria-label','整理'+label+'分组');
  const box=node('div','pcm-library-organizer-box'),bar=node('div','pcm-library-tools'),manage=node('div','pcm-library-tools');
  const name=node('input'),target=node('select'),search=node('input'),members=node('div','pcm-library-members'),status=node('p','pcm-snapshot-status');
  name.placeholder='分组名称';name.maxLength=80;name.setAttribute('aria-label','分组名称');target.setAttribute('aria-label','目标分组');
  search.type='search';search.placeholder='查找'+label;search.setAttribute('aria-label',search.placeholder);status.setAttribute('role','status');
  const expected=folders.map(f=>({...f,items:[...f.items]}));let draft=expected,selected=new Set(),saving=false;
  const opener=document.activeElement;
  function close(){if(saving)return;if(modal.open)modal.close();modal.remove();if(opener?.isConnected)opener.focus({preventScroll:true});}
  function say(msg){status.textContent=msg;}
  function options(id=''){target.replaceChildren();for(const f of [{id:'',name:'未分组'},...draft]){const o=node('option','',f.name);o.value=f.id;target.append(o);}target.value=id;update();}
  function update(){
    rename.disabled=dissolve.disabled=!target.value||saving;move.disabled=!selected.size||saving;
    move.textContent=selected.size?'移入所选组（'+selected.size+'）':'移入所选组';
    save.disabled=saving||JSON.stringify(draft)===JSON.stringify(expected);
  }
  function showMembers(){
    const owners=new Map(draft.flatMap(f=>f.items.map(id=>[id,f.name])));members.replaceChildren();
    const q=search.value.trim().toLocaleLowerCase();
    for(const item of items.filter(i=>i.name.toLocaleLowerCase().includes(q))){
      const row=node('label','pcm-library-member'),check=node('input');check.type='checkbox';check.checked=selected.has(item.id);
      check.addEventListener('change',()=>{if(check.checked)selected.add(item.id);else selected.delete(item.id);update();});
      row.append(check,node('span','',item.name),node('small','',owners.get(item.id)||'未分组'));members.append(row);
    }
    if(!members.childElementCount)members.append(node('p','','没有匹配的'+label));
    update();
  }
  function edit(which){
    const id=which==='add'?createIdentifier():target.value;
    const proposed=which==='add'?[...draft,{id,name:name.value,items:[]}]:draft.map(f=>f.id===id?{...f,name:name.value}:f);
    try{draft=validateLibraryFolders(expected,expected,proposed,items);name.value='';options(id);showMembers();say('分组已调整，保存后生效。');}catch(e){say(e.message);}
  }
  const create=button('新建',()=>edit('add')),rename=button('改名',()=>edit('rename')),dissolve=button('解散',()=>{draft=draft.filter(f=>f.id!==target.value);options('');showMembers();say('已移至未分组；保存后生效。');});
  const move=button('移入所选组',()=>{draft=moveLibraryItems(draft,selected,target.value);selected.clear();showMembers();say('归组已调整，保存后生效。');});
  const cancel=button('取消',close),save=button('保存分组',async()=>{
    if(saving||save.disabled)return;
    saving=true;for(const el of box.querySelectorAll('input,button,select'))el.disabled=true;say('正在保存…');
    try{await onSave({expected,folders:draft});saving=false;close();}
    catch(e){saving=false;for(const el of box.querySelectorAll('input,button,select'))el.disabled=false;update();say(e.message||'保存失败');}
  });
  target.addEventListener('change',update);search.addEventListener('input',showMembers);
  bar.append(name,create,rename);manage.append(target,move,dissolve);
  const footer=node('div','pcm-library-tools');footer.append(cancel,save);
  box.append(node('h3','','整理'+label+'分组'),node('p','','勾选成员，再选择目标分组。解散分组会保留所有成员和绑定。'),bar,manage,search,members,status,footer);
  modal.append(box);parent.append(modal);options();showMembers();
  modal.addEventListener('cancel',e=>{e.preventDefault();close();});modal.addEventListener('close',()=>modal.remove());
  modal.showModal();name.focus();
}
