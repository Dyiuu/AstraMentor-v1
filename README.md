<p align="center">
  <img src="https://img.shields.io/badge/Python-3.10+-blue?style=for-the-badge&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/FastAPI-0.109+-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Google_AI-Gemini-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Gemini">
  <img src="https://img.shields.io/badge/智谱_AI-GLM--5-green?style=for-the-badge" alt="GLM">
  <img src="https://img.shields.io/badge/通义千问-Qwen3.5-orange?style=for-the-badge" alt="Qwen">
  <img src="https://img.shields.io/badge/License-AGPL%20v3-blue?style=for-the-badge" alt="License">
</p>

<h1 align="center">🌟 AstraMentor</h1>

<p align="center">
  <strong>通过 AI 驱动的交互式知识星图，重新定义你的学习方式。</strong>
</p>

  AstraMentor 是一个基于多 Agent 架构的全栈 AI 教学系统。它不只是一个聊天机器人，而是一位能够感知你需要学什么、该怎么学、并实时跟踪你学习状态的智能私教。支持<strong>课程知识库模式</strong>（职业教育教材优先、回答可追溯）、<strong>主题模式</strong>（输入任意主题自由学习）、<strong>文档模式</strong>（上传 PDF 文件精读论文/教材）和<strong>项目模式</strong>（输入项目需求，AI 为你生成完成该项目所需的技能路径）。

<br/>

## ✨ 核心特性 (Key Features)

### 🌌 动态知识星图 (Knowledge Graph)

拒绝线性死板的教程。系统根据你的学习目标，实时生成可视化的**知识依赖图谱**。

- **性能优化**: 采用 AntV G6 高性能渲染引擎，流畅支持海量节点展示
- **3D星空图谱**: 一键切换 3D 力导向图谱视图，在立体的星空背景中探索知识
- **智能交互**: 点击节点高亮关联路径，清晰展示知识脉络，支持灵活的鼠标拖拽与漫游
- **视觉升级**: 动态发光效果、平滑曲线连接，配合实时掌握度（彩色填充）状态展示
- **图谱扩展**: 支持用户**手动添加节点**，AI 智能分析现有图谱，自动生成适当的中间过渡节点并建立自然递进的层次连接
- **复杂度控制**: 生成星图时可通过分段滑块选择**3 档知识深度**（简洁 4~7 节点 / 标准 8~12 节点 / 详细 13~20 节点），按需定制图谱规模
- **多语言适配**: 界面元素全方位支持中英文双语切换，满足不同语言习惯
- **灵活布局**: 2D 模式下支持纵向/横向布局一键切换，支持自适应视口居中定位

### 💬 自适应多模态教学 (Adaptive AI Teaching)

- **5 档自适应教学**: AI 根据你的掌握度（0%~100%）自动调整 4 个维度——讲解深度、代码要求、表达方式、术语使用，从通俗类比到源码级剖析无缝过渡
- **计划驱动教学**: 每个知识点会先生成 3-6 步教学计划，按步骤递进学习，确保知识点覆盖完整
- **多模态支持**: 支持**图片上传**。遇到看不懂的代码或数学公式？截图发给 AI，它能精准识别并解析
- **在线 IDE**: 内置**代码编辑器**，支持 Python, JavaScript, Go, C, C++, Java 六种语言，直接在浏览器中编写并运行代码

### 🔄 步骤化教学闭环 (Step-by-Step Loop)

独创的 **Plan → Teach → Quiz → Evaluate → Next** 闭环：

1.  **生成计划**: AI 根据知识点和前驱依赖，生成 3-6 步递进教学计划
2.  **逐步讲解**: 每步只讲当前步骤内容，不超前不遗漏
3.  **步骤测验**: 每步讲完后由独立的评估 Agent 出题验证
4.  **双层评分**: 步骤分独立记录，全局掌握度通过加权聚合计算（后面步骤权重更大）
5.  **针对性重讲**: 答错可基于错误分析精准重讲，通过后进入下一步

### 📊 智能学习画像 (Learner Profile)

- **实时仪表板**: 左侧 Dashboard 实时显示你的学习进度曲线（支持折叠收起）
- **双层评分算法**: 每步测验分独立记录（`step_scores`），全局掌握度 = 加权平均 × 完成度系数 × 目标掌握度，杜绝"还没学完就高分"
- **5 档反馈体系**: 🌱 还需努力 → 💡 有所领悟 → 📖 基本掌握 → 💪 表现不错 → 🌟 非常出色
- **持久化**: 你的每一次对话、每一个知识点的状态、教学计划和步骤分数都会被保存
- **主页历史学习**: 最近星图显示在主页右侧，可恢复到上次节点、步骤、聊天与未完成测验

