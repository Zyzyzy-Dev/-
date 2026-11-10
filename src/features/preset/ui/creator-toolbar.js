// 条目正文选区工具栏：保留焦点与选区，复用正文适配器的草稿和撤销，兼容随机编辑的普通正文块。
import {CREATOR_SYMBOLS,planCreatorSymbol} from '../creator-symbols.js';

function selectionPoint(field,index) {
  const doc=field.ownerDocument,cs=doc.defaultView.getComputedStyle(field),mirror=doc.createElement('div'),mark=doc.createElement('span');
  for(const prop of ['boxSizing','paddingTop','paddingRight','paddingBottom','paddingLeft','fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','wordSpacing','tabSize','textIndent','textTransform'])mirror.style[prop]=cs[prop];
  Object.assign(mirror.style,{width:field.clientWidth+'px',position:'fixed',visibility:'hidden',top:'0',left:'-9999px',whiteSpace:field.wrap==='off'?'pre':'pre-wrap',overflowWrap:'break-word',wordBreak:cs.wordBreak});
  mirror.textContent=field.value.slice(0,index);mark.textContent='\u200b';mirror.append(mark);doc.body.append(mirror);
  const point={x:mark.offsetLeft,y:mark.offsetTop,height:mark.offsetHeight||parseFloat(cs.lineHeight)||18};mirror.remove();return point;
}

export function installCreatorToolbar({adapter,enabled,onError=()=>{}}) {
  const area=adapter.area,doc=area.ownerDocument,win=doc.defaultView,editor=area.closest('.pcm-version-editor'),parent=area.closest('.pcm-dialog');
  const toolbar=doc.createElement('div');toolbar.className='pcm-creator-toolbar';toolbar.hidden=true;toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','提示词符号');parent.append(toolbar);
  let captured=null,composing=false,disposed=false,frame=0,dismissed=null;
  const hide=()=>{toolbar.hidden=true;captured=null;editor.classList.remove('pcm-creator-selection');};
  function refresh() {
    frame=0;if(disposed)return;
    const field=doc.activeElement;
    if(toolbar.contains(field))return;
    if(!enabled()||composing||!editor.isConnected||field?.tagName!=='TEXTAREA'||!editor.contains(field)||field.readOnly||field.disabled||!field.getClientRects().length||field.closest('.pcm-random-block-random')||!(field===area||field.closest('.pcm-random-block-text'))){hide();return;}
    const start=field.selectionStart,end=field.selectionEnd;
    if(start===end||!field.value.slice(start,end).trim()){dismissed=null;hide();return;}
    const before=adapter.getText(),offset=field===area?0:Number(field.dataset.start);
    if(!Number.isInteger(offset)){hide();return;}
    if(dismissed?.field===field&&dismissed.start===start&&dismissed.end===end&&dismissed.before===before){hide();return;}
    captured={field,before,start:offset+start,end:offset+end,localStart:start,localEnd:end};
    const point=selectionPoint(field,field.selectionDirection==='backward'?start:end),rect=field.getBoundingClientRect(),viewport=win.visualViewport;
    const left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0,width=viewport?.width||win.innerWidth,height=viewport?.height||win.innerHeight;
    const x=rect.left+field.clientLeft+point.x-field.scrollLeft,y=rect.top+field.clientTop+point.y-field.scrollTop;
    const clipTop=Math.max(top,rect.top,parent.getBoundingClientRect().top),clipBottom=Math.min(top+height,rect.bottom,parent.getBoundingClientRect().bottom);
    if(y+point.height<clipTop||y>clipBottom){hide();return;}
    toolbar.hidden=false;editor.classList.add('pcm-creator-selection');toolbar.style.maxWidth=Math.max(0,width-16)+'px';
    const tw=toolbar.offsetWidth,th=toolbar.offsetHeight;
    toolbar.style.left=Math.max(left+8,Math.min(x-tw/2,left+width-tw-8))+'px';
    toolbar.style.top=Math.max(top+8,Math.min(y-th-8>=top+8?y-th-8:y+point.height+8,top+height-th-8))+'px';
  }
  const schedule=()=>{if(!disposed&&!frame)frame=win.requestAnimationFrame(refresh);};
  toolbar.addEventListener('pointerdown',event=>event.preventDefault());toolbar.addEventListener('mousedown',event=>event.preventDefault());
  toolbar.addEventListener('click',event=>{
    const button=event.target.closest('[data-creator-symbol]');if(!button)return;event.preventDefault();event.stopPropagation();
    const saved=captured;if(!saved)return;
    try {
      if(!enabled()||!saved.field.isConnected||adapter.getText()!==saved.before||saved.field.selectionStart!==saved.localStart||saved.field.selectionEnd!==saved.localEnd)throw Error('正文或选区已变化，请重新选择');
      const edit=planCreatorSymbol(saved.before,saved.start,saved.end,button.dataset.creatorSymbol);
      const result=adapter.replace(edit);if(result?.ok===false)throw Error(result.reason);
      adapter.focusRange(edit.selectionStart,edit.selectionEnd);
      const field=doc.activeElement;dismissed={field,before:adapter.getText(),start:field.selectionStart,end:field.selectionEnd};hide();
    }catch(error){hide();onError(error.message);}
  });
  for(const symbol of CREATOR_SYMBOLS){const b=doc.createElement('button');b.type='button';b.textContent=symbol.label;b.dataset.creatorSymbol=symbol.id;b.title=symbol.title;b.setAttribute('aria-label',symbol.title+' '+symbol.label);toolbar.append(b);}
  const begin=()=>{composing=true;hide();},end=()=>{composing=false;schedule();};
  const key=event=>{if(event.key==='Escape'&&!toolbar.hidden){event.preventDefault();event.stopPropagation();const s=captured;dismissed=s&&{field:s.field,before:s.before,start:s.localStart,end:s.localEnd};hide();(s?.field?.isConnected?s.field:area).focus({preventScroll:true});}else if(event.altKey&&event.key==='F10'&&!toolbar.hidden){event.preventDefault();toolbar.querySelector('button').focus();}};
  const outside=event=>{if(!toolbar.contains(event.target)&&!editor.contains(event.target))hide();};
  const listeners=[[doc,'selectionchange',schedule],[editor,'select',schedule,true],[editor,'pointerup',schedule],[editor,'keyup',schedule],[editor,'input',schedule],[editor,'compositionstart',begin],[editor,'compositionend',end],[editor,'pcm-random-mode',schedule],[doc,'focusin',schedule],[doc,'pointerdown',outside,true],[doc,'scroll',schedule,true],[parent,'keydown',key,true],[win,'resize',schedule],[win.visualViewport,'resize',schedule],[win.visualViewport,'scroll',schedule]];
  for(const [target,event,fn,capture] of listeners)target?.addEventListener(event,fn,capture);
  return {dispose(){disposed=true;win.cancelAnimationFrame(frame);for(const [target,event,fn,capture] of listeners)target?.removeEventListener(event,fn,capture);hide();toolbar.remove();}};
}
