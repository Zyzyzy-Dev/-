// 酒馆工坊首页：紧凑编辑入口与原创小猫插图，共享三主题，不接触预设状态。
const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
const star = svg('<path d="M12 2c1.2 6.3 3.7 8.8 10 10-6.3 1.2-8.8 3.7-10 10C10.8 15.7 8.3 13.2 2 12c6.3-1.2 8.8-3.7 10-10Z"/>');
const arrow = svg('<path d="M5 12h14m-6-6 6 6-6 6"/>');
const notesCat = new URL('./assets/kitten-notes.png', import.meta.url).href;
const boxCat = new URL('./assets/kitten-box.png', import.meta.url).href;

export function createToolboxHome({ themeIcon, onCycleTheme }) {
  const home = document.createElement('main');
  home.className = 'pcm-toolbox-home';
  home.innerHTML = `
    <header class="pcm-home-top">
      <div class="pcm-home-brand"><span class="pcm-home-brand-mark">${star}</span><h1>酒馆工坊</h1></div>
      <div class="pcm-toolbox-home-actions">
        <button type="button" class="pcm-toolbox-theme" data-theme-toggle title="切换插件配色：自适应 / 日间 / 夜间" aria-label="切换插件配色：自适应 / 日间 / 夜间"></button>
        <button type="button" class="pcm-toolbox-close" data-action="close" title="关闭插件" aria-label="关闭插件">${svg('<path d="m6 6 12 12M6 18 18 6"/>')}</button>
      </div>
    </header>
    <div class="pcm-home-content">
      <button type="button" class="pcm-toolbox-card" data-action="open-editor">
        <span class="pcm-toolbox-card-icon" aria-hidden="true"><img src="${notesCat}" alt="" width="128" height="128" draggable="false"></span>
        <span class="pcm-toolbox-card-copy"><strong>预设编辑</strong><small>对比、迁移、排序并检查预设内容</small></span>
        <span class="pcm-home-card-go" aria-hidden="true">${arrow}</span>
      </button>
      <div class="pcm-home-companion" aria-hidden="true"><img src="${boxCat}" alt="" width="288" height="192" draggable="false"></div>
      <p class="pcm-toolbox-hint">更多酒馆工具将陆续加入</p>
    </div>`;
  const theme = home.querySelector('[data-theme-toggle]');
  theme.innerHTML = themeIcon;
  theme.addEventListener('click', onCycleTheme);
  return home;
}
