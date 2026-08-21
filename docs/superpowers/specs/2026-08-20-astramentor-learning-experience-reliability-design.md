# AstraMentor 学习体验与可靠性改造设计

日期：2026-08-20  
状态：已由用户批准设计，等待书面规格复核

## 1. 背景与目标

本次改造解决用户在持续使用 AstraMentor 后发现的五类问题：

1. 主页面缺少可跨浏览器刷新和后端重启恢复的历史学习入口。
2. 自由对话无法控制最大输出 Token，也无法选择 Thinking 模式。
3. 讲课、重讲和自由问答必须等待完整响应，首字等待时间过长。
4. 夜间模式对比度不足；问答区拉宽、星图子面板被压窄时，统计卡片和工具栏互相覆盖。
5. 测验题没有严格绑定当前教学步骤和刚刚讲过的内容，切换知识点时还可能残留旧测验状态。

本次保持单用户、本地部署、JSON 文件持久化和 FastAPI + React 架构，不引入账号系统、数据库、任务队列或 WebSocket。

## 2. 已确认的产品选择

- 历史学习由后端持久化，并恢复课程、星图、最后知识点、教学步骤和聊天记录。
- 主页采用“课程区 + 右侧历史轨道”；移动端和窄屏时历史轨道移动到课程区下方。
- Max Token 和 Thinking 只影响学生自由提问，不影响星图、计划、出题和评分。
- Max Token 预设为 1024、2048、4096、8192，默认 4096；自定义范围 256～32768。
- Thinking 不受模型支持时自动降级并提示，不阻断回答。
- Thinking 的 reasoning 内容使用可折叠区域展示。
- 自由问答、开始讲课、下一步讲解和错误重讲采用流式输出。
- 星图、出题和评分继续使用非流式完整结果。
- 夜间主题采用高对比度深紫像素夜空。
- 星图子面板压窄时采用容器自适应紧凑布局，不限制用户继续拉宽问答区。
- 测验严格只考当前步骤和刚讲过的内容。

## 3. 总体架构

改造采用模块化方案，在现有架构中增加六个边界清晰的能力：

```text
SessionRepository      历史会话持久化与恢复
GenerationOptions      Max Token / Thinking 参数模型
StreamingService       上游模型流与 SSE 事件转换
QuizContext            当前步骤、最近讲解与题目绑定
ThemeTokens            统一明暗主题变量
ContainerResponsive    星图子容器响应式布局
```

前端增加：

```text
useLearningSessions    会话列表、恢复、自动保存与删除
useStreamingChat       流读取、增量消息、停止与错误状态
GenerationControls     Max Token 和 Thinking 控制栏
HomeHistoryRail        主页最近学习轨道
```

现有 `App.tsx` 只负责编排页面和学习动作，新模块负责持久化、流式协议和局部状态，避免继续扩大单文件职责。

## 4. 历史学习持久化

### 4.1 存储结构

```text
user_data/sessions/
├── index.json
├── session_001.json
├── session_002.json
└── session_003.json
```

`index.json` 只保存主页列表所需摘要，单个会话文件保存完整快照。写入过程使用“同目录临时文件 + 原子替换”，避免中断造成半写文件。

### 4.2 会话快照字段

- `schema_version`
- `session_id`
- `mode`: `course | topic | document | project`
- 显示标题、内部 topic、课程 ID 和课程标题
- 创建时间、更新时间和最后访问时间
- 完整星图和整体掌握度
- 最后选中的知识点 ID
- 各知识点的教学计划、当前步骤、步骤得分和掌握度
- 各知识点聊天消息、教材引用和联网来源
- 各知识点测验题、题目 ID、题目步骤、交互状态和最近错误分析
- 文档 ID、文档文件名或项目描述等模式字段

旧快照缺少新字段时由模型默认值补齐，不执行破坏性迁移。

会话快照负责恢复前端现场，现有 `LearnerState` 文件继续作为评分与掌握度的业务数据源。恢复时以后端 LearnerState 中较新的掌握度和步骤得分为准，再与会话中的 UI 状态合并，避免两份数据相互覆盖。

### 4.3 API

```text
GET    /api/sessions?limit=6
GET    /api/sessions/{session_id}
PUT    /api/sessions/{session_id}
DELETE /api/sessions/{session_id}
```

列表 API 返回摘要；详情 API 才读取完整会话，避免主页加载大量聊天文本。

### 4.4 自动保存时机

- 星图生成完成后。
- 切换知识点前。
- 教学计划生成后。
- 讲课、重讲、评分或下一步完成后。
- 每轮自由对话完成或被用户停止后。
- 返回主页前。

