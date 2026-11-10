// 创作者符号的纯文本编辑计划：前缀逐个非空选中行添加，成对符号包裹完整选区。
export const CREATOR_SYMBOLS = Object.freeze([
  {id:'h1',label:'#',title:'一级标题',prefix:'# '},
  {id:'h2',label:'##',title:'二级标题',prefix:'## '},
  {id:'h3',label:'###',title:'三级标题',prefix:'### '},
  {id:'list',label:'-',title:'列表',prefix:'- '},
  {id:'quote',label:'>',title:'引用',prefix:'> '},
  {id:'bold',label:'**',title:'双星号包裹',open:'**',close:'**'},
  {id:'corner',label:'【】',title:'方头括号包裹',open:'【',close:'】'},
  {id:'square',label:'[]',title:'方括号包裹',open:'[',close:']'},
  {id:'brace',label:'{}',title:'花括号包裹',open:'{',close:'}'},
]);

export function planCreatorSymbol(text, start, end, id) {
  const symbol = CREATOR_SYMBOLS.find(item => item.id === id);
  if (!symbol || typeof text !== 'string' || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length) throw Error('请重新选择要编辑的正文');
  const selected = text.slice(start, end);
  if (!selected.trim()) throw Error('请选择包含文字的正文');
  const replacement = symbol.prefix ? selected.replace(/[^\r\n]+/g, line => line.trim() ? symbol.prefix + line : line) : symbol.open + selected + symbol.close;
  return {before:text,start,end,replacement,selectionStart:start,selectionEnd:start + replacement.length};
}
