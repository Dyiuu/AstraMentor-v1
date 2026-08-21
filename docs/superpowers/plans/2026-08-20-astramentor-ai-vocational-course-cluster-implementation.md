# AstraMentor AI 职业教育课程群扩展实施计划

> 状态：待实施计划审阅  
> 日期：2026-08-20  
> 对应规格：`docs/superpowers/specs/2026-08-20-astramentor-ai-vocational-course-cluster-design.md`

## 1. 实施目标

在不引入数据库或完整 LMS 的前提下，完成以下交付：

1. 扩展文件型课程元数据和校验能力。
2. 增加明确的课程索引 `building/failed/ready` 状态闭环。
3. 课程索引未就绪时，所有课程生成类请求返回结构化 409，不自动建索引或绕过 RAG。
4. 前端显示职业教育元数据、推荐先修和详情，并自动轮询首次索引构建。
5. 新增“大模型应用开发”“RAG 知识库工程”“Agent 开发工程师”“AI 应用测试、部署与安全”。
6. 完成 32 个原创项目 Markdown、20 个检索验收用例和全链路回归测试。

## 2. 实施原则

- 先写失败测试，再写最小实现；每个任务运行相关测试，在后端阶段、前端阶段、内容阶段和最终交付节点运行完整回归。
- 内容和索引改动分开：Markdown 是源材料，`rag/indexes/` 是可重建生成物。
- 后端和前端均不得硬编码“只有一门课程”。
- 主题、项目和文档模式保持现有行为；严格索引就绪检查只作用于课程模式的生成类接口。
- 测试不调用真实模型、Embedding 或外部 API。
- 教材示例只使用 `YOUR_API_KEY`、`${ENV_NAME}` 等明确占位符。
- 当前目录不是 Git 仓库，因此计划不包含 commit 步骤；每个任务完成后以测试结果和文件清单作为检查点。

## 3. 任务总览

| 任务 | 内容 | 主要验收 |
|---:|---|---|
| 0 | 记录基线 | 现有 Python 测试、前端 Lint/Build 通过 |
| 1 | 课程元数据与 warnings | 新旧清单兼容、排序和警告测试通过 |
| 2 | RAG 索引完整性 | 损坏/串库索引被拒绝、无自动构建 |
| 3 | 索引运行时状态与 Course API | 状态机和统一 409 契约通过 |
| 4 | 课程模式 RAG 护栏与作用域 | 未就绪不调用模型，图谱/状态不串课 |
| 5 | 前端测试基础与 API 错误契约 | Vitest、409 解析、旧数据标准化通过 |
| 6 | 课程目录、轮询与响应式 UI | 元数据、details、构建闭环和布局通过 |
| 7 | App 恢复流程与先修水平 | 所有课程流程处理 409，current_level 正确 |
| 8 | 教材结构验证器 | 13 段结构、密钥、占位内容检查可运行 |
| 9–12 | 四门课程内容 | 每门 8 个项目和完整 manifest |
| 13 | 20 条检索验收 | Top-5 命中、引用有效、零跨课污染 |
| 14 | README、索引与全量 QA | 五门课程可用，全部验证命令通过 |

---

## 任务 0：记录当前基线

### 文件

不修改文件。

### 步骤

1. 运行现有 Python 测试：

   ```powershell
   .\.venv\Scripts\python.exe -m pytest -q
   ```

2. 运行 Python 编译检查：

   ```powershell
   .\.venv\Scripts\python.exe -m compileall backend rag services agents
   ```

3. 进入前端并运行现有检查：

   ```powershell
   Set-Location frontend
   npm run lint
   npm run build
   ```

4. 记录测试数量、现有非阻断警告和构建耗时。任何基线失败先判断是否与本轮无关，不能在后续任务中掩盖。

### 验收

得到可复现基线；后续每项改动均可与该基线对比。

---

## 任务 1：扩展课程元数据、排序和维护警告

### 文件

- 修改 `rag/course_registry.py`
- 修改 `rag/courses/agent-design/course.yaml`
- 新增 `tests/test_course_registry_metadata.py`

### 先写测试

在 `tests/test_course_registry_metadata.py` 覆盖：

1. 完整新字段解析和 `to_dict()` 数组序列化。
2. 旧清单缺失字段时使用默认值：`order=999`、`hours=0`、`level=unspecified`、字符串为空、数组为空。
3. 课程按 `(order, title)` 稳定排序。
4. 负数、布尔整数、非法 level、非列表、空元素、非字符串元素和非法推荐课程 ID 被拒绝。
5. 无效课程不隐藏有效兄弟课程。
6. 推荐课程未安装时只产生 warning；补装后 `refresh()` 自动清除 warning。

