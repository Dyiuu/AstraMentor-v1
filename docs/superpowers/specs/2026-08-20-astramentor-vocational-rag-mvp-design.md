# AstraMentor 职业教育 RAG MVP 设计

日期：2026-08-20  
状态：已完成方案讨论，等待书面确认  
目标版本：单科目学生自主学习 MVP

## 1. 背景与问题

AstraMentor 当前已经具备可运行的 React + FastAPI 全栈产品，并实现了《AstraMentor 1.24 后端工作流设计.pptx》中的主要闭环：知识星图、知识点实际掌握度 A、目标掌握度 B、教学计划、逐步讲解、检测评分、重讲与进入下一步。

当前需要解决三个相互关联的问题：

1. 界面视觉不够统一，现有像素、星空、普通组件等风格混杂，学习信息层级不清晰。
2. 教学内容尚未形成面向职业教育课程的可追溯知识边界；`rag/智能体设计与应用开发基础.md` 还没有被索引并接入教学、图谱和测评链路。
3. 前后端存在超大文件、重复流程、宽泛类型和无效状态。`frontend/src/App.tsx` 为 1374 行，`frontend/src/features/graph/KnowledgeGraph.tsx` 为 1719 行；设计阶段的 ESLint 基线为 113 个问题（112 个错误、1 个警告）。

## 2. 已确认的产品决策

- 首要用户：学生自主学习。
- 首个科目：《智能体设计与应用开发基础》。
- 产品主界面：以知识星图为视觉中心。
- 视觉方向：A3 复古像素星图。
- 阅读策略：像素风用于品牌、外框、按钮、图标、节点和状态反馈；教材正文、长对话和代码使用清晰的现代字体。
- 内容边界：教材优先并显示可追溯引用；教材不足时允许模型补充，但必须标记为“扩展知识”。
- RAG 策略：默认本地索引和本地关键词检索；配置 Embedding 后自动启用混合检索。
- 多科目扩展：目录即课程，每个课程使用 `course.yaml` 和若干 Markdown 资料；首版不建设教师上传后台。
- 改造方法：保留现有 React、FastAPI、多 Agent、A/B 权重、评分算法、文档模式、项目模式和 IDE，按学生学习闭环做模块化纵向改造。

## 3. 目标与非目标

### 3.1 MVP 目标

1. 学生可以选择一个已注册课程并进入该课程的知识星图。
2. 星图、讲解、问答和检测共享同一课程知识边界。
3. 教学回答能够展示教材章节、命中摘要和原文位置。
4. 没有 Embedding 配置时，系统仍可完整运行。
5. 新增课程只需新增目录和配置，不需要修改 Python 或 TypeScript 代码。
6. 现有 Plan → Teach → Quiz → Evaluate → Reteach/Next 闭环继续工作。
7. 前后端核心职责被拆分，静态检查、构建和自动化测试通过。

### 3.2 MVP 非目标

- 不实现教师后台、在线上传教材或课程审核流。
- 不实现登录、班级、社区、排行榜和多人协作。
- 不引入独立向量数据库或云端数据库。
- 不重写现有 Agent 框架，不迁移到 Google ADK/A2A。
- 不将移动端作为首要体验；首版仅保证窄屏可用。
- 不删除主题模式、文档模式和项目模式，但不对其进行大规模视觉重做。

## 4. 总体架构

系统分为四层：

1. **学生体验层（React）**：课程入口、复古像素星图、教学工作区、教材引用、检测和学习进度。
2. **应用接口层（FastAPI）**：Course API、Graph API、Learning API，并保留现有接口的兼容行为。
3. **领域服务层**：课程注册、索引、检索、引用校验、学习编排及现有 Knowledge/Teacher/Evaluation Agent。
4. **本地数据层**：课程资料、课程索引、知识图谱与学习状态。

RAG 不是独立聊天功能，而是 Graph、Teacher 和 Evaluation 三条链路共享的“课程证据层”：

- Knowledge Agent 使用课程目录和检索证据生成或扩展课程星图。
- Teacher Agent 使用当前节点、教学步骤、A/B 权重和检索证据生成讲解。
- Evaluation Agent 使用当前步骤目标和课程证据出题、评分及分析错误。

## 5. 课程目录与注册

