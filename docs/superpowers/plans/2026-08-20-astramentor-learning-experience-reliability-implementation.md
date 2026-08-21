# AstraMentor 学习体验与可靠性改造实施计划

对应规格：`docs/superpowers/specs/2026-08-20-astramentor-learning-experience-reliability-design.md`

## 目标

在不引入数据库和用户系统的前提下，实现后端持久化学习历史、自由问答生成参数、讲解/问答流式输出、高对比度夜间主题、星图容器响应式布局，以及严格绑定当前步骤的测验上下文。

## 任务 1：会话模型、仓库与 API

文件：

- 新增 `services/session_repository.py`
- 修改 `backend/models.py`
- 新增 `backend/session_api.py`
- 修改 `backend/app.py`
- 新增 `tests/test_sessions.py`

步骤：

1. 定义会话摘要、完整快照和通用 JSON 载荷模型。
2. 实现安全 session ID、索引重建、按更新时间排序、原子写入和损坏文件隔离。
3. 实现列表、详情、保存和删除 API。
4. 测试保存、恢复、删除、排序、旧字段兼容和损坏隔离。

验收：会话 API 可独立通过 FastAPI 冒烟测试，仓库单元测试通过。

## 任务 2：统一生成参数与流式模型适配

文件：

- 修改 `backend/models.py`
- 修改 `utils/api_client.py`
- 新增 `services/streaming_service.py`
- 新增 `tests/test_streaming.py`

步骤：

1. 增加 `GenerationOptions(max_tokens, thinking)`，只挂到 ChatRequest。
2. 重构 APIClient 的 max_tokens 传递，移除小值被忽略的旧逻辑。
3. 为 Gemini 和 OpenAI 兼容接口增加流生成器；OpenAI 兼容接口通过 extra_body 映射 reasoning。
4. 统一输出 meta、reasoning_delta、content_delta、warning、done、error 事件。
5. 处理取消、上游不支持流式和 reasoning 不可用的降级。
6. 测试事件编码、拆分、参数传递、降级和取消。

验收：模拟 Provider 可验证首个增量、reasoning/content 分离及 max_tokens 传递。

## 任务 3：学习流式接口与测验上下文

文件：

- 修改 `core/learner_state.py`
- 修改 `agents/teacher_agent.py`
- 修改 `services/learning_service.py`
- 修改 `backend/api.py`
- 修改 `backend/doc_api.py`
- 修改 `backend/models.py`
- 新增 `tests/test_quiz_context.py`

步骤：

1. KnowledgePoint 增加最近完整讲解、讲解步骤和计划版本字段。
2. TeacherAgent 抽取可复用的讲解、重讲、问答 Prompt 构建器。
3. LearningService 为讲课、下一步、重讲和自由问答准备流上下文及完成回调。
4. 增加四个流式端点并保持旧端点可用。
5. 生成题目前构建 QuizContext，严格注入当前步骤、最近完整讲解和教材证据。
6. 返回 question_id，评估时校验 question_id、步骤和节点。
7. 被停止/中断的讲解不得更新 last_teaching_content。
8. 测试跨节点、跨步骤、旧题和缺少讲解上下文。

验收：题目 Prompt 中存在当前步骤和最近讲解，旧题提交被拒绝。

## 任务 4：前端会话 API、历史 Hook 与主页轨道

文件：

- 修改 `frontend/src/types/index.ts`
- 新增 `frontend/src/api/sessions.ts`
- 新增 `frontend/src/hooks/useLearningSessions.ts`
- 新增 `frontend/src/features/history/HomeHistoryRail.tsx`
- 修改 `frontend/src/features/home/HomePage.tsx`
- 修改 `frontend/src/App.tsx`
- 修改 `frontend/src/index.css`

步骤：

1. 定义 SessionSummary、SessionSnapshot 和扩展 NodeSessionState 类型。
2. 实现列表、保存、加载、删除 API。
3. Hook 管理最近列表、自动保存状态和错误提示。
4. 主页采用课程区 + 右侧历史轨道，显示最近 6 条。
5. App 恢复到具体节点、教学步骤、聊天和测验状态。
6. 在明确学习状态变更点保存，不按 Token 保存。

验收：刷新后能从主页恢复上次知识点，删除记录同步删除后端文件。

## 任务 5：流式前端、参数控制与节点状态隔离

文件：

- 新增 `frontend/src/api/streaming.ts`
- 新增 `frontend/src/hooks/useStreamingResponse.ts`
- 新增 `frontend/src/features/chat/GenerationControls.tsx`
- 修改 `frontend/src/features/chat/ChatInterface.tsx`
- 修改 `frontend/src/App.tsx`
- 修改 `frontend/src/types/index.ts`

步骤：

1. 实现 POST SSE parser，处理拆包、粘包和多行 data。
2. Hook 管理 reasoning/content 增量、AbortController、停止和错误。
3. 增加 Token 预设、自定义验证、Thinking 开关和 localStorage 偏好。
4. ChatMessage 增加 reasoning、status 和 requestId。
5. 自由问答、讲课、下一步和重讲切换到流式端点。
6. reasoning 折叠展示，停止后保留部分内容。
7. NodeSessionState 保存题目、question_id、交互状态和步骤，切换节点完整恢复或清空。

验收：内容逐段出现，停止有效，切换节点不会出现旧题。

## 任务 6：夜间主题与容器响应式布局

文件：

- 修改 `frontend/src/App.tsx`
- 修改 `frontend/src/index.css`
- 修改 `frontend/src/features/dashboard/Dashboard.tsx`
- 修改 `frontend/src/features/graph/KnowledgeGraph.tsx`
- 修改相关 UI 组件类名

步骤：

1. 主题状态统一为 light/dark。
2. 建立深紫夜间语义颜色变量，覆盖面板、卡片、文字、输入、弹窗和滚动条。
3. Dashboard 移除固定宽度，增加完整卡片和紧凑胶囊模式。
4. 星图外层声明 container-type，按 720px、480px 切换统计与工具栏布局。
5. 分栏子项补齐 min-width: 0，工具栏允许换行，避免绝对定位覆盖。
6. 检查图谱节点标签、Tooltip 和弹层 z-index。

验收：拉宽聊天区后统计与工具不重叠；夜间所有关键文字可辨。

## 任务 7：回归、文档与交付

步骤：

1. 运行 Python 单元测试和 compileall。
2. 运行 FastAPI 会话、课程和流式 API 冒烟测试。
3. 运行前端 ESLint、TypeScript 和 Vite 生产构建。
4. 更新 README：历史、流式、参数、模型 Thinking 能力与启动说明。
5. 记录未解决的 Provider 限制和依赖审计问题。

验收：所有新增测试和原 RAG 测试通过，前端 lint/build 通过。
