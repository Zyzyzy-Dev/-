// 单栏详情区的 AI 缝合输入、来源选择与确定性预览；不访问宿主 document。
import {createIdentifier,findPromptOrderEntry} from '../core.js';
import {makeStitchInput,stitchContext,assembleStitch} from '../ai-stitch/core.js';
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const button=(label,fn)=>{const b=node('button',label);b.className='menu_button';b.type='button';b.addEventListener('click',fn);return b;};
function field(label,value,change,multiline=false){const wrap=node('label'),input=node(multiline?'textarea':'input');wrap.append(node('span',label),input);input.value=value;input.addEventListener('input',()=>change(input.value));return wrap;}
export function createAiStitchPanel({session:s,host,isCurrent,onBack,onSave,onArchive}){
 const root=node('section');root.className='pcm-ai-stitch';let disposed=false,picking=0;
 const status=node('p');status.setAttribute('role','status');
 const report=e=>{status.textContent=e.message||String(e);};
 const check=()=>{if(!isCurrent())throw Error('主预设已改变。材料已保留；请返回后重新建立基线，不能保存旧方案');};
 const input=()=>makeStitchInput(s.baseline,s.sources,s.guidance,s.id,s.revision);
 const touch=()=>{if(s.task)void host.request('ai-stitch-cancel',{id:s.task}).catch(()=>{});s.touch();preview.replaceChildren();};
 const controls=node('fieldset'),head=node('header');head.append(node('h3','AI 辅助缝合'),button('返回列表',onBack));
 root.append(head,node('p',s.originalName+(s.dirty?' · 使用尚未写回酒馆的编辑器草稿':' · 使用打开时的主预设快照')));
 const select=node('select');select.setAttribute('aria-label','AI 来源');select.addEventListener('change',()=>{s.profileId=select.value;s.model=undefined;touch();void refreshConnection();});
 controls.append(node('span','AI 来源'),select);
 let connectionRevision=0;
 const connectionInfo=node('p'),modelField=field('本次使用的模型',s.model||'',value=>{s.model=value;touch();}),modelInput=modelField.querySelector('input'),modelList=node('datalist');
 modelList.id='pcm-stitch-models-'+s.id;modelInput.setAttribute('list',modelList.id);modelInput.setAttribute('aria-label','本次使用的模型');
 async function refreshConnection(){const revision=++connectionRevision;connectionInfo.textContent='正在读取连接信息…';modelList.replaceChildren();modelInput.value=s.model||'';try{const info=await host.request('ai-stitch-connection',{profileId:s.profileId});if(disposed||revision!==connectionRevision)return;connectionInfo.textContent='URL：'+info.url+' · 密钥：'+info.maskedSecret;s.model??=info.model;modelInput.value=s.model;}catch(e){if(revision===connectionRevision){connectionInfo.textContent='连接信息读取失败';report(e);}}}
 const fetchModels=button('拉取模型',async()=>{const revision=connectionRevision,profileId=s.profileId;fetchModels.disabled=true;try{const models=await host.request('ai-stitch-models',{profileId});if(disposed||revision!==connectionRevision)return;modelList.replaceChildren(...models.map(id=>{const option=node('option');option.value=id;return option;}));status.textContent='已拉取 '+models.length+' 个模型，可在模型输入框选择或手动填写；只用于本次缝合。';}catch(e){if(revision===connectionRevision)report(e);}finally{fetchModels.disabled=false;}});
 controls.append(connectionInfo,modelField,modelList,fetchModels,node('small','模型修改仅用于本次缝合，不修改保存的 API 方案或当前聊天连接。'));
 host.request('ai-stitch-connections').then(items=>{if(disposed)return;for(const item of items){const o=node('option',item.name);o.value=item.id;select.append(o);}select.value=s.profileId;return refreshConnection();}).catch(report);
 const sources=node('div'),picker=node('section'),preview=node('section');picker.className='pcm-ai-picker';preview.className='pcm-ai-preview';
 function renderSources(){sources.replaceChildren();for(const source of s.sources){const card=node('article');card.append(node('strong',source.name),node('small',source.origin?.split(' / ')[0]||'手动填写'),field('原文（编辑后以新输入为准）',source.content,v=>{source.content=v;touch();},true),button('移除',()=>{s.sources=s.sources.filter(x=>x!==source);touch();renderSources();}));sources.append(card);}}
 async function choose(kind){const token=++picking;picker.replaceChildren(node('p','正在读取来源列表…'));try{
  const names=await host.request(kind==='preset'?'ai-stitch-presets':'list-worldbooks');if(disposed||token!==picking)return;
  picker.replaceChildren();const search=node('input');search.placeholder='筛选预设／世界书名称';const list=node('div');
  const render=()=>{list.replaceChildren();for(const name of names.filter(n=>n.toLowerCase().includes(search.value.toLowerCase())))list.append(button(name,()=>entries(kind,name,token)));};
  search.addEventListener('input',render);picker.append(search,list,button('关闭选择器',()=>{picking++;picker.replaceChildren();}));render();
 }catch(e){report(e);}}
 async function entries(kind,name,token){try{
  const data=await host.request(kind==='preset'?'read-preset':'read-worldbook',{name});if(disposed||token!==picking)return;
  const items=kind==='preset'?(data?.prompts||[]).filter(p=>!p.marker).map(p=>({name:p.name||p.identifier,content:p.content,origin:name+' / '+p.identifier})):
   Object.entries(data.entries||{}).map(([id,p])=>({name:p.comment||p.name||id,content:p.content,origin:name+' / '+id}));
  picker.replaceChildren(node('h4',name));if(kind!=='preset')picker.append(node('p','仅导入所选正文，不继承世界书关键词、概率或挂载规则。'));
  const search=node('input');search.placeholder='筛选条目名称';const list=node('div'),chosen=new Set();
  const render=()=>{list.replaceChildren();items.forEach((item,i)=>{if(!item.name.toLowerCase().includes(search.value.toLowerCase()))return;const label=node('label'),check=node('input');check.type='checkbox';check.checked=chosen.has(i);check.addEventListener('change',()=>check.checked?chosen.add(i):chosen.delete(i));label.append(check,node('span',item.name));list.append(label);});};
  search.addEventListener('input',render);picker.append(search,list,button('添加所选正文',()=>{for(const i of chosen){const item=items[i];if(typeof item.content==='string')s.sources.push({id:createIdentifier(),...item});}touch();renderSources();picker.replaceChildren();}),button('返回来源',()=>choose(kind)));render();
 }catch(e){report(e);}}
 const add=node('div');add.className='pcm-ai-actions';add.append(button('导入预设条目',()=>choose('preset')),button('导入世界书条目',()=>choose('world')),button('手动填写',()=>{s.sources.push({id:createIdentifier(),name:'手动材料 '+(s.sources.length+1),content:'',origin:'手动填写'});touch();renderSources();}));
 controls.append(add,picker,sources,field('手动指导',s.guidance,v=>{s.guidance=v;touch();},true));
 const scope=node('details');scope.append(node('summary','查看发送范围（主预设上下文＋所选材料＋指导）'));const scopeText=node('pre');scope.append(scopeText);scope.addEventListener('toggle',()=>{if(scope.open)try{scopeText.textContent=JSON.stringify(stitchContext(input()),null,2);}catch(e){scopeText.textContent=e.message;}});controls.append(scope);
 const generate=button('生成方案',async()=>{let token;try{check();const data=input();token=s.begin();renderPreview();generate.disabled=true;controls.disabled=true;status.textContent='正在独立分析，最多等待120秒…';const plan=await host.request('ai-stitch-generate',{id:token.id,input:data,profileId:s.profileId,model:s.model});if(s.accept(token,plan)){renderPreview();status.textContent='方案已返回，请核对预览。';}}catch(e){if(!token||s.task===token.id){if(token)s.cancel();report(e);}}finally{generate.disabled=s.status==='generating'||!!s.saveId;controls.disabled=s.status==='generating'||!!s.saveId;}});
 const cancel=button('取消生成',()=>{const id=s.task;s.cancel();if(id)void host.request('ai-stitch-cancel',{id}).catch(report);generate.disabled=false;controls.disabled=!!s.saveId;status.textContent='已取消，材料保留';});
 const saveName=field('新预设名称',s.name,v=>s.name=v),nameControl=saveName.querySelector('input');
 const save=button('另存为新预设',async()=>{try{check();assembleStitch(input(),s.plan,s.excluded);save.disabled=true;controls.disabled=true;nameControl.disabled=true;generate.disabled=true;await onArchive();check();s.saveId||=createIdentifier();s.status='saving';renderPreview();const result=await host.request('ai-stitch-create',{id:s.saveId,name:s.name,originalName:s.originalName,input:input(),plan:s.plan,excluded:[...s.excluded]});await onSave(result,s);s.status='saved';}catch(e){if(e.name==='StitchNotWritten')s.saveId=null;s.status=s.saveId?'uncertain':'preview';report(e);verify.hidden=!s.saveId;renderPreview();}finally{if(!s.saveId){controls.disabled=false;nameControl.disabled=false;generate.disabled=false;save.disabled=false;}}});
 const verify=button('只读复查保存状态',async()=>{try{verify.disabled=true;const result=await host.request('ai-stitch-verify',{id:s.saveId});await onSave(result,s);s.status='saved';}catch(e){report(e);}finally{verify.disabled=false;}});verify.hidden=!s.saveId;
 const actions=node('div');actions.className='pcm-ai-actions';actions.append(generate,cancel);root.append(controls,actions,status,preview,saveName,node('small','高唯一性名称降低同名竞态；宿主没有原子排他新建接口。核验不明时仅复查，不重复写入。'),save,verify);
 function renderPreview(){preview.replaceChildren();if(!s.plan){save.disabled=true;return;}let assembled;try{assembled=assembleStitch(input(),s.plan,s.excluded);preview.append(node('p',`新增 ${assembled.added.length} 条；已有条目插入宏 ${assembled.changes.length} 处；原文严格一致。`));save.disabled=!!s.saveId;}catch(e){preview.append(node('p','待处理：'+e.message));save.disabled=true;}
  if(!Array.isArray(s.plan.items))return;
  const order=findPromptOrderEntry(s.baseline)?.order||[],ids=order.map(o=>typeof o==='string'?o:o.identifier);
  for(const item of s.plan.items){const source=s.sources.find(x=>x.id===item.sourceId);if(!source)continue;const card=node('article'),toggle=node('input');toggle.type='checkbox';toggle.checked=!s.excluded.has(source.id);toggle.disabled=!!s.saveId;toggle.addEventListener('change',()=>{toggle.checked?s.excluded.delete(source.id):s.excluded.add(source.id);renderPreview();});const title=node('label');title.append(toggle,node('strong',source.name));card.append(title,node('p',item.reason),node('p',`适配：${item.mode}；身份：${item.role||'待确认'}；位置：相对；变量：${item.scope||''} ${item.variable||'无'}`));
   const target=node('select');target.setAttribute('aria-label','目标条目 '+source.name);for(const p of s.baseline.prompts){const o=node('option',p.name||p.identifier);o.value=p.identifier;target.append(o);}target.value=item.anchorId||'';
   const position=node('select');for(const v of ['before','after']){const o=node('option',v==='before'?'之前':'之后');o.value=v;position.append(o);}position.value=item.placement||'after';
   const moved=()=>{item.anchorId=target.value;item.placement=position.value;item.groupId=s.baseline.extensions?.baibaiToolkit?.presetPromptGroups?.prompts?.[item.anchorId]?.groupId??null;renderPreview();};target.addEventListener('change',moved);position.addEventListener('change',moved);target.disabled=position.disabled=!!s.saveId;card.append(target,position);
   const at=ids.indexOf(item.anchorId)+(item.placement==='after'?1:0),name=id=>s.baseline.prompts.find(p=>p.identifier===id)?.name||id||'边界';card.append(node('p',`存放位置：${name(ids[at-1])} → 新条目 → ${name(ids[at])}；分组：${item.groupId||'未分组'}`));
   const raw=node('pre',source.content);card.append(node('small','输入原文'),raw);if(assembled){const added=assembled.added.find(x=>x.sourceId===source.id);if(added)card.append(node('small','实际新条目（包含必要包裹）'),node('pre',added.content));for(const change of assembled.changes.filter(c=>c.sourceId===source.id))card.append(node('p','读取宏追加位置：'+name(change.id)),node('pre',change.after.slice(change.before.length)));}preview.append(card);
  }
 }
 renderSources();renderPreview();controls.disabled=!!s.saveId;nameControl.disabled=!!s.saveId;generate.disabled=!!s.saveId;
 return {element:root,dispose(){disposed=true;picking++;},session:s};
}