### ⚡ 流式回答与生成控制

- **边生成边阅读**: 自由问答、开始讲课、下一步和重新讲解均通过 SSE 流式显示
- **回答长度**: 自由问答可选 1024 / 2048 / 4096 / 8192 或 256~32768 自定义 Max Tokens
- **Thinking 模式**: 支持的模型会把思考内容放在可折叠区域；不支持时自动降级并显示提醒
- **测验强绑定**: 题目绑定教学计划版本、当前步骤和最近完整讲解，旧题或串步骤题会被拒绝

### 🛡️ 沉浸体验与护眼 (Focus & Eye Care)

- **复古像素白昼**: 白天模式创新融合了经典复古像素艺术（Pixel Art）风格、粗黑框元素与像素字体，带来别致操作体验
- **暖色护眼阅读**: 一键切换米黄色暖调护眼主题（Eye-Care），适配沉浸式长篇教学阅读，减轻视觉疲劳
- **可调节布局**: 面板宽度随意拖拽，配合柔和的响应式动态组件

### 🔍 联网搜索增强 (Web Research)

- **实时搜索**: 教学和讨论环节自动通过 DuckDuckGo 搜索引擎获取最新资料
- **搜索来源展示**: AI 回复下方展示可点击的搜索来源卡片，方便追溯原文
- **星图智能预研**: 生成知识图谱和扩展节点时先搜索最新知识结构，让图谱更准确
- **零配置**: 默认启用，可通过 `.env` 中 `ASTRA_WEB_SEARCH_ENABLED=false` 关闭
- **容错回退**: 搜索失败时自动回退到无搜索模式，不影响正常功能

### 🧠 多 Agent 协同架构

- **Knowledge Agent**: 负责构建知识图谱结构，支持 3 档复杂度动态提示词
- **Doc Graph Agent**: 负责基于文档内容构建文档专属星图 [NEW]
- **Teacher Agent**: 负责按教学计划逐步输出教学内容（禁止出题）
- **Evaluation Agent**: 独立于教学 Agent，负责出题、评分与错误分析
- **Code Runner**: 负责在后端安全沙箱中执行用户代码

### 📄 文档模式 (Document Mode)

上传 PDF 文件（论文、教材、技术文档），AI **严格围绕文档原文**帮你读懂每一页。

- **PDF 智能解析**: PyMuPDF 提取文本，按段落/章节自动分块，保留页码和标题
- **文档专属星图**: 基于文档内容生成知识图谱，每个节点关联原文分块
- **原文强关联**: 所有教学、出题、评分都必须引用原文，禁止超出文档范围
- **拖拽上传**: 支持拖拽或点击上传 PDF 文件，最大 50MB

### 🚀 项目模式 (Project Mode) [NEW]

输入你想做的项目，AI 帮你生成完成该项目所需的**技能路径星图**。

- **按需学习**: 节点不再是发散的知识概念，而是紧贴项目目标的实战技能
- **动态目标**: 核心技能权重大，辅助技能权重小，学习路径更聚焦
- **项目上下文**: 教学、讨论、测验环节全程注入项目背景，所有回答围绕「如何用它来完成你的项目」深入浅出
- **无缝集成**: 与主题/文档模式统一入口，一键切换

### 📚 职业教育课程知识库 (Course RAG) [NEW]

- **教材优先**: 教学计划、讲解、讨论、出题、评分和重讲都会检索当前课程教材
- **可追溯引用**: 回答展示文档标题、章节路径、原文摘录和行号，便于学生回看教材
- **离线可用**: 默认使用本地 BM25 中文检索；未配置向量模型或向量服务失败时仍可学习
- **混合检索**: 配置 Embedding 后自动启用 BM25 + 向量召回，并通过排序融合返回证据
- **知识边界**: 非教材信息明确标记为“扩展知识”，避免学生混淆教材内容与模型补充
- **易于扩科**: 每门课程一个独立目录与配置文件，索引、检索和学习状态按 `course_id` 隔离


### ⚙️ 评分算法详解

**双层评分机制（有教学计划时）：**

```
step_scores[i] = AI 评分   # 每步独立记录

weights = [1.0, 1.5, 2.0, 2.5, ...]  # 后面步骤权重递增
weighted_avg = Σ(score × weight) / Σ(weight)
completion_factor = 已完成步骤数 / 总步骤数
actual_mastery = weighted_avg × completion_factor × target_mastery
```

**EMA 评分（无教学计划时）：**

```
A_new = A_old × β + α × (S × W_cap - A_old × β) × γ
```

