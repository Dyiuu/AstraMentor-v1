import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { toast } from 'sonner';
import { useLanguage } from '../../contexts/LanguageContext';
import type { GraphNodeAttributes } from '../../types';

interface NodeDetailsNode {
  id: string;
  data?: GraphNodeAttributes & {
    label?: string;
    name?: string;
    attributes?: GraphNodeAttributes;
  };
}

interface NodeUpdatePayload {
  weight_A: number;
  weight_B: number;
  user_note: string;
}

interface NodeDetailsModalProps {
  node: NodeDetailsNode | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updatedNode: NodeUpdatePayload) => void | Promise<void>;
  onDelete?: (nodeId: string) => void; // 删除节点回调
}

export const NodeDetailsModal: React.FC<NodeDetailsModalProps> = ({ node, isOpen, onClose, onUpdate, onDelete }) => {
  const { t } = useLanguage();
  const [weightA, setWeightA] = useState(0.0);
  const [weightB, setWeightB] = useState(0.8);
  const [userNote, setUserNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (node) {
        setWeightA(node.data?.weight_A ?? node.data?.attributes?.weight_A ?? 0.0);
        setWeightB(node.data?.weight_B ?? node.data?.attributes?.weight_B ?? 0.8);
        setUserNote(node.data?.user_note ?? node.data?.attributes?.user_note ?? '');
    }
  }, [node]);

  const handleSave = async () => {
    if (!node) return;
    setIsLoading(true);
    try {
        await onUpdate({
           weight_A: parseFloat(weightA.toString()),
           weight_B: parseFloat(weightB.toString()),
           user_note: userNote
        });
        toast.success(t('node_modal.success'));
        onClose();
    } catch (error) {
        console.error(error);
        toast.error(t('node_modal.fail'));
    } finally {
        setIsLoading(false);
    }
  };

  /**
   * 删除节点前弹出确认，确认后调用 onDelete 回调
   * NOTE: 使用 window.confirm 保持轻量，避免引入额外弹窗组件
   */
  const handleDelete = () => {
    if (!onDelete || !node) return;
    const confirmed = window.confirm(t('node_modal.delete_confirm'));
    if (confirmed) {
      onDelete(node.id);
      onClose();
    }
  };

  if (!node) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{node.data?.label || node.id}</DialogTitle>
          <DialogDescription>
            {node.data?.description ?? node.data?.attributes?.description ?? t('node_modal.no_desc')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="weightA" className="text-right">
              {t('node_modal.mastered_label')}
            </Label>
            <Input
              id="weightA"
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={weightA}
              onChange={(e) => setWeightA(parseFloat(e.target.value))}
              className="col-span-3 bg-slate-50 border-slate-200 focus:border-blue-500 transition-colors"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="weightB" className="text-right">
              {t('node_modal.target_label')}
            </Label>
            <Input
              id="weightB"
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={weightB}
              onChange={(e) => setWeightB(parseFloat(e.target.value))}
              className="col-span-3 bg-slate-50 border-slate-200 focus:border-blue-500 transition-colors"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="userNote" className="text-right">
              {t('node_modal.note_label')}
            </Label>
            <Textarea
              id="userNote"
              value={userNote}
              onChange={(e) => setUserNote(e.target.value)}
              className="col-span-3 bg-slate-50 border-slate-200 focus:border-blue-500 transition-colors min-h-[100px]"
            />
          </div>
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          {onDelete && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              className="mr-auto"
            >
              {t('node_modal.delete')}
            </Button>
          )}
          <Button type="submit" onClick={handleSave} disabled={isLoading}>
            {isLoading ? t('node_modal.saving') : t('node_modal.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
