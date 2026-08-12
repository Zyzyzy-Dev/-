# 预设条目对比、编辑与拖拽迁移

## 2.0.1

- 修复酒馆预设拉取：动态导入 SillyTavern 官方 /scripts/openai.js 模块，读取 openai_setting_names 与 openai_settings。
- 酒馆预设按钮现在列出已经导入的 Chat Completion/OpenAI 预设。
- 已拖拽条目直接显示“已拖拽”标签。
- 已手动编辑条目直接显示“已修改”标签。
- 两种操作发生在同一条目时同时显示两个标签。

此功能读取的是 Chat Completion/OpenAI 预设；文本补全预设属于另一类数据结构。