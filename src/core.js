// 预设更新编辑器 · 纯功能核心：不接触 DOM，可在 Node 中直接回归测试。
// 预设校验、prompt_order 顺序节点选择、正则配对/迁移、比对归一化/正文相似度、Myers 混合粒度 diff、变量宏解析。
const ALL_TRIGGERS = ['continue', 'impersonate', 'normal', 'quiet', 'regenerate', 'swipe'];
const LINE_DIFF_LIMIT = 200_000;
const CHAR_DIFF_LIMIT = 40_000;
const DIFF_MAX_SEQUENCE = 4_000;
const MYERS_MAX_DISTANCE = 800;

export const VAR_GET_RE = /\{\{(?:getvar|getglobalvar|var)::([^:}]+)/g;

export const clone = value => structuredClone(value);

function normalizeTrigger(value) {
  if (!Array.isArray(value)) return [];
  const sorted = [...value].sort();
  return sorted.length === ALL_TRIGGERS.length && ALL_TRIGGERS.every((trigger, index) => sorted[index] === trigger)
    ? []
    : sorted;
}

export function normalizeForCompare(value, ignoreWhitespace = false) {
  if (Array.isArray(value)) return value.map(item => normalizeForCompare(item, ignoreWhitespace));
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (!keys.includes('injection_trigger')) keys.push('injection_trigger');
    return Object.fromEntries(keys.sort().map(key => [
      key,
      key === 'injection_trigger'
        ? normalizeTrigger(value[key])
        : normalizeForCompare(value[key], ignoreWhitespace),
    ]));
  }
  return ignoreWhitespace && typeof value === 'string' ? value.replace(/\s+/g, '') : value;
}

export function equalValues(left, right, ignoreWhitespace = false) {
  return JSON.stringify(normalizeForCompare(left, ignoreWhitespace))
    === JSON.stringify(normalizeForCompare(right, ignoreWhitespace));
}

export function validatePreset(data) {
  if (!data || !Array.isArray(data.prompts)) {
    throw new Error('不是有效的 SillyTavern OpenAI 预设：缺少 prompts 数组。');
  }
  const identifiers = new Set();
  for (const prompt of data.prompts) {
    if (!prompt || typeof prompt.identifier !== 'string' || !prompt.identifier) {
      throw new Error('存在没有 identifier 的条目。');
    }
    if (identifiers.has(prompt.identifier)) throw new Error(`条目 ID 重复：${prompt.identifier}`);
    identifiers.add(prompt.identifier);
  }
  return data;
}

export function findPromptOrderEntry(preset) {
  if (!preset) return null;
  if (!Array.isArray(preset.prompt_order)) preset.prompt_order = [];
  const identifiers = new Set((preset.prompts || []).map(prompt => prompt.identifier));
  let best = preset.prompt_order.find(entry => Number(entry?.character_id) === 100001 && Array.isArray(entry.order));
  if (!best) {
    const score = entry => entry.order.reduce((count, item) => {
      const identifier = typeof item === 'string' ? item : item?.identifier;
      return count + (identifiers.has(identifier) ? 1 : 0);
    }, 0);
    best = preset.prompt_order
      .filter(entry => Array.isArray(entry?.order))
      .sort((left, right) => score(right) - score(left) || right.order.length - left.order.length)[0];
  }
  return best || null;
}

export function getRegexScripts(preset) {
  return Array.isArray(preset?.extensions?.regex_scripts) ? preset.extensions.regex_scripts : [];
}