运行并确认测试先失败：

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_course_registry_metadata.py -q
```

### 实现

1. 在 `Course` 增加：
   - `order`
   - `hours`
   - `level`
   - `track`
   - `prerequisite_skills`
   - `recommended_courses`
   - `job_roles`
   - `competencies`
   - `capstone`
   - `tags`
2. 使用 tuple 保存内部数组，`to_dict()` 输出 JSON 数组。
3. 增加非负整数和字符串数组解析辅助函数，显式拒绝 `bool` 被当作整数。
4. level 只允许 `foundation`、`intermediate`、`advanced`、`unspecified`。
5. `refresh()` 分两遍执行：先解析有效课程，再校验推荐课程引用。
6. 增加 `_warnings` 与 `warnings()`，每次刷新同时清理旧警告。
7. `list_courses()` 改为按 `(course.order, course.title)` 排序。
8. 只给现有 `agent-design` 增加 `order: 10`；无法确认的学时、岗位等信息不编造。

### 验证

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_course_registry_metadata.py tests/test_rag.py -q
```

### 验收

新旧清单同时工作；推荐课程缺失不会隐藏课程；已有课程排序稳定。

---

## 任务 2：强化索引完整性和课程隔离

### 文件

- 新增 `rag/errors.py`
- 修改 `rag/indexer.py`
- 修改 `rag/retriever.py`
- 修改 `tests/test_rag.py`

### 先写测试

扩展 `tests/test_rag.py`：

1. manifest 中的 `course_id` 与请求课程不一致时状态为 stale。
2. `chunks.jsonl` 或 `bm25.json` 缺失时状态为 stale。
3. chunks/BM25 JSON 损坏、数组长度不一致或 chunk_count 不符时状态为 stale。
4. 同时构建 A/B 两课，修改 A 只使 A stale。
5. Retriever 拒绝包含其他 `course_id` 的 chunk。
6. BM25 中引用不存在的 chunk ID 时拒绝查询。
7. 空教材或零 chunk 不得生成 ready 索引。
8. 构建中途失败不会留下可被识别为 ready 的半成品；进程重启后仍为 stale 或保留旧的完整 ready 版本。
9. 显式 Embedding 失败继续降级为 BM25，不误判为课程构建失败。

### 实现

1. 在 `rag/errors.py` 定义 `CourseIndexNotReadyError`，保存 `course_id/status/message`。
2. `CourseIndexer.status()` 校验：
   - manifest schema 版本；
   - manifest 课程 ID；
   - 源文件哈希；
   - `chunks.jsonl` 和 `bm25.json` 是否存在；
   - 生成物哈希、chunk_count、BM25 数组长度和 chunk 引用一致性。
3. 提升索引 schema 版本，在 manifest 中记录生成物哈希；旧索引自然进入 stale 并可重建。
4. `CourseIndexer.build()` 在零 chunk 时抛出明确错误。先写同目录临时文件，所有生成物成功后分别原子替换，manifest 最后替换；异常时清理临时文件，不发布半成品。
5. `CourseRetriever(auto_build=False)` 改为安全默认值。
6. 非 ready 状态抛 `CourseIndexNotReadyError`，不再隐式构建。
7. 载入时若 JSON 解码、计数或引用校验失败，统一转换为 `CourseIndexNotReadyError(status="stale")`，不能泄漏为普通 500。
8. 载入后校验所有 chunk 和 BM25 引用属于当前课程且彼此一致。
9. 不提供任何跨目录或跨课程回退逻辑。

### 验证

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_rag.py -q
```

### 验收

损坏、残缺或串课索引不能进入查询；正常 BM25 和可选 Embedding 降级行为不回归。

---

## 任务 3：建立索引运行时状态机和统一 Course API

### 文件

- 新增 `backend/course_runtime.py`
- 修改 `backend/course_api.py`
- 修改 `backend/app.py`
- 新增 `tests/test_course_index_runtime.py`
- 新增 `tests/test_course_api.py`

### 先写状态机测试

`tests/test_course_index_runtime.py` 覆盖：

1. `missing → building → failed`。
2. failed 保留可展示错误。
3. 重试开始立即清除旧错误并进入 building。
4. 重试成功进入 ready。
5. failed 重试强制实际重建，不能复用残留 ready manifest。
6. A 失败不影响 B。
7. 同一课程并发构建只调度一次。

### 实现运行时协调器

在 `backend/course_runtime.py` 新增 `CourseIndexRuntime`：

- `status(course_id)`：合并磁盘状态、building 和 failed。
- `begin_build(course_id, force)`：去重、清错并决定是否调度。
- `run_build(course_id, force)`：执行构建并记录成功/失败。
- `require_ready(course_id)`：非 ready 时抛 `CourseIndexNotReadyError`。
- 导出进程内单例 `course_runtime`。

当前 MVP 只保证单进程内状态一致；多 worker 持久化状态留到后续版本。

### 先写 API 测试

`tests/test_course_api.py` 覆盖：

1. `/api/courses` 返回完整元数据、`invalid_courses` 和 `course_warnings`。
2. `/api/courses/{id}` 可观察 building、failed、ready。
3. 首次构建返回 202，已经 ready 且非 force 返回 200。
4. failed 可重新 POST 并进入 building。
5. 搜索非 ready 统一返回 409。
6. 409 detail 固定包含 `code/course_id/status/message`。
7. 未知课程返回 404。

### 改造 Course API

1. 移除 `course_api.py` 中分散的锁、building 集合和错误字典。
2. `_course_payload()` 使用共享 `course_runtime.status()`。
3. 列表响应加入 `course_warnings`，保留 `invalid_courses`。
4. POST 构建通过 `begin_build()` 和后台 `run_build()` 完成。
5. 搜索接口只在 ready 时创建 Retriever。
6. `backend/app.py` 注册 `CourseIndexNotReadyError` 异常处理器，统一返回：

   ```json
   {
     "detail": {
       "code": "course_index_not_ready",
       "course_id": "agent-engineering",
       "status": "stale",
       "message": "课程教材已更新，请重新构建索引"
     }
   }
   ```

### 验证

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_course_index_runtime.py tests/test_course_api.py -q
```

