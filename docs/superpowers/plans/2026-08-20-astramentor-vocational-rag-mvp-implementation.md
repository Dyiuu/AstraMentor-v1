# AstraMentor 职业教育 RAG MVP 实施计划

依据：`docs/superpowers/specs/2026-08-20-astramentor-vocational-rag-mvp-design.md`

## 阶段 1：建立课程与 RAG 内核

1. 将首科目资料迁入 `rag/courses/agent-design/materials/`，创建 `course.yaml`。
2. 实现课程注册、Markdown 章节解析、稳定切块、BM25、RRF、可选 Embedding、索引 manifest 和引用校验。
3. 提供 `python -m rag.index` CLI，并创建首科目索引。
4. 为课程发现、切块、检索、降级和引用校验编写单元测试。

## 阶段 2：接入 FastAPI 与教学闭环

1. 新增 Course API：列表、详情、索引和搜索。
2. 为现有 Graph/Learning 请求增加可选 `course_id`。
3. 在 `LearningService` 中注入课程检索上下文，让计划、讲解、讨论、重讲、出题和评估共享证据。
4. 返回统一 citations 与 knowledge_scope，同时保持旧 sources 字段兼容。
5. 增加接口测试和 fake provider 测试边界。

## 阶段 3：改造学生端体验

1. 首页增加课程目录与索引状态，支持一键进入首科目。
2. 会话增加 `courseId/courseTitle`，所有课程学习请求携带 `course_id`。
3. 新增统一 Markdown 渲染组件和教材引用卡片，区分教材、联网来源和扩展知识。
4. 应用 A3 复古像素星图视觉：深紫黑、暖黄、珊瑚橙、薄荷绿、硬边框和像素阴影；正文保持易读。
5. 清理首页英文硬编码和重复渲染逻辑。

## 阶段 4：定向重构与质量收口

1. 抽取学习会话类型、响应类型和图谱辅助函数，减少 `App.tsx` 的重复更新逻辑。
2. 抽取图谱主题/数据转换/投影辅助函数，合并 2D/3D 重复计算。
3. 修复未使用参数、Effect 级联更新和新代码类型问题；对未能在本轮安全迁移的 G6 边界使用窄类型适配器。
4. 运行 `pytest`、`npm run lint`、`npm run build` 和首科目索引命令。
5. 启动前后端做端到端烟雾验证，记录任何需要后续处理的非阻断项。
