# AstraMentor - Frontend

This is the frontend module for AstraMentor, an AI-driven interactive knowledge graph teaching system. It is built with React, TypeScript, and Vite.

## Tech Stack

- **Framework**: React 19 + TypeScript
- **Styling**: Tailwind CSS v4
- **Graph Visualization**: AntV G6 (2D/3D Force-Directed Graphs)
- **Editor**: Monaco Editor for an online interactive IDE experience
- **UI Components**: Radix UI primitives, Lucide React icons, custom SteppedSlider
- **Markdown Rendering**: react-markdown & react-syntax-highlighter
- **Internationalization**: Built-in i18n with Chinese/English support

## Quick Start

1. Ensure Node.js 16+ is installed.
2. Run `npm install` to install dependencies.
3. Run `npm run dev` to start the development server on `http://localhost:5173`.
4. Ensure the FastAPI backend is running on `http://localhost:8000`.

## Scripts

- `npm run dev`: Starts the local development server.
- `npm run build`: Compiles TypeScript and builds for production.
- `npm run lint`: Lints the frontend source code.

## Key Features

- **Knowledge Graph**: Interactive star map with AntV G6, supporting 2D/3D views
- **Document Mode**: Upload PDF files, AI generates document-grounded knowledge graphs with source-anchored teaching
- **Unified Dialog**: Topic mode and Document mode share a single generation dialog with Tab switching
- **Complexity Slider**: 3-level stepped slider (Simple / Standard / Detailed) to control graph generation depth
- **Step-by-Step Teaching**: Plan → Teach → Quiz → Evaluate loop with progress tracking
- **Multi-modal Chat**: Image upload support, code highlighting, grounding sources display
- **Online IDE**: Monaco Editor with multi-language code execution
- **History Sidebar**: Session management with graph persistence

For complete project details, please check the [Root README](../README.md).