### 验收

前端可以通过 GET 轮询获得确定的 ready/failed 终态，所有非就绪搜索共享同一错误契约。

---

## 任务 4：课程模式 RAG 护栏、先修水平和数据作用域

### 文件

- 修改 `services/learning_service.py`
- 修改 `backend/api.py`
- 修改 `agents/knowledge_graph_agent.py`
- 修改 `backend/models.py`（仅在需要统一清理 course ID 时）
- 扩展 `tests/test_sessions.py`
- 新增 `tests/test_course_mode_guard.py`
- 新增 `tests/test_course_scope.py`

### 先写课程护栏测试

对 missing、stale、building、failed 参数化验证：

- 星图生成、扩展节点、开始学习、讲课、下一步、重教、对话、出题、评价及各流式入口返回结构化 409。
- mock `LearningService`、模型生成和流生成，断言索引未就绪时一次也未调用。
- 无 `course_id` 的主题/项目模式保持原流程。
- ready 且检索正常返回空结果时允许扩展知识，`knowledge_scope=extension` 且没有伪造引用。
- 所有带 `course_id` 的端点先验证课程存在；未知课程返回 404，非法 ID 不进入任何文件路径。

### 实现服务入口护栏

1. 将“课程身份校验”和“索引 ready 校验”拆开：`get_service()` 对任何非空 `course_id` 都先通过共享 registry 验证安全 ID 和课程存在性；只有 `require_course_index=True` 时再调用 `course_runtime.require_ready()`。
2. 对所有课程生成类端点设置 `require_course_index=True`。
3. `/graph/save` 和 `/learning/update` 属于纯状态写入，不因索引未就绪被阻断，但仍必须通过课程身份校验。
4. `LearningService` 延迟创建 `CourseRetriever(..., auto_build=False)`。
5. 删除检索异常后静默继续调用模型的逻辑；检索异常向上传播。
6. 只有 ready 且查询正常返回零结果时才使用扩展知识标记。
7. `generate_knowledge_graph()` 等已有宽泛异常处理必须重新抛出 `CourseIndexNotReadyError`。
8. 异常处理器兜住“预检查后文件又变化”的竞态。

### 实现课程作用域

1. 抽取 `_scoped_topic()`、`_graph_file()`、`_state_file()` 和 `load_graph()`。
2. 课程模式不把原始 topic 直接拼入路径：使用已验证的课程 ID 加 topic 的稳定 SHA-256 短摘要生成图谱/状态文件名；主题/项目模式继续兼容旧命名。
3. 所有新路径先 `resolve()`，再用 `relative_to(test_data_root.resolve())` 验证仍位于 `test_data` 内；拒绝 `..`、反斜杠、驱动器路径或其他穿越输入产生越界目标。
4. generate/save/load/delete 统一使用作用域路径。
5. `/graph/delete` 增加可选 `course_id`，前端后续同步传入。
6. `graph/expand` 在课程模式检索新节点证据；`KnowledgeGraphAgent.expand_graph()` 增加可选 `course_context`。
7. 课程先修能力组成“已具备：……”当前水平，并在图谱提示中明确不得把先修能力再次生成为节点。

### 作用域和历史测试

`tests/test_course_scope.py` 覆盖：

- 相同 topic、不同课程 ID 的图谱文件、状态文件互不相同。
- save/load/delete 只影响指定课程。
- 非法、未知或带路径穿越特征的 course ID 均不能创建文件；合法课程配合恶意 topic 也不能越过 `test_data`。
- 全部课程 API 创建服务时使用原 `course_id`。
- 恢复课程会话后不会读到另一课程的图谱或状态。
- 新课程先修信息进入 current level 和排除提示，旧课程保持默认值。

扩展 `tests/test_sessions.py`：

- snapshot 和 summary 保留 `course_id/course_title`。
- 更新会话后课程身份仍不变。