### 5.1 目录规范

```text
rag/
  courses/
    agent-design/
      course.yaml
      materials/
        智能体设计与应用开发基础.md
  indexes/
    agent-design/
      manifest.json
      chunks.jsonl
      bm25.json
      vectors.jsonl        # 可选
```

现有 `rag/智能体设计与应用开发基础.md` 在实施时迁移到 `rag/courses/agent-design/materials/`，内容不做机械改写。

### 5.2 `course.yaml`

```yaml
id: agent-design
title: 智能体设计与应用开发基础
description: 面向职业教育的智能体设计、提示词、插件与工作流课程
locale: zh-CN
version: "1.0"
category: 人工智能应用
materials:
  - id: textbook
    title: 智能体设计与应用开发基础
    path: materials/智能体设计与应用开发基础.md
```

课程 ID 在全局唯一，且只允许小写字母、数字和连字符。资料路径必须解析到该课程目录内部，防止目录穿越。

### 5.3 Course Registry

`CourseRegistry` 在启动时扫描 `rag/courses/*/course.yaml`，并负责：

- 解析与校验课程元数据。
- 暴露课程列表、课程详情和索引状态。
- 隔离损坏课程；单个配置错误不阻断其他课程启动。
- 根据源文件哈希和索引 manifest 判断索引是否过期。

当前没有登录功能，因此学习状态使用 `local-default` 作为本地用户命名空间；数据键按 `(user_id, course_id, graph_id)` 组织，为未来登录迁移保留边界。

## 6. 索引构建

### 6.1 Markdown 解析与切块

解析器保留标题层级、章节路径、原文件、行号和代码块。切块规则为：

- 优先按 Markdown 标题和自然段落切分。
- 每块目标长度为 500–900 个中文字符。
- 相邻块保留 100–150 个字符的重叠。
- 不跨越一级章节；二级章节内容过长时再按段落组合。
- 代码块作为完整单元保留；过长代码块单独成块。
- 目录、版权页和服务说明保留在索引中，但默认检索权重低于教学章节。

每个 chunk 包含：

```text
chunk_id, course_id, material_id, document_title, source_path,
section_path, line_start, line_end, text, content_hash
```

`chunk_id` 由课程 ID、资料 ID、章节路径和内容哈希稳定生成。源文件未变化时重复建库得到相同 ID。

### 6.2 本地关键词索引

- 使用中文分词构建 BM25 词项索引。
- BM25 实现在项目内部，中文分词使用 `jieba`。
- 标题和章节路径使用高于正文的字段权重。
- 索引文件采用 JSON/JSONL，便于 MVP 调试和迁移。

当前教材规模约 476KB，本地 JSON 索引和内存检索足以满足 MVP。后续数据量显著增长时再评估 SQLite、FAISS 或外部向量数据库。

### 6.3 可选向量索引

向量检索由 `EmbeddingProvider` 接口隔离。配置以下环境变量后启用：

```text
ASTRA_RAG_EMBEDDING_PROVIDER
ASTRA_RAG_EMBEDDING_MODEL
ASTRA_RAG_EMBEDDING_API_KEY
ASTRA_RAG_EMBEDDING_ENDPOINT
```

如果专用 Key 或 Endpoint 未填写，适配器可在提供商兼容时复用主模型配置。向量调用失败、超时或模型不支持 Embedding 时，只记录可观察错误并降级为 BM25，不阻断索引与学习流程。

### 6.4 Manifest 与重建

`manifest.json` 保存：

- 索引 schema 版本。
- 课程版本。
- 每个源文件的 SHA-256。
- 切块参数。
- 分词器版本。
- Embedding 提供商、模型和维度指纹。
- 构建时间和 chunk 数量。

启动时只检查状态，不同步阻塞整个应用重建。首次访问缺少或过期索引的课程时，FastAPI 使用 `BackgroundTasks` 启动单课程构建，并以 HTTP 202 返回明确的 `building` 状态；同一课程同时只允许一个构建任务。开发者也可以运行：

```text
python -m rag.index --course agent-design
python -m rag.index --all
```

## 7. 检索与引用

### 7.1 检索流程

