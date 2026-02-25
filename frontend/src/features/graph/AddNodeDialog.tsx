import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../components/ui/label";
import { Loader2 } from "lucide-react";

interface AddNodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdding: boolean;
  onAdd: (name: string, currentMastery: number, targetMastery: number, note: string) => void;
  t: (key: string) => string;
}

/**
 * 添加知识节点对话框
 * 用户输入节点名称、掌握度等信息后，由 AI 智能生成过渡节点并融入星图
 */
export function AddNodeDialog({
  open,
  onOpenChange,
  isAdding,
  onAdd,
  t
}: AddNodeDialogProps) {
  const [name, setName] = useState('');
  const [currentMastery, setCurrentMastery] = useState(0.0);
  const [targetMastery, setTargetMastery] = useState(0.8);
  const [note, setNote] = useState('');

  const handleSubmit = () => {
    if (!name.trim()) return;
    onAdd(name.trim(), currentMastery, targetMastery, note);
    // NOTE: 提交后重置表单，对话框由父组件在成功后关闭
    setName('');
    setCurrentMastery(0.0);
    setTargetMastery(0.8);
    setNote('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('add_node.title')}</DialogTitle>
          <DialogDescription>
            {t('add_node.desc')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          {/* 节点名称（必填） */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="addNodeName" className="text-right">
              {t('add_node.name_label')}
            </Label>
            <Input
              id="addNodeName"
              placeholder={t('add_node.name_placeholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="col-span-3"
              disabled={isAdding}
            />
          </div>
          {/* 当前掌握度 */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="addNodeMastery" className="text-right">
              {t('add_node.mastery_label')}
            </Label>
            <Input
              id="addNodeMastery"
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={currentMastery}
              onChange={(e) => setCurrentMastery(parseFloat(e.target.value) || 0)}
              className="col-span-3 bg-slate-50 border-slate-200 focus:border-blue-500 transition-colors"
              disabled={isAdding}
            />
          </div>
          {/* 期望掌握度 */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="addNodeTarget" className="text-right">
              {t('add_node.target_label')}
            </Label>
            <Input
              id="addNodeTarget"
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={targetMastery}
              onChange={(e) => setTargetMastery(parseFloat(e.target.value) || 0.8)}
              className="col-span-3 bg-slate-50 border-slate-200 focus:border-blue-500 transition-colors"
              disabled={isAdding}
            />
          </div>
          {/* 备注（可选） */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="addNodeNote" className="text-right">
              {t('add_node.note_label')}
            </Label>
            <Textarea
              id="addNodeNote"
              placeholder={t('add_node.note_placeholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="col-span-3 bg-slate-50 border-slate-200 focus:border-blue-500 transition-colors min-h-[80px]"
              disabled={isAdding}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={isAdding || !name.trim()}
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700"
          >
            {isAdding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('add_node.adding')}
              </>
            ) : (
              t('add_node.submit')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