### 验证

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_course_mode_guard.py tests/test_course_scope.py tests/test_sessions.py tests/test_quiz_context.py tests/test_streaming.py -q
```

### 验收

课程索引未就绪绝不绕过 RAG；课程图谱、学习状态和恢复路径均以原课程 ID 隔离。

---

## 任务 5：建立前端测试基础、课程类型和结构化错误解析

### 文件

- 修改 `frontend/package.json`
- 修改 `frontend/package-lock.json`
- 新增 `frontend/vitest.config.ts`
- 新增 `frontend/src/test/setup.ts`
- 修改 `frontend/src/types/index.ts`
- 修改 `frontend/src/api/courses.ts`
- 修改 `frontend/src/api/stream.ts`
- 新增 `frontend/src/api/errors.ts`
- 新增 `frontend/src/api/courses.test.ts`
- 新增 `frontend/src/api/stream.test.ts`

### 安装测试依赖

```powershell
Set-Location frontend
npm install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom playwright-core
```

增加脚本：

```json
"test": "vitest run"
```

### 先写测试

1. 旧课程缺少职业元数据时能被标准化为安全默认值。
2. failed 状态保留，不被错误降级为 missing。
3. `course_warnings` 缺失时兼容旧后端。
4. FastAPI JSON 409 能解析成带 status/detail 的 `ApiRequestError`。
5. 只把 `course_index_not_ready` 识别为课程索引恢复；不能误判 `quiz_context_stale`。
6. 普通文本 500 仍返回可读错误。

### 实现

1. 新增 `CourseIndexState` 和 `CourseLevel` 联合类型。
2. 扩展 `Course` 的职业教育元数据字段。
3. 新增 `CourseIndexNotReadyDetail` 和 `CourseIndexRecovery`。
4. `courses.ts` 为 wire payload 增加统一 `normalizeCourse()`；list/get 共用。
5. `get(courseId, signal?)` 支持 AbortSignal。
6. 新增 `ApiRequestError`、`extractApiErrorDetail()`、`getCourseIndexNotReadyDetail()`。
7. `stream.ts` 根据 Content-Type 解析非 2xx JSON，并保留 FastAPI 外层 detail。

### 验证

```powershell
Set-Location frontend
npm test
npm run lint
npm run build
```

### 验收

前端拥有可测试的课程数据标准化和统一 409 错误契约，旧课程与旧响应保持兼容。

---

## 任务 6：实现课程卡片、索引轮询和响应式布局

### 文件

- 新增 `frontend/src/features/courses/courseUtils.ts`
- 新增 `frontend/src/features/courses/courseUtils.test.ts`
- 修改 `frontend/src/features/courses/CourseCatalog.tsx`
- 新增 `frontend/src/features/courses/CourseCatalog.test.tsx`
- 修改 `frontend/src/features/home/HomePage.tsx`
- 修改 `frontend/src/index.css`

### 先写工具和组件测试

1. 先修能力生成稳定 current level；旧课程得到“零基础”。
2. 推荐课程 ID 按原顺序映射为标题；未安装 ID 显示“暂未安装”。
3. 岗位优先、标签补充且最多两个。
4. 完整元数据和 `<details>` 内容正确渲染。
5. missing → building → ready 后自动进入课程。
6. stale/failed 使用 force 重建；failed 停止轮询并显示重试。
7. 120 秒停止主动轮询，提供刷新状态。
8. 组件卸载或进入课程时取消轮询。
9. 旧课程不渲染空徽标或空详情段。

### 实现纯函数

- `buildCourseCurrentLevel(course)`
- `courseLevelLabel(level)`
- `resolveRecommendedCourseTitles(course, allCourses)`
- `getPrimaryRoleOrTags(course)`

### 实现索引状态机

```text
ready ───────────────────→ 直接进入
missing ─ POST build ─────┐
stale ─ POST force ───────┤
failed ─ POST force ──────┤
                          ↓
               每 1000ms GET course
                          ↓
 ready → 更新课程并进入
 failed → 显示错误和重试
 120s → 停止轮询并显示刷新状态
