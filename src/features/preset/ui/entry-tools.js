// 预设条目工具栏：复用原生正文与引用入口，安装符号检查、random 转换/分块模式并集中释放监听。
import {createContentEditorAdapter} from './content-editor-adapter.js';
import {installRandomEditor} from './random-editor.js';
import {planRandomWrap} from '../random-macros.js';

export function installEntryTools(detail,{onCheckSymbols,onError=()=>{}}) {
  const disposers=[];
  for(const editor of detail.querySelectorAll('.pcm-version-editor')){
    const area=editor.querySelector('textarea[name=content]'),heading=editor.querySelector('.pcm-variable-entry-heading');
    if(!area||!heading||heading.querySelector('.pcm-entry-tools'))continue;
    const doc=detail.ownerDocument,bar=doc.createElement('div');bar.className='pcm-entry-tools';
    const adapter=createContentEditorAdapter({area}),random=installRandomEditor({container:area.closest('.pcm-inline-content'),adapter});
    const make=(text,fn)=>{const b=doc.createElement('button');b.type='button';b.className='menu_button';b.textContent=text;b.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();try{fn();}catch(error){onError(error.message);}});return b;};
    const check=make('符号检查',()=>onCheckSymbols(area.form.dataset.side,area.form.dataset.id));check.dataset.entryCheck='';
    const toggle=make('随机编辑',()=>random.setEnabled(!random.isEnabled()));toggle.dataset.randomToggle='';toggle.setAttribute('aria-label','随机编辑');toggle.setAttribute('aria-pressed','false');
    const wrap=make('转为随机',()=>{
      try{const edit=planRandomWrap(adapter.getText(),adapter.getSelection());adapter.replace(edit);const sel=adapter.getSelection();adapter.focusRange(sel.start,sel.end);}
      catch(error){if(error.code==='existing-random'&&error.target){random.setEnabled(true);adapter.focusRange(error.target.start,error.target.end);}else throw error;}
    });wrap.dataset.randomWrap='';wrap.disabled=true;
    // 控制点击前保留移动端选区；键盘 click 不受影响。
    wrap.addEventListener('pointerdown',event=>event.preventDefault());
    const updateSelection=()=>{const {start,end}=adapter.getSelection();wrap.disabled=start===end;};
    const mode=()=>{const enabled=random.isEnabled();toggle.textContent=enabled?'随机编辑 ×':'随机编辑';toggle.setAttribute('aria-pressed',String(enabled));toggle.classList.toggle('pcm-primary',enabled);toggle.classList.toggle('pcm-random-active',enabled);updateSelection();};
    editor.addEventListener('select',updateSelection,true);editor.addEventListener('keyup',updateSelection);editor.addEventListener('pointerup',updateSelection);area.addEventListener('pcm-random-mode',mode);
    const selectionChange=()=>{if(editor.contains(doc.activeElement))updateSelection();};doc.addEventListener('selectionchange',selectionChange);
    const off=adapter.subscribe(updateSelection);
    const reference=heading.querySelector('[data-variable-reference-launch]');bar.append(check,toggle,wrap);if(reference)bar.append(reference);heading.append(bar);
    disposers.push(()=>{off();doc.removeEventListener('selectionchange',selectionChange);editor.removeEventListener('select',updateSelection,true);editor.removeEventListener('keyup',updateSelection);editor.removeEventListener('pointerup',updateSelection);area.removeEventListener('pcm-random-mode',mode);random.dispose();adapter.dispose();});
  }
  return {dispose(){for(const dispose of disposers.splice(0))dispose();}};
}
