import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { SteppedSlider } from "../../components/ui/stepped-slider";
import { Loader2, Sparkles, FileUp, Upload, FileText, CheckCircle2, Rocket } from "lucide-react";
import { Textarea } from "../../components/ui/textarea";

interface GenerateGraphDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inputTopic: string;
  setInputTopic: (value: string) => void;
  inputLevel: string;
  setInputLevel: (value: string) => void;
  inputGoal: string;
  setInputGoal: (value: string) => void;
  complexity: number;
  setComplexity: (value: number) => void;
  isGenerating: boolean;
  onGenerate: () => void;
  /** 文档模式：上传并生成 */
  onUploadAndGenerate?: (file: File, complexity: number) => void;
  /** 文档上传中 */
  isDocUploading?: boolean;
  /** 项目模式：项目描述输入 */
  inputProjectDesc?: string;
  setInputProjectDesc?: (value: string) => void;
  /** 项目模式：生成项目星图 */
  onGenerateProject?: () => void;
  t: (key: string) => string;
}

/**
 * 统一的星图生成对话框
 *
 * NOTE: 用 Tab 页切换「主题模式」和「文档模式」，共享水平/用途/深度等字段
 */
export function GenerateGraphDialog({
  open,
  onOpenChange,
  inputTopic,
  setInputTopic,
  inputLevel,
  setInputLevel,
  inputGoal,
  setInputGoal,
  complexity,
  setComplexity,
  isGenerating,
  onGenerate,
  onUploadAndGenerate,
  isDocUploading = false,
  inputProjectDesc = '',
  setInputProjectDesc,
  onGenerateProject,
  t
}: GenerateGraphDialogProps) {
  // NOTE: Tab 模式：'topic' = 主题模式，'doc' = 文档模式，'project' = 项目模式
  const [mode, setMode] = useState<'topic' | 'doc' | 'project'>('topic');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isProcessing = isGenerating || isDocUploading;

  const complexitySteps = [
    t('app.complexity_simple'),
    t('app.complexity_standard'),
    t('app.complexity_detailed'),
  ];

  const handleFileSelect = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) return;
    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleSubmit = () => {
    if (mode === 'topic') {
      onGenerate();
    } else if (mode === 'doc' && selectedFile && onUploadAndGenerate) {
      onUploadAndGenerate(selectedFile, complexity);
    } else if (mode === 'project' && onGenerateProject) {
      onGenerateProject();
    }
  };

  /** 对话框打开/关闭时清理文件选择状态 */
  const handleOpenChange = (isOpen: boolean) => {
    if (!isProcessing) {
      setSelectedFile(null);
      setDragOver(false);
    }
    onOpenChange(isOpen);
  };

  const canSubmit = mode === 'topic'
    ? !isProcessing && !!inputTopic.trim()
    : mode === 'doc'
      ? !isProcessing && !!selectedFile
      : !isProcessing && !!(inputProjectDesc?.trim());

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t('app.dialog_title')}</DialogTitle>
          <DialogDescription>
            {t('app.dialog_desc')}
          </DialogDescription>
        </DialogHeader>

        {/* ====== 模式切换 Tab ====== */}
        <div className="flex gap-1 p-1 bg-zinc-100 rounded-lg">
          <button
            onClick={() => setMode('topic')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all ${
              mode === 'topic'
                ? 'bg-white shadow-sm text-blue-700'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
            disabled={isProcessing}
          >
            <Sparkles className="h-4 w-4" />
            {t('doc.tab_topic')}
          </button>
          <button
            onClick={() => setMode('project')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all ${
              mode === 'project'
                ? 'bg-white shadow-sm text-emerald-700'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
            disabled={isProcessing}
          >
            <Rocket className="h-4 w-4" />
            {t('project.tab_project')}
          </button>
          <button
            onClick={() => setMode('doc')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all ${
              mode === 'doc'
                ? 'bg-white shadow-sm text-purple-700'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
            disabled={isProcessing}
          >
            <FileUp className="h-4 w-4" />
            {t('doc.tab_doc')}
          </button>
        </div>

        <div className="grid gap-5 py-2">
          {/* ====== 主题模式：主题输入 ====== */}
          {mode === 'topic' && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="topic" className="text-right">
                {t('app.topic_label')}
              </Label>
              <Input
                id="topic"
                placeholder={t('app.input_placeholder')}
                value={inputTopic}
                onChange={(e) => setInputTopic(e.target.value)}
                className="col-span-3"
                disabled={isProcessing}
              />
            </div>
          )}

          {/* ====== 文档模式：PDF 上传区域 ====== */}
          {mode === 'doc' && (
            <div
              className={`
                relative flex flex-col items-center justify-center
                rounded-lg border-2 border-dashed p-6 transition-all cursor-pointer
                ${dragOver
                  ? 'border-purple-500 bg-purple-500/10'
                  : selectedFile
                    ? 'border-green-500 bg-green-500/5'
                    : 'border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50'
                }
                ${isProcessing ? 'pointer-events-none opacity-60' : ''}
              `}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                className="hidden"
                disabled={isProcessing}
              />
              {selectedFile ? (
                <>
                  <CheckCircle2 className="h-8 w-8 text-green-500 mb-2" />
                  <div className="flex items-center gap-2 text-sm text-zinc-700">
                    <FileText className="h-4 w-4" />
                    <span className="font-medium">{selectedFile.name}</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB · {t('doc.click_to_change')}
                  </p>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-zinc-400 mb-2" />
                  <p className="text-sm text-zinc-500">{t('doc.drop_hint')}</p>
                  <p className="text-xs text-zinc-400 mt-1">{t('doc.file_limit')}</p>
                </>
              )}
            </div>
          )}

          {/* ====== 项目模式：项目描述文本框 ====== */}
          {mode === 'project' && (
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="projectDesc" className="text-right mt-2">
                {t('project.desc_label')}
              </Label>
              <Textarea
                id="projectDesc"
                placeholder={t('project.desc_placeholder')}
                value={inputProjectDesc}
                onChange={(e) => setInputProjectDesc?.(e.target.value)}
                className="col-span-3 min-h-[100px] resize-y"
                disabled={isProcessing}
              />
            </div>
          )}

          {/* ====== 共享字段：水平（主题+文档+项目都可填） ====== */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="level" className="text-right text-sm">
              {t('app.level_label')}
            </Label>
            <Input
              id="level"
              placeholder={t('doc.level_optional_hint')}
              value={inputLevel}
              onChange={(e) => setInputLevel(e.target.value)}
              className="col-span-3"
              disabled={isProcessing}
            />
          </div>
          {/* 项目模式下隐藏学习用途字段，因为项目描述本身就是用途 */}
          {mode !== 'project' && (
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="goal" className="text-right text-sm">
              {t('app.goal_label')}
            </Label>
            <Input
              id="goal"
              placeholder={t('doc.goal_optional_hint')}
              value={inputGoal}
              onChange={(e) => setInputGoal(e.target.value)}
              className="col-span-3"
              disabled={isProcessing}
            />
          </div>
          )}

          {/* ====== 知识深度滑块 ====== */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right text-sm">
              {t('app.complexity_label')}
            </Label>
            <div className="col-span-3 px-1">
              <SteppedSlider
                value={complexity}
                onChange={setComplexity}
                steps={complexitySteps}
                disabled={isProcessing}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`w-full text-white ${
              mode === 'topic'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700'
                : mode === 'project'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700'
                  : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isDocUploading ? t('doc.uploading') : mode === 'project' ? t('project.generating') : t('app.generating_graph')}
              </>
            ) : (
              mode === 'topic' ? t('app.start_generate') : mode === 'project' ? t('project.start_generate') : t('doc.start_analyze')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