```

要求：

- 每次只更新目标课程对象，不清空整个目录。
- failed/timeout 信息显示在对应卡片内。
- 后端已经 building 但前端未轮询时允许手动刷新，不能永久 disabled。
- `course_warnings` 放入目录末尾折叠维护提示，不干扰学生主流程。
- 支持来自 App 的 `recovery`，只高亮并提示，不擅自自动重建。

### 实现卡片内容

顺序固定为：类别/版本、标题/描述、学时/难度、岗位或标签、推荐先修、`<details>`、教材与索引状态、底部按钮。

### CSS

1. `.course-catalog` 使用 `auto-fit + minmax(min(100%, 300px), 1fr)`。
2. 删除 900px 断点强制单列规则。
3. 卡片使用纵向 flex，按钮 `margin-top:auto`。
4. 描述限制三行，所有长文本允许换行。
5. 徽标和标签容器允许 flex-wrap。
6. 颜色改用现有主题变量，夜间/护眼模式均有明确对比。
7. 390px 宽度无横向滚动；details 展开不覆盖按钮。

### 验证

```powershell
Set-Location frontend
npm test -- CourseCatalog courseUtils
npm run lint
npm run build
```

### 验收

五门课程卡片可以自然降列；首次索引构建有明确成功、失败和超时终态。

---

## 任务 7：接入 App 课程恢复、先修水平和 course_id 全链路

### 文件

- 修改 `frontend/src/App.tsx`
- 修改 `frontend/src/api/client.ts`
- 修改 `frontend/src/api/stream.ts`
- 修改 `frontend/src/features/home/HomePage.tsx`
- 根据组件边界扩展前端测试

### 实现

1. 在 App 增加 `courseRecovery` 状态。
2. 新增统一错误处理函数：
   - 只识别 `course_index_not_ready`；
   - 保存当前会话；
   - 保存课程 ID、状态和消息；
   - 返回主页并定位对应课程卡片；
   - 非课程错误继续走原 toast。
3. 接入课程星图、扩展节点、教学计划、开始讲课、下一步、重教、出题、评价和普通对话流。
4. 流式 409 且没有增量时删除空助手气泡；已有增量时保留内容并结束 streaming 状态。
5. 进入新课程时使用 `buildCourseCurrentLevel(course)`，并在以下三处保持完全一致：
   - `api.generateGraph()` 请求；
   - `setCurrentGraphLevel()`；
   - 新建图谱会话的 `currentLevel`。
6. 成功进入课程后清除 recovery。
7. `deleteGraph(topic, courseId?)` 同步传递 active course ID。
8. 历史恢复继续使用 snapshot 中的 `course_id/course_title/current_level`，不按当前课程目录覆盖。

### 测试/验证

- 测试课程 409 与 `quiz_context_stale` 分流。
- 测试旧课程“零基础”和新课程“已具备：……”请求体。
- 测试 delete/expand/generate 请求均携带 active course ID。
- 运行：

  ```powershell
  Set-Location frontend
  npm test
  npm run lint
  npm run build
  ```

### 验收

从课程选择到图谱、教学、问答、测验、评价和历史恢复始终使用最初课程 ID；索引故障能回到正确课程恢复。

---

## 任务 8：建立教材结构、原创性和密钥检查

### 文件

- 新增 `rag/content_validator.py`
- 新增 `tests/test_course_material_validator.py`

### 结构规则

每个新项目文件必须按顺序包含：

```text
# 项目N：领域任务名
## 岗位情境
## 项目目标
## 项目产物与验收条件
## 任务分析
## 核心知识
## 工程实现步骤
## 关键代码与配置
## 调试和常见故障
## 安全、成本与职业规范提示
## 实训练习
## 学习评价量表
## 本项目小结
## 官方参考资料与核验日期
```

### 测试内容

使用临时目录中的合格/不合格示例教材测试验证器，确保本任务结束时全部测试为绿：

1. 13 个二级章节存在、顺序正确且正文非空。
2. 验收条件包含清单或表格，评价量表包含 Markdown 表格。
3. 每个文件至少一个 fenced code/config block。
4. `任务分析` 下包含 `### 4 学时活动安排`，各活动分钟数合计 240。
5. 工程实践明确输入、输出、可复现步骤和验收证据。
6. 调试章节至少有两个独立故障案例，包含现象、原因、定位和修复。
7. 去除代码和表格后的有效正文不得只是骨架；使用约 2500 个非空白字符作为低质量预警下限，但不能把长度当作唯一合格依据。
8. 不含 `TODO/TBD/待补充/稍后补充/内容省略`。
9. 参考区存在 HTTPS 官方链接和 `2026-08-20`。
10. 检查真实密钥、令牌、私钥、JWT、URL 内嵌凭据和非占位环境变量赋值。
11. 检测长度超过 100 字的完全重复正文段落，公共标题、表头和免责声明除外。

`rag/content_validator.py` 提供可复用函数和 `python -m rag.content_validator --course <id>` CLI。CLI 只做结构/安全检查，不宣称能够自动证明外部原创性。

代码块尽量小于 800 字符，领域小节使用明确 `###` 标题，以适应当前 700/900 字符切分策略。