聊天流进行中不逐 Token 写磁盘，只在完成、停止或错误结束时保存，避免高频写入。

### 4.5 主页历史轨道

桌面端右侧展示最近 6 条，内容包括标题、模式、最后知识点、步骤进度、掌握度、最后时间、“继续学习”和“删除”。小屏幕时移动到课程卡片下方。继续学习会先拉取详情，再恢复具体知识点和交互状态。

## 5. 生成参数

### 5.1 请求模型

自由问答请求增加：

```json
{
  "max_tokens": 4096,
  "thinking": true
}
```

后端验证 `max_tokens` 范围为 256～32768。前端预设为 1024、2048、4096、8192，并允许自定义；用户偏好保存在 localStorage，但每次请求仍显式传递，后端不依赖浏览器状态。

### 5.2 Provider 适配

`APIClient` 接收统一 `GenerationOptions`，Provider 适配器转换为实际参数：

- OpenRouter/OpenAI 兼容端点通过兼容请求体传递 reasoning 配置。
- Gemini 原生端点仅在 SDK 和模型支持对应思考配置时传递。
- 其他 OpenAI 兼容服务允许提供 Provider 专用映射。
- 无法确认支持时不发送 Thinking 参数，流中先发 `warning` 后按普通模式继续。

旧代码中“小于等于 4096 的 max_tokens 被忽略”逻辑必须移除。结构化输出调用保持现有固定策略，不读取前端自由问答参数。

## 6. 流式输出协议

### 6.1 接口

保留现有非流式接口，新增：

```text
POST /api/learning/chat/stream
POST /api/learning/lesson/stream
POST /api/learning/next-step/stream
POST /api/learning/reteach/stream
```

文档和项目模式复用同一事件协议。星图生成、教学计划、出题和评分继续等待完整、可校验的结果。

### 6.2 传输

后端返回 `StreamingResponse(media_type="text/event-stream")`。前端使用 `fetch` 发 POST，再通过 `ReadableStream` 解析 SSE；不使用只适合 GET 的浏览器原生 `EventSource`。

事件类型：

```text
meta              请求 ID、实际参数、Thinking 是否生效
reasoning_delta   新增 reasoning 文本
content_delta     新增正式回答文本
citations         课程教材引用
sources           联网来源
warning           Thinking 降级或非致命问题
done              完成、步骤进度和最终状态
error             可展示的错误码和消息
```

所有事件包含 `request_id`；文本增量使用 JSON 字符串承载，不能拼接未转义的原始换行。

### 6.3 前端行为

- 首个事件到达后立即创建助手消息。
- reasoning 与 content 分开累积；reasoning 默认折叠。
- 流进行时显示停止按钮并禁止同一会话重复提交。
- 点击停止使用 `AbortController`；保留已接收内容并标记“已停止”。
- 流中断时保留内容，提供重新发送。
- citations 和 sources 在流尾追加到同一条消息。

### 6.4 资源释放

浏览器断开或用户停止时，后端取消上游流并关闭响应生成器，避免继续消耗 Token。上游不支持流式时，Provider 适配器允许返回单个完整 `content_delta`，同时通过 `warning` 说明已降级。

讲课类流只有收到正常 `done` 后才把完整输出提交为 `last_teaching_content` 并触发自动保存。被停止或中断的部分讲解只保留在聊天历史中，不得作为出题依据；学生需要重新完成该步骤讲解后才能测验。

## 7. 测验上下文绑定

### 7.1 根因

当前 `LearningService.generate_question()` 读取了 `plan_step`，但没有把步骤传给 `TeacherAgent.generate_question()`。前端 `currentQuestion`、`interactionState` 等又是全局状态，切换知识点可能保留旧题。

### 7.2 QuizContext

```text
session_id
question_id
knowledge_point_id
knowledge_point_name
plan_version
step_index
step_name
step_content
last_taught_step_index
last_teaching_content
course_evidence
```

讲课、下一步和重讲完成时，后端在当前 KnowledgePoint 中保存实际讲解内容及其步骤索引。开始测验前必须验证当前节点、当前步骤、最近讲解步骤和计划版本一致。

出题 Prompt 只允许使用：

- 当前步骤名称和内容要求。
- 最近一次实际讲解内容。
- 当前步骤检索到的课程教材证据。

Prompt 明确禁止考后续步骤、未讲内容或整个知识点的其他章节。没有有效最近讲解时返回 `quiz_context_missing`，前端提示“请先完成本步骤讲解，再开始测验”。