---

## 🏗️ 系统架构 (Architecture)

```mermaid
graph TD
    User[用户] --> Client[React 前端]
    Client <--> API[FastAPI 后端]

    subgraph "Backend Services"
        API --> Service[Learning Service]
        API --> CourseAPI[Course API]
        CourseAPI --> RAG[Course RAG Index / Retriever]
        RAG --> Service
        API --> DocAPI[Doc API Router]
        Service --> KA[Knowledge Agent]
        Service --> TA[Teacher Agent]
        Service --> EA[Evaluation Agent]
        DocAPI --> DGA[Doc Graph Agent]
        DocAPI --> PDF[PDF Parser]
        Service <--> DB[(Learner State JSON)]
        KA -.->|项目模式| PJ[Project Context]
    end

    subgraph "AI Models (Provider 分发)"
        KA --> AC[APIClient]
        TA --> AC
        EA --> AC
        DGA --> AC
        AC -->|gemini| Gemini[Google Gemini]
        AC -->|zhipu| GLM[智谱 GLM]
        AC -->|qwen| Qwen[通义千问 Qwen]
        AC -->|其他| OAI[任意 OpenAI 兼容]
    end

    subgraph "Web Research"
        TA --> DDG[DuckDuckGo 搜索]
        KA --> DDG
        DDG --> Sources[搜索来源引用]
    end
```

---

## 🚀 快速开始 (Quick Start)

### 前置要求