1. 规范化学生问题，并合并当前课程、星图节点、教学步骤和必要的章节过滤条件。
2. BM25 召回 Top 12。
3. 向量索引可用时并行召回 Top 12。
4. 使用 Reciprocal Rank Fusion（RRF）融合并按 `chunk_id` 去重。
5. 应用课程、章节、内容类型和上下文预算过滤。
6. 返回 Top 5 证据块。

MVP 不增加 LLM 重排，以控制成本、延迟和失败面。后续可在 `Retriever` 接口后增加可选 reranker。

### 7.2 引用契约

所有需要课程证据的响应使用统一结构：

```json
{
  "content": "结构化提示词把信息拆成明确模块……",
  "citations": [
    {
      "citation_id": "agent-design:2.5:8f31",
      "course_id": "agent-design",
      "document_title": "智能体设计与应用开发基础",
      "section_path": ["第2章", "2.5 结构化提示词基本概念"],
      "excerpt": "结构化提示词具有层次清晰……",
      "source_file": "智能体设计与应用开发基础.md",
      "line_start": 1224,
      "line_end": 1247
    }
  ],
  "knowledge_scope": "course"
}
```

`knowledge_scope` 的合法值为：

- `course`：内容由本次课程检索证据支持。
- `extension`：教材没有直接依据，属于模型补充知识。
- `mixed`：回答同时包含教材内容和补充知识；UI 分段标记扩展部分。

模型只允许返回本次检索集合中的 `citation_id`。`CitationValidator` 删除未知 ID，补齐标准元数据，并记录被拒绝的虚构引用。如果没有有效证据，系统明确提示“教材中未找到直接依据”，不得伪造来源。

## 8. API 设计

### 8.1 新增 Course API

- `GET /api/courses`：课程列表与索引状态。
- `GET /api/courses/{course_id}`：课程详情、资料和章节摘要。
- `POST /api/courses/{course_id}/index`：重建或增量更新索引；接受任务时返回 HTTP 202 和索引状态。
- `POST /api/courses/{course_id}/search`：调试和引用预览用的检索接口。

### 8.2 扩展现有 Graph 与 Learning API

课程模式的请求显式携带 `course_id`。现有调用未提供 `course_id` 时保持主题、项目或文档模式原行为。

- 图谱生成：课程模式优先使用课程章节目录建立骨架，再用针对性检索补充依赖关系和节点说明。
- 开始学习：使用选中节点、前置节点状态和课程证据生成教学计划。
- 讲解、聊天、重讲：返回 `content`、`citations` 和 `knowledge_scope`。
- 出题与评估：使用当前步骤目标和证据；评估响应保留评分、反馈、错误分析和必要引用。

后端使用 Pydantic 响应模型统一结构。错误响应至少包含 `code`、`message` 和可选 `details`，避免前端根据异常文本判断状态。

## 9. 学习工作流

课程知识点继续使用 PPT 中的 A/B 权重：

- A：学生实际掌握度，范围 0.0–1.0。
- B：学生期望掌握度，范围 0.0–1.0。

单节点状态流为：

1. **选择节点**：读取前置节点、A/B 权重、课程章节和历史学习状态。
2. **确认计划**：生成 3–6 步计划；学生可接受或提出修改。
3. **教材讲解**：每一步针对节点与步骤检索证据，输出讲解和引用。
4. **检测评分**：Evaluation Agent 基于本步目标出题，评分写入 `step_scores` 并更新 A。
5. **重讲或进阶**：未通过时结合错误分析重新检索和讲解；通过时进入下一步。计划完成且 A ≥ B 后，推荐图中的下一个可学习节点。

现有加权步骤评分和无计划时 EMA 评分逻辑继续保留，并增加回归测试，避免重构改变学习结果。

## 10. UI 与视觉设计

### 10.1 信息架构

桌面学习界面分为三栏：

- 左栏：课程名称、课程首页、知识星图、章节目录、实训任务、错题回顾和学习报告。
- 中栏：复古像素知识星图、当前学习路径、2D/3D 与视图工具。
- 右栏：当前节点、A/B 权重、教学步骤、讲解内容、教材引用、扩展知识标记和学习动作。

窄屏时星图占满主区域，右侧教学工作区改为可开合抽屉。移动端只保证核心操作可完成。

### 10.2 A3 视觉规范