提交答案时携带 `question_id`。后端验证题目所属会话、知识点、步骤和计划版本，旧题不得用于新步骤评分。

### 7.3 节点级前端状态

`NodeSessionState` 增加：

```text
currentQuestion
questionId
questionStepIndex
interactionState
stepProgress
lastEvalAnalysis
```

切换节点时完整保存旧节点并恢复目标节点；目标节点没有状态时清空全部测验字段。

## 8. 夜间主题

主题值统一为 `light | dark`，删除用 `eye-care` 表示夜间模式的命名混乱。CSS 使用语义变量统一控制页面背景、面板、悬浮层、文字、边框、输入框、焦点和状态色。

夜间主题使用深紫像素夜空：

- 页面背景为近黑深紫。
- 主面板使用不透明或接近不透明的深紫实色。
- 主文字使用近白色，次要文字使用浅紫灰。
- 成功、警告和错误卡片使用独立高对比功能色。
- 输入框、菜单、弹窗、滚动条、星图标签和 Tooltip 全部覆盖夜间状态。
- 避免白色透明面板叠在深色 Canvas 上。
- 键盘焦点状态必须清晰可见。

## 9. 星图容器响应式布局

布局根据星图面板自身宽度切换，不能依赖浏览器 viewport。星图外层设置 CSS Container Query，并确保分栏子项使用 `min-width: 0`。

```text
容器宽度 ≥ 720px    完整统计卡片与完整工具栏
480px～719px         统计卡片变为紧凑胶囊，工具按钮换行
容器宽度 < 480px    统计分两行，工具按钮使用图标和 Tooltip
```

统计卡片移除固定 `w-32`；工具栏使用 `flex-wrap`；长标题省略并提供完整悬停提示。Dashboard、星图视图控制和新增节点按钮必须处于不同布局区域，不使用会互相覆盖的绝对定位组合。分隔条继续允许问答区自由拉宽。

## 10. 错误处理

- 模型配置错误：发送 `error` 事件并显示上游可读信息。
- Thinking 不支持：发送 `warning` 并自动降级。
- Token 非法：请求进入上游前返回 422。
- 用户停止：保留部分内容，消息状态标记为 stopped。
- 网络中断：保留部分内容，消息状态标记为 interrupted。
- 会话文件损坏：隔离为 `.corrupt`，其他会话照常加载。
- 自动保存失败：提示“进度尚未保存”，但不打断教学。
- 旧数据缺字段：使用默认值兼容。

## 11. 测试计划

### 11.1 后端

- SessionRepository 保存、读取、排序、删除、原子写和损坏隔离。
- GenerationOptions 边界值及非法值。
- Thinking 参数映射、支持检测与自动降级。
- SSE 事件顺序、转义、错误和取消。
- QuizContext 针对跨知识点、跨步骤、旧计划版本和旧题提交的拒绝测试。
- 课程证据与当前步骤共同进入出题上下文。

### 11.2 前端

- SSE parser 的拆包、粘包、多行 data、reasoning/content 分离和异常事件。
- 停止生成、重新发送和部分内容保留。
- 节点切换后测验状态隔离。
- 历史主页加载、详情恢复、删除和保存失败提示。
- 主题变量和所有关键组件的 dark 状态。
- 星图容器在 720px、719px、480px、479px 的布局行为。

### 11.3 回归

- 课程、自由主题、PDF 和项目模式均能生成与恢复。
- 非流式旧接口继续工作。
- 代码运行和星图 2D/3D 功能不回退。
- 前端 lint、TypeScript 构建和后端现有 RAG 测试继续通过。

## 12. 验收标准

- 刷新浏览器和重启后端后，主页可以恢复到上次知识点和教学步骤。
- 主页最近学习默认显示 6 条，并能继续或删除。
- 自由问答可以选择 Token 和 Thinking，偏好刷新后保留。
- 流式首段内容在完整回答结束前出现；停止后不再继续消耗上游 Token。
- reasoning 可折叠，正式答案与 reasoning 不混排。
- 问答区拉宽后，星图统计和工具栏不覆盖、不溢出。
- 夜间模式下关键文字、统计卡片、输入框、弹窗和星图标签清晰可辨。
- 每道题只考当前步骤刚讲过的内容，旧题不能提交给其他节点或步骤。
- 原有主要功能和质量检查不回退。

## 13. 非目标

- 本轮不增加登录、权限、多用户同步或云端数据库。
- 不把星图生成、出题和评分改为流式。
- 不展示模型未返回的隐藏推理；只展示服务商明确返回的 reasoning 字段。
- 不重构与本次五个问题无关的 Agent 和 PDF 解析逻辑。
