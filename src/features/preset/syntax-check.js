// 预设源码检查器：不执行宏，以有界分支与原文 UTF16 区间报告结构问题。
import { scanMacroSource } from './macro-source.js';
export const MAX_CHECK_BRANCHES = 32;
const pairs = new Map([['「','」'],['【','】'],['（','）'],['(',')'],['[',']'],['{','}']]);
const closes = new Set(pairs.values());
const escaped = (s,i) => { let n=0;while(i>0&&s[--i]==='\\')n++;return n%2===1; };
function location(e,start,end) { const head=e.text.slice(0,start),lines=head.split('\n');return {entryId:e.id,entryName:e.name,start,end,line:lines.length,column:lines.at(-1).length+1}; }
function issue(e,code,start,end,message,severity='error',related) {return {code,severity,...location(e,start,end),message,...(related?{related}: {})};}
// 围栏/内联代码仅屏蔽普通符号和标签；宏始终先独立扫描。
function codeMask(text) {
    const mask=new Uint8Array(text.length);let fence=null,offset=0;
    for(const line of text.split(/(?<=\n)/)) {
        const m=/^\s*(`{3,})([^\r\n]*)/.exec(line);
        if(fence) {mask.fill(1,offset,offset+line.length);if(m&&m[1].length>=fence&&m[2].trim()==='')fence=null;}
        else if(m) {fence=m[1].length;mask.fill(1,offset,offset+line.length);}
        else {const re=/(`+)([\s\S]*?)\1/g;let hit;while((hit=re.exec(line)))mask.fill(1,offset+hit.index,offset+re.lastIndex);}
        offset+=line.length;
    }
    return {mask,fence};
}
export function checkEntrySymbols(entry) {
    const e={...entry,text:String(entry.text||'')}, scanned=scanMacroSource(e.text), issues=[];
    for(const i of scanned.issues)issues.push(issue(e,i.code.includes('macro')?i.code:`macro-${i.code}`,i.start,i.end,i.message));
    function checkRegion(start,end,nodes,severity='error') {
        const text=e.text.slice(start,end), {mask,fence}=codeMask(text), stack=[];
        for(const n of nodes)mask.fill(1,n.start-start,n.end-start);
        // A stray shell closer is already diagnosed by the macro scanner.
        for(const i of scanned.issues)if(i.code==='macro-unexpected-close'&&i.start>=start&&i.end<=end)mask.fill(1,i.start-start,i.end-start);
        for(let at=0;at<text.length;at++) {
            const i=start+at;if(mask[at]||escaped(e.text,i))continue;const c=e.text[i];
            if(pairs.has(c))stack.push({c,i});
            else if(closes.has(c)) {const prev=stack.at(-1);if(prev&&pairs.get(prev.c)===c)stack.pop();else issues.push(issue(e,'symbol-unexpected',i,i+1,`多余或交叉的 ${c}`,severity,prev?location(e,prev.i,prev.i+1):undefined));}
        }
        for(const p of stack)issues.push(issue(e,'symbol-unclosed',p.i,p.i+1,`未闭合的 ${p.c}`,severity));
        if(fence) {const at=start+text.lastIndexOf('`'.repeat(fence));issues.push(issue(e,'fence-unclosed',at,at+fence,'代码围栏未闭合',severity));}
        for(const n of nodes) {
            const stored=/^(setvar|setglobalvar|addvar|addglobalvar)$/.test(n.name);
            const args=stored?(n.args||[]).slice(1):(n.args||[]);
            // Every candidate/value owns its own bracket and fence stack. A nested shell
            // is masked here then visits its own arguments, never counted twice.
            for(const a of args)checkRegion(a.start,a.end,(n.children||[]).filter(c=>c.start>=a.start&&c.end<=a.end),stored?'review':severity);
        }
    }
    checkRegion(0,e.text.length,scanned.nodes);
    return {issues,coverage:'complete',incompleteReasons:[]};
}
function plainTokens(e,start,end,mask) {
    const tokens=[], re=/<\/?([\p{L}_][\p{L}\p{N}_.:\-]*)(?:\s+(?:[^<>"']|"[^"]*"|'[^']*')*)?\s*\/?>/gu;re.lastIndex=start;let m;
    while((m=re.exec(e.text))&&m.index<end) {
        if(re.lastIndex>end||mask[m.index]||escaped(e.text,m.index)||/^(user|char|bot)$/i.test(m[1])||m[0].endsWith('/>'))continue;
        const lineStart=e.text.lastIndexOf('\n',m.index-1)+1,lineEnd=e.text.indexOf('\n',re.lastIndex),line=e.text.slice(lineStart,lineEnd<0?e.text.length:lineEnd);
        tokens.push({e,start:m.index,end:re.lastIndex,name:m[1],close:m[0][1]==='/',mention:line.trim()!==m[0]&&!line.trim().startsWith('<')});
    }return tokens;
}
function variants(e,start,end,nodes,mask,reasons) {
    let result=[[]],cursor=start;
    for(const n of nodes.filter(n=>n.start>=start&&n.end<=end)) {
        const before=plainTokens(e,cursor,n.start,mask);result=result.map(v=>v.concat(before));let options=[[]];
        if(n.name==='random'&&n.complete&&n.args?.length) options=n.args.flatMap(a=>variants(e,a.start,a.end,n.children||[],mask,reasons));
        else if(!/^(setvar|setglobalvar|addvar|addglobalvar|trim|\/\/)$/.test(n.name)) {options=[[{boundary:true}]];reasons.add('运行时宏展开未检查。');}
        if(result.length*options.length>MAX_CHECK_BRANCHES) {reasons.add(`随机分支超过 ${MAX_CHECK_BRANCHES} 条分析路径。`);options=[[{boundary:true}]];}
        result=result.flatMap(v=>options.map(o=>v.concat(o)));cursor=n.end;
    }
    const tail=plainTokens(e,cursor,end,mask);return result.map(v=>v.concat(tail));
}
export function checkPresetStructure(context,{ignoredOccurrences=[]}={}) {
    const reasons=new Set(context.uncertainties||[]),issues=[],byId=new Map(context.entries.map(e=>[e.id,e]));
    for(const e of context.entries)issues.push(...checkEntrySymbols(e).issues);
    for(const stream of context.streams) {
        let paths=[[]];
        for(const f of stream.fragments) {
            if(f.type==='boundary') {reasons.add(f.reason||'动态内容未检查。');paths=paths.map(p=>p.concat({boundary:true}));continue;}
            const e=byId.get(f.entryId);if(!e)continue;
            const options=variants(e,f.start??0,f.end??e.text.length,scanMacroSource(e.text).nodes,codeMask(e.text).mask,reasons);
            if(paths.length*options.length>MAX_CHECK_BRANCHES) {reasons.add(`随机分支超过 ${MAX_CHECK_BRANCHES} 条分析路径。`);paths=paths.map(p=>p.concat({boundary:true}));}
            else paths=paths.flatMap(p=>options.map(o=>p.concat(o)));
        }
        for(const path of paths) {
            const stack=[],dynamic=path.some(t=>t.boundary)||paths.length>1, crossed=new Set();
            for(const t of path) {
                if(t.boundary)continue;
                if(!t.close) {stack.push(t);continue;}
                const at=stack.findLastIndex(o=>o.name===t.name);
                if(at<0) {if(!crossed.delete(t.name))issues.push(issue(t.e,'tag-unexpected',t.start,t.end,`没有匹配开始标签：${t.name}`,dynamic||t.mention?'review':'error'));}
                else if(at!==stack.length-1) {const o=stack[at];for(const skip of stack.slice(at+1))crossed.add(skip.name);stack.splice(at);issues.push(issue(t.e,'tag-crossing',t.start,t.end,`标签交叉嵌套：${t.name}`,dynamic?'review':'error',location(o.e,o.start,o.end)));}
                else stack.pop();
            }
            for(const t of stack)issues.push(issue(t.e,'tag-unclosed',t.start,t.end,`标签未闭合：${t.name}`,dynamic||t.mention?'review':'error'));
        }
    }
    const ignored=ignoredOccurrences instanceof Set?ignoredOccurrences:new Set(ignoredOccurrences.map(i=>typeof i==='string'?i:`${i.entryId}:${i.start}:${i.end}`));
    const unique=new Map();for(const i of issues) {const key=`${i.entryId}:${i.start}:${i.end}`;if(!ignored.has(key))unique.set(`${key}:${i.code}`,i);}
    return {issues:[...unique.values()],coverage:reasons.size?'partial':'complete',incompleteReasons:[...reasons]};
}
