// 酒馆工坊 · 首页视图：三主题欢迎区、预设编辑入口和装饰线稿，不接触预设状态或编辑器布局。
const svg = (body, viewBox = '0 0 24 24') => `<svg viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
const star = svg('<path d="M12 2c1.2 6.3 3.7 8.8 10 10-6.3 1.2-8.8 3.7-10 10C10.8 15.7 8.3 13.2 2 12c6.3-1.2 8.8-3.7 10-10Z"/>');
const arrow = svg('<path d="M5 12h14m-6-6 6 6-6 6"/>');
const command = svg('<path d="M8 8V5a3 3 0 1 0-3 3h14a3 3 0 1 0-3-3v14a3 3 0 1 0 3-3H5a3 3 0 1 0 3 3V8Z"/>');
const bulb = svg('<path d="M9 18h6m-5 3h4M8 14a7 7 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z"/><path d="m10 9 2 2 2-2m-2 2v5"/>');
const paw = svg('<ellipse cx="7" cy="6" rx="2" ry="2.7"/><ellipse cx="17" cy="6" rx="2" ry="2.7"/><ellipse cx="3.5" cy="12" rx="1.8" ry="2.3"/><ellipse cx="20.5" cy="12" rx="1.8" ry="2.3"/><path d="M6 19c-2-3 1-7 6-7s8 4 6 7c-2 3-4 0-6 0s-4 3-6 0Z"/>');
const heart = svg('<path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-5 5 8 15 8 15S25 10 20 5Z"/>');
const sleepingCat = svg('<path d="M24 49 20 29l15 8c8-5 16-5 24-1l12-11 1 19c16-22 65-24 75 3 13 34-30 44-51 30M26 49c-10 14-3 28 13 28h23c15 0 21-9 16-23M38 55l5 3 5-3m11 0 5 2 4-4m-18 9 5 1-2 5m-19-7-15-2m16 8-16 3m47-7 15-4m-13 10 14 1M89 57c-20 0-24 28 0 28h24c25 0 41-9 44-23M11 17h10L11 27h10M1 3h7L1 10h7"/>', '0 0 166 94');

// 自适应只使用 currentColor 线稿：不烘焙底色，深浅及彩色酒馆主题都能自然接入。
const friends = svg(`
  <path d="M44 185h207v43H44c-20 0-20-43 0-43Zm0 7h187m-187 8h187m-186 19h186M66 229v13h179v-14M66 235h153"/>
  <path d="M81 149c-15-15-19-36-10-57l-2-36 32 22c19-10 39-9 57 0l29-23 2 40c9 20 3 41-10 54M81 83l-2-13 14 12m75 0 12-11-1 17"/>
  <path d="M95 117c4-5 9-5 13 0m34 0c4-5 9-5 13 0m-36 12 7 4 7-4-14 0m7 4c0 10-13 11-15 4m15-4c0 10 13 11 15 4M84 126l-21-4m22 13-20 3m98-12 22-4m-21 13 20 3"/>
  <path d="M94 149c-17-13-27 6-20 22 5 11 23 9 27-3m57-20c17-12 27 7 20 23-5 11-23 8-27-4m-51-11c14 5 29 5 44 0M185 104c29-29 69-3 67 34m-58 5c15-1 21 14 13 25M246 119c15-21 45-19 53-1"/>
  <path d="M265 164c12-20 42-22 63-12 30-11 59 8 62 35 22 5 20 26 0 31h-83M272 158c-19-7-38 18-37 34 1 13 16 13 22 4l17-27m54-17c11-17 31 1 29 17l-8 26c-4 13-17 9-17-2l-2-24"/>
  <path d="M270 188c3 5 8 5 11 0m21 0c3 5 8 5 11 0m-24 13 7 4 7-4c-3-4-11-4-14 0Zm7 4v6m-13 2c8 4 17 4 24 0M268 219c-16-9-27 7-13 15h21m39-15c-13-8-25 7-12 15h24m31-16c11 0 19-4 21-11"/>
  <path d="M333 94c0-15 6-24 12-30m-12 30c-15-9-14-21-14-21s13 2 15 13m5-11c15-3 20-14 20-14s-13-3-20 6M216 54l4-11 4 11 11 4-11 4-4 11-4-11-11-4 11-4ZM46 128l2-7 3 7 7 2-7 3-3 7-2-7-7-3 7-2Z"/>
  <path d="M366 121c-8-12-21-1 0 11 21-12 8-23 0-11ZM28 247c51 6 295 8 388-3"/>
`, '0 0 440 270');

export function createToolboxHome({ themeIcon, onCycleTheme }) {
  const home = document.createElement('main');
  home.className = 'pcm-toolbox-home';
  home.innerHTML = `
    <header class="pcm-home-top">
      <div class="pcm-home-brand"><span class="pcm-home-brand-mark">${star}</span><div><h1>酒馆工坊</h1></div></div>
      <div class="pcm-toolbox-home-actions">
        <button type="button" class="pcm-toolbox-theme" data-theme-toggle title="切换插件配色：自适应 / 日间 / 夜间" aria-label="切换插件配色：自适应 / 日间 / 夜间"></button>
        <button type="button" class="pcm-toolbox-close" data-action="close" title="关闭插件" aria-label="关闭插件">${svg('<path d="m6 6 12 12M6 18 18 6"/>')}</button>
      </div>
    </header>
    <div class="pcm-home-content">
      <section class="pcm-home-welcome" aria-label="酒馆工坊">
        <span class="pcm-home-tape" aria-hidden="true"></span>
        <div class="pcm-home-art" aria-hidden="true">
          <img class="pcm-home-day-art" src="${new URL('./assets/workshop-day.png', import.meta.url).href}" alt="" width="1536" height="1024" draggable="false">
          <img class="pcm-home-night-art" src="${new URL('./assets/workshop-night.png', import.meta.url).href}" alt="" width="1536" height="1024" draggable="false">
          <div class="pcm-home-auto-art">${friends}</div>
        </div>
        <span class="pcm-home-paw" aria-hidden="true">${paw}</span>
      </section>
      <button type="button" class="pcm-toolbox-card" data-action="open-editor">
        <span class="pcm-toolbox-card-icon" aria-hidden="true">${command}</span>
        <span class="pcm-toolbox-card-copy"><strong>预设编辑</strong><small>对比、迁移、排序并检查预设内容</small></span>
        <span class="pcm-home-card-go"><i aria-hidden="true">${arrow}</i></span>
      </button>
      <p class="pcm-toolbox-hint">更多酒馆工具将陆续加入</p>
    </div>`;
  const theme = home.querySelector('[data-theme-toggle]');
  theme.innerHTML = themeIcon;
  theme.addEventListener('click', onCycleTheme);
  return home;
}
