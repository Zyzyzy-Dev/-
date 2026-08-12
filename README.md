# 预设条目对比、编辑与拖拽迁移

## 2.1.0

### 移动端
- 修复导出等按钮文字被酒馆移动端样式隐藏的问题。
- 项目名称、保存项目、保存修改、项目选择、加载、删除和撤回改为始终可见的横向滚动工具栏。
- 顶部工具栏固定，双预设栏改为上下排列。

### BaiBai Tools 分组兼容
- 识别 extensions.baibaiToolkit.presetPromptGroups。
- 跨栏迁移时，根据目标插入点前后条目的 groupId 将新条目放入对应分组。
- 同栏排序保留条目原有分组。
- 同时更新 prompt_order；撤回操作会恢复 extensions 分组元数据。
- 保留 extensions.entryGrouping 等旧兼容字段，不主动删除。