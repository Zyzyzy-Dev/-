// AI 缝合的独立请求与新建事务；不读取密钥明文，不修改活动连接。
import { clone, equalValues } from '../features/preset/core.js';
const canonical = name => String(name).normalize('NFC').replace(/\.json$/i,'').toLocaleLowerCase();
export function registerCreatedPreset(presets,names,name,preset){
 let index=Array.isArray(names)?names.indexOf(name):Object.hasOwn(names,name)?Number(names[name]):-1;
 if(index<0){index=presets.length;presets.push(clone(preset));if(Array.isArray(names))names.push(name);else Object.defineProperty(names,name,{value:index,writable:true,configurable:true,enumerable:true});}
 else presets[index]=clone(preset);
 return index;
}
export function validateNewName(name, originalName, names) {
 if(typeof name!=='string'||!name.trim()||name!==name.trim()||new TextEncoder().encode(name).length>200||/[<>:"/\\|?*\x00-\x1f\x80-\x9f]/.test(name)||/[. ]$/.test(name)||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name))throw Error('新预设名称包含不安全字符或过长');
 if(canonical(name)===canonical(originalName))throw Error('禁止覆盖原主预设');
 if(names.some(n=>canonical(n)===canonical(name)))throw Error('名称已存在，请使用递增后缀或新名称');
}
export function buildIndependentRequest(config, messages, parseYaml=JSON.parse) {
 const {source,model,secretId}=config;
 if(!['custom','openai','openrouter'].includes(source))throw Error('此连接来源尚未验证独立调用；请使用 custom、OpenAI 或 OpenRouter');
 if(!model||!secretId)throw Error('连接缺少模型或密钥引用');
 const body={chat_completion_source:source,model,secret_id:secretId,messages:clone(messages),stream:false,max_tokens:6000,temperature:0.2};
 if(source==='custom')body.custom_url=config.connection.custom_url;
 for(const [key,value] of Object.entries(config.additional||{})) {
  if(!value?.trim())continue;
  let parsed;try{parsed=parseYaml(value);}catch{throw Error('附加参数无法解析，请检查 YAML');}
  const forbidden=new Set(['messages','model','stream','prompt','tools','tool_choice','functions','function_call','n','secret_id','chat_completion_source','custom_url','reverse_proxy','proxy_password','__proto__','constructor','prototype']);
  const fields=key==='custom_exclude_body'?parsed:Object.keys(parsed||{});
  if(!Array.isArray(fields)||!parsed||typeof parsed!=='object'||(key!=='custom_exclude_body'&&Array.isArray(parsed)))throw Error('附加参数结构无效');
  if(fields.some(k=>typeof k!=='string'||forbidden.has(k)||key==='custom_include_headers'&&/authorization|api[-_]key|cookie|host/i.test(k)))throw Error('附加参数与隔离消息、模型或认证约束冲突');
  body[key]=value;
 }
 return body;
}
export function createOnlyStore({read,write,sync}) {
 const jobs=new Map();let tail=Promise.resolve();
 async function verify(id) {
  const job=jobs.get(id);if(!job)throw Error('没有待核验保存');
  let entries;
  try{entries=await read();}catch(error){throw Error('保存状态待核验：读取预设列表失败（'+(error.message||error.name||'未知读取错误')+'）；请只读复查。');}
  const entry=entries.find(([name])=>name===job.name);
  if(!entry)throw Error('保存状态待核验：磁盘列表尚未找到新预设'+(job.writeError?'；写入请求报告：'+job.writeError:'')+'。请只读复查，勿换名称重复保存。');
  if(!equalValues(entry[1],job.preset))throw Error('保存状态待核验：已找到新预设，但读回内容与提交内容不一致；未覆盖文件。');
  try{await sync(job.name,clone(entry[1]));}catch(error){throw Error('新预设已写入且内容核验通过，但同步原生列表失败（'+(error.message||error.name||'未知同步错误')+'）；只读复查可重试同步，不会再次写入。');}
  job.result={name:job.name,preset:clone(entry[1])};return clone(job.result);
 }
 async function run(args) {
  const existing=jobs.get(args.id);if(existing){if(existing.name!==args.name||!equalValues(existing.preset,args.preset))throw Error('保存事务已固定，必须先核验原事务');return existing.result?clone(existing.result):verify(args.id);}
  try{const disk=await read();validateNewName(args.name,args.originalName,disk.map(([n])=>n));}catch(error){error.name='StitchNotWritten';throw error;}
  jobs.set(args.id,{name:args.name,preset:clone(args.preset)});
  try{await write(args.name,clone(args.preset));}catch(error){jobs.get(args.id).writeError=error.message||error.name||'未知写入错误';/* May have committed. Never blindly retry a write. */}
  return verify(args.id);
 }
 return {create(args){const next=tail.then(()=>run(args));tail=next.catch(()=>{});return next;},verify};
}