- **Python**: 3.10 或更高版本
- **Node.js**: 16.0 或更高版本
- **AI 模型 API Key**（任选一个即可）：

  | 提供商 | 模型示例 | 获取方式 |
  |--------|----------|----------|
  | Google Gemini | `gemini-2.5-flash` | [Google AI Studio](https://aistudio.google.com/) |
  | 智谱 AI (GLM) | `glm-5` | [智谱开放平台](https://open.bigmodel.cn/) |
  | 通义千问 (Qwen) | `qwen3.5-plus` | [阿里云百炼](https://dashscope.aliyun.com/) |
  | 其他 OpenAI 兼容 | — | 只需 API Key + Endpoint 即可 |

- **Compilers** (可选, 用于在线 IDE):
  - GCC (C/C++)
  - Go
  - JDK (Java)

### 1️⃣ 后端环境设置

```bash
# 1. 克隆项目并进入目录
git clone https://github.com/maxwell-orange/AstraMentor-v1.git
cd AstraMentor-v1

# 2. 创建虚拟环境
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

# 3. 安装依赖
pip install -r requirements.txt

# 4. 配置环境变量
# 复制 .env.example 为 .env，填入你的模型提供商和 API Key
copy .env.example .env
# 编辑 .env，设置 ASTRA_PROVIDER / ASTRA_API_KEY / ASTRA_API_ENDPOINT / ASTRA_MODEL_NAME
# 可选：关闭联网搜索功能
# 在 .env 中设置 ASTRA_WEB_SEARCH_ENABLED=false

# 5. 启动后端服务
uvicorn backend.app:app --reload
```

### 2️⃣ 构建课程知识库

项目内置一条面向 AI 职业教育的递进课程线：

| 顺序 | 课程 ID | 课程 | 建议定位 |
|---:|---|---|---|
| 10 | `agent-design` | 智能体设计与应用开发基础 | Coze 等低代码智能体入门 |
| 20 | `llm-app-development` | 大模型应用开发 | 模型 API、结构化、多模态、工具与流式交互 |
| 30 | `rag-knowledge-engineering` | RAG 知识库工程 | 文档治理、检索、引用与评测 |
| 40 | `agent-engineering` | Agent 开发工程师 | 执行循环、工具、记忆、工作流、MCP 与多智能体 |
| 50 | `ai-app-production` | AI 应用测试、部署与安全 | 测试、评测、可观测、安全、成本与部署 |

课程索引不会在学习请求中偷偷构建。首次进入或教材变更后，课程卡片会显示 `missing` / `stale` 状态；点击“构建知识库”后，前端轮询 `building`，直到进入 `ready` 或 `failed`。也可以在启动前通过命令行构建：

```bash
python -m rag.index --course agent-design --force
```

批量构建全部已注册课程：

```bash
python -m rag.index --all --force
```

新增或修改教材后，建议先运行内容门禁，再重建索引：

```bash
python -m rag.content_validator --all
python -m unittest discover -s tests -p "test_course_*.py" -v
```

新增课程时，在 `rag/courses/<course-id>/` 下创建：

```text
rag/courses/<course-id>/
├── course.yaml
└── materials/
    ├── 教材上册.md
    └── 教材下册.md
```

`course.yaml` 示例：

```yaml
id: network-technology
title: 计算机网络技术
description: 面向职业教育的计算机网络基础课程
locale: zh-CN
version: "1.0"
category: 信息技术
order: 60
hours: 32
level: intermediate
track: AI 应用工程
prerequisite_skills:
  - 能够使用 Python 处理文件和 JSON
recommended_courses:
  - llm-app-development
job_roles:
  - 知识库工程师
competencies:
  - 建设可追溯的课程知识库
capstone: 交付一个带引用、可拒答的课程助手
tags:
  - RAG
materials:
  - id: textbook
    title: 计算机网络技术教材
    path: materials/计算机网络技术.md
```

然后执行内容校验与 `python -m rag.index --course network-technology --force`。前端课程目录会通过 `/api/courses` 自动发现新课程，无需修改页面代码。`course.yaml` 仍兼容旧版最小字段；缺少职业元数据时接口会在 `course_warnings` 中提示，便于逐步补齐。

#### 环境变量配置示例

```env
# ========== 使用 Gemini ==========
ASTRA_PROVIDER=gemini
ASTRA_API_KEY=your-gemini-key
ASTRA_API_ENDPOINT=https://generativelanguage.googleapis.com
ASTRA_MODEL_NAME=gemini-2.5-flash

# ========== 使用智谱 GLM ==========
ASTRA_PROVIDER=zhipu
ASTRA_API_KEY=your-zhipu-key
ASTRA_API_ENDPOINT=https://open.bigmodel.cn/api/paas/v4/
ASTRA_MODEL_NAME=glm-5

# ========== 使用通义千问 Qwen ==========
ASTRA_PROVIDER=qwen
ASTRA_API_KEY=your-qwen-key
ASTRA_API_ENDPOINT=https://dashscope.aliyuncs.com/compatible-mode/v1
ASTRA_MODEL_NAME=qwen3.5-plus

# ========== 使用 OpenRouter（OpenAI 兼容）==========
ASTRA_PROVIDER=openrouter
ASTRA_API_KEY=your-openrouter-key
# 这里必须是 API 根地址，不要手动追加 /chat/completions
ASTRA_API_ENDPOINT=https://openrouter.ai/api/v1
ASTRA_MODEL_NAME=google/gemini-2.5-flash
```

如果误把 OpenRouter Endpoint 写成 `.../api/v1/chat/completions`，新版客户端也会自动裁剪为根地址，避免 SDK 拼成两次 `/chat/completions`。API Key 不要截图、提交到 Git 或发给他人；一旦泄露请立即在提供商后台撤销并重建。

后端服务将在 `http://127.0.0.1:8000` 启动。

> MVP 当前把课程索引构建中的运行状态保存在进程内。请保持 Uvicorn 单 worker（上面的默认命令即为单 worker）；如需多 worker/多实例部署，应先把构建队列与状态迁移到 Redis、数据库或独立任务服务。

### 3️⃣ 前端环境设置

```bash
# 1. 打开新的终端窗口，进入 frontend 目录
cd frontend

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev
```

前端应用将在 `http://localhost:5173` 启动。

---

## 📖 使用说明 (User Guide)

1.  **启动探索**: 在顶部搜索框输入你想学习的主题（例如 `"Python 装饰器"` 或 `"Transformer 架构"`）
2.  **生成图谱**: 系统会弹出星图生成对话框，可选择**知识深度**（简洁 / 标准 / 详细）后生成
3.  **选择路径**: 点击图中任意一个节点（推荐从根节点开始）
4.  **生成教学计划**: 系统会为该知识点生成 3-6 步递进教学计划
5.  **逐步学习**:
    - 每步 AI 会按当前掌握度选择合适的深度进行讲解
    - 讲完后点击 **"✅ 明白，开始检测"** 进入步骤测验
    - 答对后点击 **"➡️ 下一步"** 进入下一个教学步骤
    - 答错可点击 **"🔄 针对错误重新讲解"** 精准补强
6.  **实践编程**: 点击顶部 **"IDE"** 按钮打开代码编辑器，选择语言并运行代码，进行实战练习
7.  **查看成长**: 观察左侧仪表板和星图节点颜色变化，掌握度随步骤推进逐渐上涨
8.  **继续学习**: 返回主页后，从右侧“历史学习”选择记录，可恢复到最后学习的节点和步骤

### 📄 文档模式使用步骤

1.  打开星图生成对话框，切换到 **"文档模式"** Tab 页
2.  拖拽或点击上传 PDF 文件（支持论文、教材等，最大 50MB）
3.  可选填写当前水平和学习用途，选择知识深度，点击 **"开始分析"**
4.  系统解析 PDF 并生成文档知识星图，后续教学和出题均严格引用原文

### 🚀 项目模式使用步骤

1.  打开星图生成对话框，切换到 **"项目模式"** Tab 页
2.  在文本框中详细描述你想做的项目（例如："用 React + Node.js 开发一个在线聊天应用"）
3.  填写当前水平，选择知识深度，点击 **"生成项目路径"**
4.  生成包含各类实战技能的星图，此模式下 AI 的所有教学均会联系你的项目需求


---

## 📁 项目结构 (Directory Structure)

```
AstraMentor-v1/
├── 📂 agents/                  # AI Agents
│   ├── knowledge_graph_agent.py  # 主题模式星图 Agent
│   └── doc_graph_agent.py        # 文档模式星图 Agent [NEW]
├── 📂 backend/                 # FastAPI 后端核心代码
│   ├── api.py                 # 主题模式 API 路由
│   ├── doc_api.py             # 文档模式 API 路由 [NEW]
│   ├── course_api.py          # 课程目录、索引状态与检索 API
│   ├── course_runtime.py      # 课程索引构建状态机与并发去重
│   ├── session_api.py         # 历史学习快照 API
│   ├── app.py                 # 应用入口与统一 409 恢复契约
│   └── models.py              # Pydantic 数据模型
├── 📂 core/                    # 核心逻辑
│   ├── prompts.py             # 主题模式 5 档教学/评分提示词
│   ├── doc_prompts.py         # 文档模式专用提示词 [NEW]
│   ├── scoring.py             # 评分算法（双层评分 + EMA）
│   └── learner_state.py       # 学习者状态
├── 📂 models/                  # Pydantic 数据模型
│   └── knowledge_graph.py     # 星图结构化输出模型（含 source_chunks）
├── 📂 services/                # 业务逻辑层
│   ├── learning_service.py    # 教学计划管理、双层评分聚合
│   ├── pdf_parser.py          # PDF 解析服务 [NEW]
│   ├── session_repository.py  # 原子写入的学习会话仓库
│   ├── streaming_service.py   # SSE 事件编码
│   └── code_runner.py         # 代码沙箱执行
├── 📂 utils/                   # 工具模块
│   ├── api_client.py          # 多模型 Provider 统一客户端（Gemini / GLM / Qwen）
│   └── web_research.py        # 联网搜索 (DuckDuckGo)
├── 📂 frontend/                # React 前端代码
│   ├── src/
│   │   ├── components/ui/     # 通用 UI 组件
│   │   ├── components/        # SourceQuoteCard 等
│   │   ├── features/chat/     # 聊天与步骤化交互组件
│   │   ├── features/graph/    # 星图组件 + 统一生成对话框
│   │   ├── features/dashboard/# 学习仪表板
│   │   ├── features/ide/      # 在线代码编辑器
│   │   ├── features/home/     # 首页落地页
│   │   ├── features/courses/  # 职业课程目录、详情与索引恢复
│   │   ├── features/sidebar/  # 历史星图侧边栏
│   │   ├── locales/           # 中英文国际化
│   │   └── api/               # Axios API 客户端
├── 📂 rag/                     # 文件型多课程 RAG
│   ├── courses/               # 每门课程的 manifest 与 Markdown 教材
│   ├── indexes/               # 按 course_id 隔离的 BM25/向量索引
│   ├── course_registry.py     # 课程发现、职业元数据与安全校验
│   ├── indexer.py             # 标题感知切分与原子索引发布
│   ├── retriever.py           # BM25/混合检索与索引就绪保护
│   └── content_validator.py   # 4 学时项目教材质量门禁
├── 📂 test_data/               # 运行时数据（学习状态、图谱 JSON、上传 PDF）
├── config.py                   # 应用配置
├── .env.example                # 环境变量模板
├── requirements.txt            # Python 依赖列表
└── README.md                   # 项目文档
```

---

## 🤝 贡献 (Contributing)

欢迎提交 Issue 和 Pull Request！如果你有更好的 Prompt 策略或新的功能想法，请随时告诉我们需要改进的地方。

1.  Fork 本仓库
2.  新建分支 (`git checkout -b feature/AmazingFeature`)
3.  提交更改 (`git commit -m 'Add some AmazingFeature'`)
4.  推送到分支 (`git push origin feature/AmazingFeature`)
5.  提交 Pull Request

---

## 📝 许可证 (License)

本项目基于 [AGPL v3 License](LICENSE) 开源。

---

<p align="center">
  Made with ❤️ by the AstraMentor Team
</p>