- 主背景：深紫黑和深蓝紫。
- 主强调：暖黄色，用于当前节点、进度和关键状态。
- 次强调：珊瑚橙，用于主要按钮和需要注意的操作。
- 掌握/通过：薄荷绿。
- 未解锁/辅助文字：低饱和紫灰。
- 像素边框使用清晰的 2px 实线和短距离硬阴影，不给正文卡片添加大面积发光。
- 星图节点可使用方形或轻微圆角像素块；节点颜色继续表达掌握度和学习状态。
- 正文区域使用暖色浅底、常规中文无衬线字体和舒适行高。

### 10.3 引用展示

引用卡片默认显示：教材名称、章节、命中摘要和“查看原文”动作。展开后显示完整证据片段和原文行号。

扩展知识使用独立紫色标签，不与教材引用共用视觉样式。混合回答必须在内容段落级区分课程证据与扩展内容。

## 11. 前端重构边界

### 11.1 `App.tsx`

将顶层文件收敛为页面组合和模式选择，业务状态移动到独立模块：

- `features/courses/`：课程列表、课程卡片、索引状态。
- `features/learning/`：`LearningWorkspace`、`TeachingPanel`、`PlanPanel`、`QuizActions`、`CitationCard`、`CitationDrawer`。
- `features/learning/useLearningSession.ts`：学习状态机和异步动作。
- `features/sessions/`：星图会话序列化、恢复和持久化。
- `components/markdown/MarkdownContent.tsx`：统一 Markdown、数学公式和代码渲染。

学习交互使用显式状态机，不再依赖多组互相约束的布尔值。状态至少包括：

```text
idle → planning → plan_review → teaching → quiz → evaluating
     → reteaching | step_complete → course_node_complete
```

### 11.2 `KnowledgeGraph.tsx`

拆分为：

- `graphTheme.ts`：节点、边和主题颜色。
- `graphData.ts`：后端图数据到 G6 数据的转换。
- `useGraph2D.ts`：2D 初始化、布局、缩放和点击。
- `useGraph3D.ts`：3D 初始化、坐标投影、命中检测和标签覆盖层。
- `graphInteractions.ts`：高亮、清理、边命中和兼容节点适配。
- `KnowledgeGraph.tsx`：组合视图、工具栏和生命周期。

2D/3D 公用的节点适配、邻接计算和事件载荷只能保留一份实现。

### 11.3 API 与类型

- 将单一 `api/client.ts` 拆为 `courses.ts`、`graph.ts`、`learning.ts`、`documents.ts` 和 `code.ts`。
- 为节点属性、会话、API 请求、响应、引用和错误建立明确类型。
- 清理未使用参数、死状态和可替换的 `any`。
- 修复当前 Effect 中同步重置状态造成的级联渲染问题。

## 12. 后端重构边界

- `backend/routes/courses.py`：Course API。
- `backend/routes/graph.py`：图谱 API。
- `backend/routes/learning.py`：教学 API。
- `rag/course_registry.py`：课程发现与校验。
- `rag/markdown_parser.py`：章节解析与切块。
- `rag/indexer.py`：manifest、BM25 与可选向量构建。
- `rag/retriever.py`：召回、RRF、过滤和上下文预算。
- `rag/embeddings.py`：可选 Embedding 适配器。
- `rag/citations.py`：引用规范化与校验。
- `services/learning_orchestrator.py`：共享课程上下文、学习状态和 Agent 调用。

主题模式和文档模式通过共享的 `LearningContext` 复用计划、讲解、出题、评估、重讲和下一步逻辑。现有 URL 暂时保留为兼容路由；兼容路由只做请求转换，不复制业务编排。

本轮不强制重命名全部现有类或一次性迁移所有提示词。只整理与课程 RAG、重复端点和学习闭环直接相关的代码。

## 13. 错误处理与可观察性

- `course_not_found`：课程不存在或已被隔离。
- `course_invalid`：课程配置或资料路径非法。
- `index_missing`：索引不存在，返回构建状态。
- `index_build_failed`：构建失败，返回可读原因。
- `retrieval_empty`：教材没有直接命中；教学端按扩展知识规则处理。
- `embedding_unavailable`：记录降级原因，继续使用 BM25。
- `citation_invalid`：模型返回未知引用，服务层丢弃并记录。
- `provider_error`：模型调用失败，沿用统一重试与用户提示策略。