// 正则先按稳定 ID 配对；剩余项目仅在两侧名称都唯一时才按名称配对，避免重名正则误覆盖。
export function pairRegexScripts(oldPreset, newPreset) {
  const oldScripts = getRegexScripts(oldPreset);
  const newScripts = getRegexScripts(newPreset);
  const pairs = [];
  const usedOld = new Set();
  const usedNew = new Set();

  const uniqueIndexes = (scripts, field, excluded) => {
    const indexes = new Map();
    for (let index = 0; index < scripts.length; index++) {
      if (excluded.has(index)) continue;
      const value = String(scripts[index]?.[field] || '').trim();
      if (!value) continue;
      const matches = indexes.get(value) || [];
      matches.push(index);
      indexes.set(value, matches);
    }
    return indexes;
  };

  const oldIds = uniqueIndexes(oldScripts, 'id', usedOld);
  const newIds = uniqueIndexes(newScripts, 'id', usedNew);
  for (const [id, oldIndexes] of oldIds) {
    const newIndexes = newIds.get(id);
    if (oldIndexes.length !== 1 || newIndexes?.length !== 1) continue;
    const oldIndex = oldIndexes[0];
    const newIndex = newIndexes[0];
    pairs.push({ oldIndex, newIndex, kind: 'id' });
    usedOld.add(oldIndex);
    usedNew.add(newIndex);
  }

  const oldNames = uniqueIndexes(oldScripts, 'scriptName', usedOld);
  const newNames = uniqueIndexes(newScripts, 'scriptName', usedNew);
  for (const [name, oldIndexes] of oldNames) {
    const newIndexes = newNames.get(name);
    if (oldIndexes.length !== 1 || newIndexes?.length !== 1) continue;
    const oldIndex = oldIndexes[0];
    const newIndex = newIndexes[0];
    pairs.push({ oldIndex, newIndex, kind: 'name' });
    usedOld.add(oldIndex);
    usedNew.add(newIndex);
  }

  for (let oldIndex = 0; oldIndex < oldScripts.length; oldIndex++) {
    if (!usedOld.has(oldIndex)) pairs.push({ oldIndex, newIndex: null, kind: 'old-only' });
  }
  for (let newIndex = 0; newIndex < newScripts.length; newIndex++) {
    if (!usedNew.has(newIndex)) pairs.push({ oldIndex: null, newIndex, kind: 'new-only' });
  }
  return pairs;
}

export function copyRegexScript(sourcePreset, targetPreset, sourceSide, sourceIndex) {
  if (!['old', 'new'].includes(sourceSide)) throw new Error('正则来源版本无效。');
  const sourceScripts = getRegexScripts(sourcePreset);
  const script = sourceScripts[sourceIndex];
  if (!script || typeof script !== 'object' || Array.isArray(script)) throw new Error('找不到要迁移的正则。');

  const oldPreset = sourceSide === 'old' ? sourcePreset : targetPreset;
  const newPreset = sourceSide === 'new' ? sourcePreset : targetPreset;
  const pair = pairRegexScripts(oldPreset, newPreset).find(item => item[sourceSide + 'Index'] === sourceIndex);
  const targetSide = sourceSide === 'old' ? 'new' : 'old';
  const counterpartIndex = pair?.[targetSide + 'Index'];

  if (!targetPreset.extensions || typeof targetPreset.extensions !== 'object' || Array.isArray(targetPreset.extensions)) {
    targetPreset.extensions = {};
  }
  if (!Array.isArray(targetPreset.extensions.regex_scripts)) targetPreset.extensions.regex_scripts = [];
  const targetScripts = targetPreset.extensions.regex_scripts;

  if (counterpartIndex !== null && counterpartIndex !== undefined) {
    targetScripts[counterpartIndex] = clone(script);
    return { mode: 'overwrite', index: counterpartIndex };
  }

  const sourceIndexField = sourceSide + 'Index';
  const targetIndexField = targetSide + 'Index';
  const pairs = pairRegexScripts(oldPreset, newPreset);
  let insertIndex = targetScripts.length;
  let anchoredAfterPrevious = false;
  for (let index = sourceIndex - 1; index >= 0; index--) {
    const previous = pairs.find(item => item[sourceIndexField] === index && item[targetIndexField] !== null);
    if (previous) {
      insertIndex = previous[targetIndexField] + 1;
      anchoredAfterPrevious = true;
      break;
    }
  }
  if (!anchoredAfterPrevious) {
    for (let index = sourceIndex + 1; index < sourceScripts.length; index++) {
      const next = pairs.find(item => item[sourceIndexField] === index && item[targetIndexField] !== null);
      if (next) {
        insertIndex = next[targetIndexField];
        break;
      }
    }
  }
  targetScripts.splice(insertIndex, 0, clone(script));
  return { mode: 'insert', index: insertIndex };
}

