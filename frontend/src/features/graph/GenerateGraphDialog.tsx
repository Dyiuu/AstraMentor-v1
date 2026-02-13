import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Loader2 } from "lucide-react";

interface GenerateGraphDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inputTopic: string;
  setInputTopic: (value: string) => void;
  inputLevel: string;
  setInputLevel: (value: string) => void;
  inputGoal: string;
  setInputGoal: (value: string) => void;
  isGenerating: boolean;
  onGenerate: () => void;
  t: (key: string) => string;
}

export function GenerateGraphDialog({
  open,
  onOpenChange,
  inputTopic,
  setInputTopic,
  inputLevel,
  setInputLevel,
  inputGoal,
  setInputGoal,
  isGenerating,
  onGenerate,
  t
}: GenerateGraphDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('app.dialog_title')}</DialogTitle>
          <DialogDescription>
            {t('app.dialog_desc')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
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
              disabled={isGenerating}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="level" className="text-right">
              {t('app.level_label')}
            </Label>
            <Input
              id="level"
              placeholder={t('app.level_placeholder')}
              value={inputLevel}
              onChange={(e) => setInputLevel(e.target.value)}
              className="col-span-3"
              disabled={isGenerating}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="goal" className="text-right">
              {t('app.goal_label')}
            </Label>
            <Input
              id="goal"
              placeholder={t('app.goal_placeholder')}
              value={inputGoal}
              onChange={(e) => setInputGoal(e.target.value)}
              className="col-span-3"
              disabled={isGenerating}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onGenerate} disabled={isGenerating || !inputTopic} className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700">
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('app.generating_graph')}
              </>
            ) : (
              t('app.start_generate')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
