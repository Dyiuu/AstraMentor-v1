<p align="center">
  <img src="https://img.shields.io/badge/Python-3.10+-blue?style=for-the-badge&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/FastAPI-0.109+-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Google_AI-Gemini-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Gemini">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License">
</p>

<h1 align="center">🌟 AstraMentor</h1>

<p align="center">
  <strong>基于多Agent架构的全栈AI编程教学系统</strong>
</p>

<p align="center">
  让AI像真正的导师一样，通过可视化的知识星图和实时对话，为你量身打造学习路线。
</p>

---

## ✨ 核心特性

<table>
<tr>
<td width="50%">

### 🌌 可视化知识星图

前端实时渲染知识点依赖关系，点击节点即可开始针对性学习。直观展示"学什么"和"为什么学"。

</td>
<td width="50%">

### 💬 沉浸式 AI 导师 (多模态)

通过 Chat 界面与 AI 实时互动。支持**图片上传**，你可以截图代码或数学公式提问，AI 能够精准识别并解答。

</td>
</tr>
<tr>
<td width="50%">

### 📊 实时进度仪表板

可视化追踪你的掌握度（Mastery）。基于增强型 EMA 算法，精准反映学习状态。

</td>
<td width="50%">

### 🧠 智能分阶段教学

从用于入门的"科普老师"到用于进阶的"架构师"，AI 根据你的水平自动切换教学人格。

</td>
</tr>
<tr>
<td width="50%">

### 🔄 交互式学习循环

**教学 -> 确认 -> 测验 -> 评价**。
系统在讲解后会主动确认你的理解（"没明白" vs "开始检测"），并出题验证，最后给出详细评分与解析。

</td>
<td width="50%">

### 🛡️ 智能护眼模式

一键切换护眼主题，保护视力，专注学习。

</td>
</tr>
</table>

---

## 🏗️ 系统架构

本项目采用现代化的前后端分离架构：

### Backend (Python/FastAPI)

- **FastAPI**: 提供高性能 RESTful API。
- **Agentic Core**:
  - **Knowledge Agent**: 生成网络状知识图谱。
  - **Teacher Agent**: 执行分阶段教学策略。
  - **Evaluation Agent**: 评估用户回答。
- **Service Layer**: 封装核心业务逻辑，解耦 API 与 Agents。

### Frontend (React/TypeScript)

- **Vite**: 极速构建工具。
- **React Flow**: 强大的节点/连线可视化引擎。
- **Tailwind CSS**: 现代化的原子类样式系统。
- **Shadcn UI**: 精美的 UI 组件库。

```mermaid
graph TD
    Client[React Frontend] <--> API[FastAPI Backend]
    API <--> Service[Learning Service]
    Service <--> KA[Knowledge Agent]
    Service <--> TA[Teacher Agent]
    Service <--> EA[Evaluation Agent]
    Service <--> State[Learner State (JSON)]
```

---

## 🚀 快速开始

### 环境要求

- **Python**: 3.10+
- **Node.js**: 16+ (推荐 18+)
- **API Key**: Google Gemini API Key

### 1️⃣ 后端设置

```bash
# 1. 进入项目根目录
cd AstraMentor-v1

# 2. 创建并激活虚拟环境
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

# 3. 安装依赖
pip install -r requirements.txt

# 4. 配置环境变量
# 复制 .env.example 为 .env 并填入 ASTRA_API_KEY
copy .env.example .env

# 5. 启动后端服务器
uvicorn backend.app:app --reload
```

后端服务将在 `http://127.0.0.1:8000` 启动。

### 2️⃣ 前端设置

```bash
# 1. 进入前端目录
cd frontend

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev
```

前端应用将在 `http://localhost:5173` 启动。

---

## 📖 使用指南

1.  **访问 Web UI**: 打开浏览器访问 `http://localhost:5173`。
2.  **生成图谱**: 在顶部搜索栏输入你想学习的主题（例如 "Python 异步编程"），点击搜索。
3.  **浏览星图**: 观察生成的知识节点。绿色节点表示已掌握，白色节点待学习。
4.  **开始学习**: 点击任意节点，右侧聊天面板将激活。
5.  **与 AI 互动**:
    - 阅读 AI 的教学内容。
    - 在输入框提问或回答 AI 的问题。
    - 完成 AI 布置的小测验。
6.  **查看进度**: 左上角的仪表板会实时更新你的掌握度数据。

---

## 📁 项目结构

```
AstraMentor-v1/
├── 📂 backend/                 # FastAPI 后端
│   ├── app.py                 # 应用入口
│   ├── api.py                 # API 路由
│   └── models.py              # Pydantic 模型
├── 📂 frontend/                # React 前端
│   ├── src/
│   │   ├── features/graph/    # 知识图谱组件
│   │   ├── features/chat/     # 聊天组件
│   │   └── api/               # API 客户端
├── 📂 services/                # 业务逻辑层
│   └── learning_service.py    # 核心服务
├── 📂 agents/                  # AI Agents
├── 📂 core/                    # 核心算法 (评分, 状态)
├── main.py                     # CLI 版本入口 (保留用于测试)
└── requirements.txt            # Python 依赖
```

---

## 📝 许可证

本项目采用 [MIT License](LICENSE) 开源协议。