function bigramSet(text) {
  const result = new Set();
  if (text.length < 2) {
    if (text) result.add(text);
    return result;
  }
  for (let index = 0; index < text.length - 1; index++) result.add(text.slice(index, index + 2));
  return result;
}

export function contentSimilarity(left, right, ignoreWhitespace = false) {
  const normalize = value => {
    const text = String(value || '');
    return ignoreWhitespace ? text.replace(/\s+/g, '') : text;
  };
  const leftBigrams = bigramSet(normalize(left));
  const rightBigrams = bigramSet(normalize(right));
  if (!leftBigrams.size && !rightBigrams.size) return 1;
  let intersection = 0;
  for (const bigram of leftBigrams) if (rightBigrams.has(bigram)) intersection++;
  return (2 * intersection) / (leftBigrams.size + rightBigrams.size);
}

function myers(left, right) {
  const leftLength = left.length;
  const rightLength = right.length;
  if (!leftLength) return right.map(value => ['+', value]);
  if (!rightLength) return left.map(value => ['-', value]);

  const offset = leftLength + rightLength;
  const width = 2 * offset + 1;
  let frontier = new Int32Array(width);
  const trace = [];
  let distance = -1;

  for (let d = 0; d <= offset; d++) {
    if (d > MYERS_MAX_DISTANCE) return null;
    trace.push(frontier);
    const next = frontier.slice();
    for (let diagonal = -d; diagonal <= d; diagonal += 2) {
      let x = diagonal === -d || (diagonal !== d && next[diagonal - 1 + offset] < next[diagonal + 1 + offset])
        ? next[diagonal + 1 + offset]
        : next[diagonal - 1 + offset] + 1;
      let y = x - diagonal;
      while (x < leftLength && y < rightLength && left[x] === right[y]) {
        x++;
        y++;
      }
      next[diagonal + offset] = x;
      if (x >= leftLength && y >= rightLength) {
        distance = d;
        break;
      }
    }
    frontier = next;
    if (distance >= 0) break;
  }

  const operations = [];
  let x = leftLength;
  let y = rightLength;
  for (let d = distance; d > 0; d--) {
    const previous = trace[d];
    const diagonal = x - y;
    const previousDiagonal = diagonal === -d
      || (diagonal !== d && previous[diagonal - 1 + offset] < previous[diagonal + 1 + offset])
      ? diagonal + 1
      : diagonal - 1;
    const previousX = previous[previousDiagonal + offset];
    const previousY = previousX - previousDiagonal;
    while (x > previousX && y > previousY) {
      operations.push([' ', left[x - 1]]);
      x--;
      y--;
    }
    if (x === previousX) operations.push(['+', right[--y]]);
    else operations.push(['-', left[--x]]);
  }
  while (x > 0 && y > 0) {
    operations.push([' ', left[x - 1]]);
    x--;
    y--;
  }
  operations.reverse();
  return operations;
}

function diffSequence(left, right, limit) {
  let start = 0;
  const shorter = Math.min(left.length, right.length);
  while (start < shorter && left[start] === right[start]) start++;

  let leftEnd = left.length;
  let rightEnd = right.length;
  while (leftEnd > start && rightEnd > start && left[leftEnd - 1] === right[rightEnd - 1]) {
    leftEnd--;
    rightEnd--;
  }

  const operations = [];
  for (let index = 0; index < start; index++) operations.push([' ', left[index]]);
  const leftMiddleLength = leftEnd - start;
  const rightMiddleLength = rightEnd - start;
  let middle = null;
  if (leftMiddleLength > 0
    && rightMiddleLength > 0
    && leftMiddleLength * rightMiddleLength <= limit
    && leftMiddleLength + rightMiddleLength <= DIFF_MAX_SEQUENCE) {
    middle = myers(left.slice(start, leftEnd), right.slice(start, rightEnd));
  }
  if (middle) operations.push(...middle);
  else {
    for (let index = start; index < leftEnd; index++) operations.push(['-', left[index]]);
    for (let index = start; index < rightEnd; index++) operations.push(['+', right[index]]);
  }
  for (let index = leftEnd; index < left.length; index++) operations.push([' ', left[index]]);
  return operations;
}

