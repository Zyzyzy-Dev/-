// 首页预设编辑设置：读取宿主偏好，逐项保存；失败保留旧状态，关闭时释放监听。
import {normalizeEditorPreferences} from '../editor-preferences.js';

export function openEditorSettings({parent,host,onPreferences}) {
  if (parent.querySelector('.pcm-editor-settings')) return;
  const doc=parent.ownerDocument, previous=doc.activeElement;
  const modal=doc.createElement('dialog');modal.className='pcm-modal pcm-editor-settings';modal.setAttribute('aria-label','预设编辑设置');
  modal.innerHTML=`<div class="pcm-modal-box"><header><h2>预设编辑设置</h2><button type="button" class="menu_button" data-settings-close aria-label="关闭设置">×</button></header><div class="pcm-editor-settings-options"></div><p class="pcm-editor-settings-status" role="status">正在读取设置…</p></div>`;
  const status=modal.querySelector('[role=status]'), options=modal.querySelector('.pcm-editor-settings-options'), controls=new Map();
  let preferences=normalizeEditorPreferences(),closed=false;
  const finish=()=>{if(closed)return;closed=true;parent.removeEventListener('close',finish);modal.close();modal.remove();if(previous?.isConnected)previous.focus({preventScroll:true});};
  for(const [key,title,description] of [
    ['collapseGroups','导入分组默认折叠','下一次从文件、酒馆或项目载入预设时，折叠命名分组。当前展开状态不变。'],
    ['floating','悬浮球快捷入口','在酒馆显示可拖动的“预设”悬浮球，直接打开预设编辑。'],
    ['quickReply','快速回复快捷入口','在酒馆输入区显示“预设编辑”按钮。'],
    ['creatorMode','创作者模式','选中条目正文后显示符号工具栏。前缀添加到选中的每个非空行；成对符号包裹整段选区。'],
  ]) {
    const label=doc.createElement('label');label.className='pcm-editor-setting';
    const input=doc.createElement('input');input.type='checkbox';input.dataset.editorPreference=key;input.disabled=true;
    const copy=doc.createElement('span'),name=doc.createElement('strong'),hint=doc.createElement('small');name.textContent=title;hint.textContent=description;copy.append(name,hint);label.append(copy,input);options.append(label);controls.set(key,input);
    input.addEventListener('change',async()=>{
      const value=input.checked;for(const control of controls.values())control.disabled=true;status.textContent='正在保存…';
      try {preferences=normalizeEditorPreferences(await host.request('preset-editor-preferences',{[key]:value}));onPreferences(preferences);if(!closed)status.textContent='已更新设置';}
      catch(error){if(!closed)status.textContent='保存失败：'+error.message;}
      finally {if(!closed)for(const [name,control] of controls){control.checked=preferences[name];control.disabled=false;}}
    });
  }
  modal.querySelector('[data-settings-close]').addEventListener('click',finish);
  modal.addEventListener('click',event=>event.stopPropagation());
  modal.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish();}});
  modal.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();finish();});
  modal.addEventListener('close',finish);parent.addEventListener('close',finish);parent.append(modal);modal.showModal();
  void host.request('preset-editor-preferences').then(value=>{
    if(closed)return;preferences=normalizeEditorPreferences(value);onPreferences(preferences);
    for(const [key,control] of controls){control.checked=preferences[key];control.disabled=false;}
    status.textContent='设置自动保存；创作者模式仅修改编辑草稿。';
  }).catch(error=>{if(!closed)status.textContent='读取失败：'+error.message+'。请关闭后重试。';});
}