### 验证

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_course_material_validator.py -q
```

### 验收

验证器自身用临时示例保持全绿；四门真实课程的存在性、覆盖矩阵和逐文件集成验收放在任务 13，不让完整回归长期保持红色。

---

## 任务 9：编写“大模型应用开发”课程

### 文件

- 新增 `rag/courses/llm-app-development/course.yaml`
- 新增：
  - `materials/01-接入大模型服务.md`
  - `materials/02-构建可靠提示模板.md`
  - `materials/03-生成结构化数据.md`
  - `materials/04-管理上下文与成本.md`
  - `materials/05-开发多模态应用.md`
  - `materials/06-实现函数与工具调用.md`
  - `materials/07-优化交互体验.md`
  - `materials/08-综合项目.md`

### Manifest

- `order: 20`、`hours: 32`、`level: intermediate`、`track: AI 应用工程`。
- 推荐课程为空；Python、HTTP/JSON、异步、环境变量、Git/Linux 为先修能力。
- material ID 依次为：`model-client`、`prompt-template`、`structured-output`、`context-budget`、`multimodal-input`、`tool-calling`、`streaming-interaction`、`capstone`。

### 内容边界

- 覆盖模型客户端、提示版本、JSON Schema/Pydantic、Token 预算、多模态、单轮工具调用、SSE/取消/降级。
- 综合项目为可配置大模型业务应用。
- 不展开自主 Agent 循环或完整 RAG 工程。
- 以 OpenRouter/OpenAI 兼容 API 官方资料为核验来源，供应商特性提供能力检测和降级说明。

### 课程内验收

```powershell
.\.venv\Scripts\python.exe -m rag.content_validator --course llm-app-development
.\.venv\Scripts\python.exe -m rag.index --course llm-app-development --force
```

索引 ready、chunk_count 大于 0，教材结构检查中该课程全部通过。

---

## 任务 10：编写“RAG 知识库工程”课程

### 文件

- 新增 `rag/courses/rag-knowledge-engineering/course.yaml`
- 新增：
  - `materials/01-分析知识库需求.md`
  - `materials/02-建设文档处理流水线.md`
  - `materials/03-设计文档切分策略.md`
  - `materials/04-建立检索索引.md`
  - `materials/05-优化召回结果.md`
  - `materials/06-生成有依据的答案.md`
  - `materials/07-建立RAG评测体系.md`
  - `materials/08-综合项目.md`

### Manifest

- `order: 30`、`hours: 32`、`level: intermediate`。
- 推荐课程：`llm-app-development`。
- material ID：`requirements`、`document-pipeline`、`chunking`、`retrieval-index`、`retrieval-optimization`、`grounded-generation`、`rag-evaluation`、`capstone`。

### 内容边界

- 覆盖需求、Document 元数据、标题切分、BM25/向量、RRF/重排、引用拒答、Recall@K 和失败分析。
- 综合项目为带引用、可拒答、可评测的职业课程知识助手。
- 不展开多 Agent 或自主规划。
- 使用检索原始研究、官方数据库/向量库文档和本项目现有实现核验工程细节。

### 课程内验收

```powershell
.\.venv\Scripts\python.exe -m rag.content_validator --course rag-knowledge-engineering
.\.venv\Scripts\python.exe -m rag.index --course rag-knowledge-engineering --force
```

---

## 任务 11：编写“Agent 开发工程师”课程

### 文件

- 新增 `rag/courses/agent-engineering/course.yaml`
- 新增：
  - `materials/01-实现Agent执行循环.md`
  - `materials/02-开发可靠工具系统.md`
  - `materials/03-管理会话与记忆.md`
  - `materials/04-编排复杂工作流.md`
  - `materials/05-集成知识与外部服务.md`
  - `materials/06-接入MCP.md`
  - `materials/07-构建多智能体系统.md`
  - `materials/08-综合项目.md`

### Manifest

- `order: 40`、`hours: 32`、`level: advanced`。
- 推荐课程：`llm-app-development`、`rag-knowledge-engineering`。
- material ID：`agent-loop`、`tool-system`、`memory`、`workflow`、`knowledge-tools`、`mcp-integration`、`multi-agent`、`capstone`。

### 内容边界

- 覆盖执行循环、终止条件、工具契约、记忆边界、状态工作流、RAG/API 工具、MCP、handoff 和多 Agent。
- 综合项目为可观测、可中断、含人工确认的职业学习助理 Agent。
- RAG 作为已有工具接入，不重复讲 chunking、embedding 和 Recall@K。
- 生产评测与部署只说明接口，详细内容留给下一课程。
- MCP 内容以官方规范为准，明确 Host/Client/Server、capability、工具/资源和授权边界。

### 课程内验收

```powershell
.\.venv\Scripts\python.exe -m rag.content_validator --course agent-engineering
.\.venv\Scripts\python.exe -m rag.index --course agent-engineering --force
```

---

## 任务 12：编写“AI 应用测试、部署与安全”课程

### 文件

- 新增 `rag/courses/ai-app-production/course.yaml`
- 新增：
  - `materials/01-制定质量标准.md`
  - `materials/02-自动化功能测试.md`
  - `materials/03-开展效果评测.md`
  - `materials/04-建立可观测体系.md`
  - `materials/05-防御AI应用风险.md`
  - `materials/06-优化性能和成本.md`
  - `materials/07-完成工程化部署.md`
  - `materials/08-综合项目.md`

### Manifest

- `order: 50`、`hours: 32`、`level: advanced`。
- 推荐课程：`agent-engineering`。
- material ID：`quality-standard`、`functional-testing`、`effect-evaluation`、`observability`、`ai-security`、`performance-cost`、`deployment`、`capstone`。

### 内容边界

- 覆盖测试集、模型替身、效果评分、Trace、提示注入、越权、敏感信息、性能成本、Docker/健康检查/CI/CD/回滚。
- 综合项目对已有 Agent 做完整上线验收，不重新教授 Agent 架构。
- 安全内容以 OWASP GenAI/LLM Top 10 和最小权限原则为基础；高影响操作必须有人类确认。

### 课程内验收

```powershell
.\.venv\Scripts\python.exe -m rag.content_validator --course ai-app-production
.\.venv\Scripts\python.exe -m rag.index --course ai-app-production --force
```

---

## 任务 13：建立 20 条真实课程检索验收

### 文件

- 新增 `tests/fixtures/course_project_coverage.json`
- 新增 `tests/fixtures/course_retrieval_cases.json`
- 新增 `tests/test_course_materials.py`
- 新增 `tests/test_course_retrieval_acceptance.py`
- 新增 `docs/qa/2026-08-20-ai-course-content-review.md`

### 32 项覆盖矩阵与人工审阅

`course_project_coverage.json` 为每个项目记录：课程 ID、material ID、240 分钟活动安排、岗位任务、输入、输出、验收证据、至少两个故障案例和 required_topics。`tests/test_course_materials.py` 使用该矩阵检查：

1. 四门课均已注册且每门恰好 8 个材料。
2. 32 个 material ID/path 与 manifest 一致且无越界。
3. 每个项目通过 `rag.content_validator`。
4. 活动安排总计 240 分钟，岗位任务、输入、输出和验收证据均非空。
5. required_topics 自然出现在对应领域小标题或正文。

`docs/qa/2026-08-20-ai-course-content-review.md` 保存 32 行人工审阅记录，逐项目确认：

- 岗位任务是否真实、范围是否属于本课程；
- 实训步骤能否按文中输入复现并得到明确输出；
- 故障案例是否包含现象、原因、定位和修复；
- 4 学时活动是否包含讲解、实践、排错和评价，而非用字数冒充学时；
- 官方来源是否只用于核验、没有长段复制；
- 与现有 Coze 教材及其他三门新课是否存在段落复制或边界重复。

自动重复检查只能发现内部完全重复，最终“原创”结论必须以该人工来源审阅记录为依据。

### 固定用例

每门课 5 条：

- 大模型：结构化输出、Token 预算、多模态校验、工具参数、流式取消。
- RAG：标题切分、混合检索、重排序、引用拒答、召回评测。
- Agent：循环终止、工具恢复、记忆边界、MCP 架构、多 Agent 移交。
- 生产化：回归集、Trace、提示注入、最小权限、容器健康检查。

fixture 每条包含：

```json
{
  "id": "agent-mcp-architecture",
  "course_id": "agent-engineering",
  "query": "MCP Host、Client、Server 如何协作并控制工具和资源权限？",
  "expected_material_id": "mcp-integration",
  "expected_section": "接入 MCP"
}
```

### 测试实现

1. 使用真实 `rag/courses`，索引根使用 `TemporaryDirectory()`。
2. 清空 RAG Embedding 配置，保证只走本地 BM25，不联网。
3. 每门课只构建一次，再运行 5 条查询。
4. 每条断言：
   - Top-5 至少一个结果来自预期 material；
   - section_path 包含预期项目或章节；
   - 所有结果 course ID 等于请求课程；
   - source_path 可安全解析且文件存在；
   - 行号处于源文件范围；
   - 不出现其他课程 ID。
5. 查询术语必须自然出现在领域标题和正文中，禁止隐藏堆关键词迎合测试。

### 验证

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_course_materials.py tests/test_course_retrieval_acceptance.py -q
```

