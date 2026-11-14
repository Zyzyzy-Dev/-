// 跨预设拖入遇到同 ID 时创建编号副本；调用方负责落点、开关及分组，原条目保持不变。
import {clone,createIdentifier} from './core.js';

export function createSameIdDropCopy(prompt,target,overwriteSameId=true,createId=createIdentifier) {
  const prompts=target?.prompts||[];
  if(overwriteSameId!==false||!prompts.some(item=>item.identifier===prompt.identifier))return null;
  const reserved=new Set([prompt.identifier,...prompts.map(item=>item.identifier),...Object.keys(target.extensions?.baibaiToolkit?.presetPromptGroups?.prompts||{})]);
  for(const entry of target.prompt_order||[])for(const item of Array.isArray(entry?.order)?entry.order:[])reserved.add(typeof item==='string'?item:item?.identifier);
  let identifier;do{identifier=createId();}while(!identifier||reserved.has(identifier));
  const names=new Set(prompts.map(item=>String(item.name||''))),base=String(prompt.name||'(未命名)');
  let number=1,name;do{name=base+'（'+number+++'）';}while(names.has(name));
  return {...clone(prompt),identifier,name};
}