日志包含 `course_id`、`request_id`、检索耗时、候选数量、最终 chunk_id、模型提供商和降级原因，但不得记录 API Key、完整用户图片或不必要的长篇教材内容。

## 14. 测试与质量门槛

### 14.1 后端单元测试

- Course Registry 的发现、重复 ID、坏配置和路径穿越。
- Markdown 标题层级、代码块、行号和章节边界。
- 切块长度、重叠和稳定 chunk_id。
- BM25 标题权重和中文查询。
- RRF 融合、去重与 Top K。
- Embedding 超时、失败和无配置降级。
- Citation Validator 对合法、未知和重复 ID 的处理。
- A/B 权重、步骤加权评分和 EMA 回归。

### 14.2 后端接口测试

- 课程列表、详情、索引构建和检索。
- 课程图谱生成携带 `course_id`。
- 计划、讲解、聊天、出题、评估、重讲和下一步。
- 教学响应包含合法引用；无证据时不产生虚构引用。
- 未携带 `course_id` 的旧接口保持可用。

模型相关测试使用 fake provider，不依赖真实网络和 API Key。

### 14.3 前端测试

- 使用 Vitest 和 React Testing Library，测试业务状态与可访问交互，不绑定 G6 内部实现。
- 学习状态机的合法状态转换和失败恢复。
- 课程选择与索引状态展示。
- 引用卡片折叠、展开和扩展知识标签。
- 节点 A 值更新后星图、教学台和历史会话同步。
- Markdown 与代码渲染组件复用。
- 关键窄屏布局。

### 14.4 交付门槛

```text
pytest
npm run lint
npm run build
python -m rag.index --course agent-design
```

以上命令必须通过。最终还需完成一次人工端到端验收：

```text
选择课程 → 生成/载入星图 → 选择节点 → 确认计划
→ 查看教材引用 → 开始检测 → 提交答案
→ 更新掌握度 → 重讲或进入下一步
```

## 15. 迁移与兼容

1. 迁移首科目 Markdown 并创建 `course.yaml`。
2. 构建首科目本地索引。
3. 新增 Course API 和可选 `course_id`，不立即删除旧参数。
4. 接入 Teacher Agent，再接入 Evaluation 和 Knowledge Agent。
5. 用新学习工作区替换顶层 UI，保留主题、文档和项目模式入口。
6. 完成类型清理、重复逻辑合并和回归测试。

已有本地图谱和会话在读取时转换为新会话结构；写入时使用带 `course_id` 的新格式。无法识别课程的旧会话归类为 `legacy-topic`，不静默删除。

## 16. 风险与控制

- **教材 Markdown 标题质量不一致**：解析器容忍重复标题和异常级别；测试覆盖现有文件的真实结构。
- **中文 BM25 召回不足**：标题加权、同义词规范化和可选向量召回补足。
- **Agent 输出虚构引用**：只接受检索集合中的引用 ID，并由服务层校验。
- **重构破坏现有闭环**：先建立评分和教学状态回归测试，再迁移编排。
- **像素风影响可读性**：正文与代码不使用像素字体，像素效果限制在导航和交互框架。
- **索引构建阻塞启动**：运行时使用 FastAPI `BackgroundTasks` 按课程构建，开发环境和部署流程可使用显式 CLI；应用启动只做状态检查。

## 17. 验收标准

MVP 在以下条件全部满足时视为完成：

1. 首页能够列出并进入《智能体设计与应用开发基础》。
2. 课程资料能被本地索引；关闭 Embedding 配置后仍可检索。
3. 配置 Embedding 后自动启用混合检索，失败时无感降级。
4. 星图生成、教学讲解和检测均使用课程证据。
5. 学生能够查看教材章节、命中摘要和原文位置。
6. 扩展知识具有明确视觉与数据标记。
7. A/B 权重和步骤评分更新正确，学习闭环可走通。
8. 新增第二个合法课程目录后，系统无需改代码即可发现课程。
9. 主题、文档、项目和 IDE 的核心路径仍可运行。
10. 自动化测试、前端 lint 和生产构建全部通过。