### 验收

20 条用例全部通过，课程证据可回溯且无跨课污染；32 行人工内容审阅均有结论且不存在“待审”项目。

---

## 任务 14：更新文档、生成最终索引并完成全量 QA

### 文件

- 修改 `README.md`
- 修改 `frontend/package.json`，增加 `test:visual` 脚本
- 新增 `frontend/scripts/visual-course-catalog.mjs`
- 新增 `docs/qa/2026-08-20-ai-course-catalog/visual-report.json`
- 新增 5 张代表性课程目录验收截图到 `docs/qa/2026-08-20-ai-course-catalog/`
- 生成或更新：
  - `rag/indexes/agent-design/`
  - `rag/indexes/llm-app-development/`
  - `rag/indexes/rag-knowledge-engineering/`
  - `rag/indexes/agent-engineering/`
  - `rag/indexes/ai-app-production/`

### README

1. 将“首门课程”更新为五门课程和推荐学习路径。
2. 提供扩展后的 JSON 兼容 `course.yaml` 示例。
3. 记录 13 段教材模板和 material ID/path 规则。
4. 说明 Python/API/Git/Linux 是代码课程先修能力，不在课程中重复教授。
5. 增加单课/全部索引、结构检查、检索验收命令。
6. 说明索引是生成物，不得代替或手工修改 Markdown 源教材。
7. 说明新增课程至少要通过结构、密钥和 5 条检索问题后才能进入目录。

