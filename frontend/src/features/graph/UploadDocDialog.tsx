import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { SteppedSlider } from "../../components/ui/stepped-slider";
import { Loader2, Upload, FileText, CheckCircle2 } from "lucide-react";

interface UploadDocDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  complexity: number;
  setComplexity: (value: number) => void;
  isUploading: boolean;
  isGenerating: boolean;
  onUploadAndGenerate: (file: File, complexity: number) => void;
  t: (key: string) => string;
}

/**
 * 文档上传对话框
 *
 * NOTE: 支持拖拽和点击两种上传方式，上传后自动触发星图生成
 */
export function UploadDocDialog({
  open,
  onOpenChange,
  complexity,
  setComplexity,
  isUploading,
  isGenerating,
  onUploadAndGenerate,
  t
}: UploadDocDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isProcessing = isUploading || isGenerating;

  const complexitySteps = [
    t('app.complexity_simple'),
    t('app.complexity_standard'),
    t('app.complexity_detailed'),
  ];

  const handleFileSelect = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return;
    }
    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleSubmit = () => {
    if (selectedFile) {
      onUploadAndGenerate(selectedFile, complexity);
    }
  };

  /** 对话框关闭时清理状态 */
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && !isProcessing) {
      setSelectedFile(null);
      setDragOver(false);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('doc.dialog_title')}</DialogTitle>
          <DialogDescription>
            {t('doc.dialog_desc')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* 文件拖拽上传区域 */}
          <div
            className={`
              relative flex flex-col items-center justify-center
              rounded-lg border-2 border-dashed p-8 transition-all cursor-pointer
              ${dragOver
                ? 'border-blue-500 bg-blue-500/10'
                : selectedFile
                  ? 'border-green-500 bg-green-500/5'
                  : 'border-zinc-600 hover:border-zinc-400 hover:bg-zinc-800/50'
              }
              ${isProcessing ? 'pointer-events-none opacity-60' : ''}
            `}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleInputChange}
              className="hidden"
              disabled={isProcessing}
            />

            {selectedFile ? (
              <>
                <CheckCircle2 className="h-10 w-10 text-green-500 mb-3" />
                <div className="flex items-center gap-2 text-sm text-zinc-300">
                  <FileText className="h-4 w-4" />
                  <span className="font-medium">{selectedFile.name}</span>
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
                <p className="text-xs text-zinc-500 mt-2">
                  {t('doc.click_to_change')}
                </p>
              </>
            ) : (
              <>
                <Upload className="h-10 w-10 text-zinc-500 mb-3" />
                <p className="text-sm text-zinc-400">
                  {t('doc.drop_hint')}
                </p>
                <p className="text-xs text-zinc-600 mt-1">
                  {t('doc.file_limit')}
                </p>
              </>
            )}
          </div>

          {/* 知识深度滑块 */}
          <div className="grid grid-cols-4 items-center gap-4">
            <label className="text-right text-sm font-medium text-zinc-300">
              {t('app.complexity_label')}
            </label>
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
            disabled={isProcessing || !selectedFile}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isUploading ? t('doc.uploading') : t('doc.generating_graph')}
              </>
            ) : (
              t('doc.start_analyze')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