export function diffLines(oldText, newText) {
  return diffSequence(String(oldText).split('\n'), String(newText).split('\n'), LINE_DIFF_LIMIT);
}

function inlineTokens(text) {
  return String(text).match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{L}\p{M}\p{N}_]+(?:['’\-][\p{L}\p{M}\p{N}_]+)*|\s+|[^\s]/gu) || [];
}

function inlineOperations(oldLine, newLine) {
  const operations = diffSequence(inlineTokens(oldLine), inlineTokens(newLine), CHAR_DIFF_LIMIT);
  const segments = [];
  for (const [type, token] of operations) {
    const previous = segments[segments.length - 1];
    if (previous?.type === type) previous.text += token;
    else segments.push({ type, text: token });
  }
  return segments;
}

export function buildRows(operations) {
  const rows = [];
  let index = 0;
  while (index < operations.length) {
    if (operations[index][0] === ' ') {
      rows.push({ t: ' ', paired: false, segs: [{ t: ' ', text: operations[index][1] }] });
      index++;
      continue;
    }
    const deleted = [];
    const inserted = [];
    while (index < operations.length && operations[index][0] === '-') deleted.push(operations[index++][1]);
    while (index < operations.length && operations[index][0] === '+') inserted.push(operations[index++][1]);
    const pairCount = Math.min(deleted.length, inserted.length);
    const paired = [];
    for (let pair = 0; pair < pairCount; pair++) paired.push(inlineOperations(deleted[pair], inserted[pair]));
    for (let item = 0; item < deleted.length; item++) {
      const segments = item < pairCount
        ? paired[item].map(segment => ({ t: segment.type, text: segment.text }))
        : [{ t: '-', text: deleted[item] }];
      rows.push({ t: '-', paired: item < pairCount, segs: segments });
    }
    for (let item = 0; item < inserted.length; item++) {
      const segments = item < pairCount
        ? paired[item].map(segment => ({ t: segment.type, text: segment.text }))
        : [{ t: '+', text: inserted[item] }];
      rows.push({ t: '+', paired: item < pairCount, segs: segments });
    }
  }
  return rows;
}

export function parseVarContent(content) {
  const segments = [];
  let last = 0;
  const pattern = /\{\{(?:setvar|setglobalvar)::([^:}]+)::([\s\S]*?)\}\}/g;
  let match;
  while ((match = pattern.exec(content))) {
    if (match.index > last) segments.push({ type: 'text', value: content.slice(last, match.index) });
    segments.push({ type: 'set', name: match[1], value: match[2], raw: match[0] });
    last = match.index + match[0].length;
  }
  if (last < content.length) segments.push({ type: 'text', value: content.slice(last) });
  return segments;
}

// 保存回酒馆的决策/同步纯逻辑（供 src/host.js 使用，可在 Node 中直接测试）：
// - shouldRefreshActivePreset：保存的预设是否为酒馆预设管理器当前活动预设（决定是否走刷新路径）
// - applyPresetToMemory：skipUpdate 跳过 updateList 后，把新数据同步写回内存预设数组
export function shouldRefreshActivePreset(activeName, name) {
  return Boolean(activeName) && String(activeName) === String(name);
}

export function applyPresetToMemory(presets, presetNames, name, preset) {
  if (!Array.isArray(presets)) return false;
  const index = Array.isArray(presetNames) ? presetNames.indexOf(name) : presetNames?.[name];
  if (index === undefined || index < 0 || index >= presets.length) return false;
  presets[Number(index)] = preset;
  return true;
}