### 生成最终本地索引

明确禁用远程 Embedding，避免构建过程中调用真实 API：

```powershell
$env:ASTRA_RAG_EMBEDDING_PROVIDER=''
$env:ASTRA_RAG_EMBEDDING_MODEL=''
.\.venv\Scripts\python.exe -m rag.index --all --force
```

确认五个输出状态均为 ready 且 chunk_count 大于 0。

### 后端完整验证

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m compileall backend rag services agents
```

### 前端完整验证

```powershell
Set-Location frontend
npm test
npm run lint
npm run build
```

### API 冒烟验证

1. `GET /api/courses` 返回五门课、完整元数据和 ready 索引。
2. 强制模拟单课 failed，其他四门保持可用，目标课程可以重试。
3. 模拟 stale 后课程生成请求返回结构化 409，确认模型 mock 未调用。
4. 搜索每门课代表问题，引用课程、文件、章节和行号正确。
5. 保存并恢复课程会话，课程 ID、标题和当前水平一致。

### 视觉验收矩阵

| 尺寸 | 重点 |
|---|---|
| 1440×900 | 历史栏与课程网格共存，五门课自然换行 |
| 1024×768 | 自动降为两列，不挤压卡片 |
| 900×768 | 历史栏转上方，课程仍保持合理列数 |
| 620×900 | 单列、details 展开后按钮不覆盖 |
| 390×844 | 长标题/岗位/错误不产生横向滚动 |

每个尺寸分别检查默认夜间主题和护眼主题，并覆盖 details 收起/展开、长岗位名、building、failed 和 recovery 状态。

仅靠 JSDOM、Lint 和 Build 不能证明真实布局。`visual-course-catalog.mjs` 使用 `playwright-core` 启动本机 Chrome/Edge（允许通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定路径），拦截课程 API 生成五门课程及 failed/recovery 场景，并完成：

1. 逐尺寸、逐主题打开真实页面并展开指定 details。
2. 自动断言页面与每张课程卡片 `scrollWidth <= clientWidth`。
3. 检查卡片矩形不互相覆盖、按钮位于卡片内容之后。
4. 读取标题、正文、次要文字、徽标和错误提示的计算颜色，按 WCAG 公式检查普通文字对比度不低于 4.5:1，大号文字不低于 3:1。
5. 保存包含尺寸、主题、状态、溢出和对比度结果的 `visual-report.json`。
6. 保存五张代表性截图：1440 夜间、1024 夜间展开、900 护眼、620 夜间失败、390 护眼展开。

在一个终端启动前端：

```powershell
Set-Location frontend
npm run dev -- --host 127.0.0.1
```

在另一个终端运行真实浏览器验收：

```powershell
Set-Location frontend
npm run test:visual
```

若本机浏览器路径无法自动发现，设置任务专用变量后重试；不得用人工目测替代所有自动溢出和对比度断言。

### 最终完成条件

- 五门课程在首页正常展示。
- 4 个新 manifest、32 个项目 Markdown 和 20 条检索用例全部存在。
- 32 个项目具有 240 分钟活动安排、可复现实训、输入输出、验收证据和故障案例，人工来源/边界审阅全部通过。
- 索引首次构建、失败、重试和 ready 自动进入形成闭环。
- 课程模式索引未就绪时不会调用模型。
- 图谱、学习状态、对话、测验、评价和历史恢复均保持原课程 ID。
- 所有 Python 测试、前端测试、Lint 和生产构建通过。
- 真实浏览器视觉报告和截图齐全，夜间/护眼及压缩窗口下无低对比、重叠和横向溢出。

## 4. 风险控制与停止条件

遇到以下情况时停止扩大实现范围并记录：

- 需要数据库或多 worker 共享索引状态：保留当前单进程 MVP，另立后续任务。
- BM25 验收不稳定：先调整自然标题和正文，不引入未经设计的新检索框架。
- 某模型不支持结构化输出、工具或 Thinking：教材增加能力检测和降级，不锁定模型。
- 前端测试依赖安装失败：先报告依赖问题，不用跳过测试掩盖组件状态机风险。
- 发现现有用户文件或不相关修改：保留并绕开，不覆盖或清理。
- 课程内容与现有 Coze 教材重复：重写为岗位任务视角，不复制段落。

## 5. 推荐实施顺序与并行边界

总体顺序：

```text
任务 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8
                                      ↓
                       任务 9 / 10 / 11 / 12（可并行）
                                      ↓
                                任务 13 → 14
```

任务 9、10、11、12 可在任务 1 和任务 8 的元数据/结构契约稳定后并行编写；任务 8 中针对真实课程的集成断言会随四门课逐步转绿。四门课都完成后再执行任务 13 的固定检索验收。任务 14 必须最后执行。
