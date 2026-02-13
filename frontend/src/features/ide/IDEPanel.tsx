import { useState } from 'react';
import { CodeEditor } from '../../components/CodeEditor';
import { Button } from '../../components/ui/button';
import { Play, RotateCcw, Terminal } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { api } from '../../api/client';
import { toast } from 'sonner';

interface IDEPanelProps {
    initialCode?: string;
    initialLanguage?: string;
}

export function IDEPanel({ initialCode = "", initialLanguage = "python" }: IDEPanelProps) {
    const [code, setCode] = useState(initialCode);
    const [language, setLanguage] = useState(initialLanguage);
    const [output, setOutput] = useState("");
    const [isRunning, setIsRunning] = useState(false);

    const handleRun = async () => {
        if (!code.trim()) return;
        setIsRunning(true);
        setOutput("Running...");
        
        try {
            const result = await api.runCode(code, language);
            if (result.error) {
                setOutput(`Error:\n${result.error}`);
            } else {
                setOutput(result.output || "No output");
            }
        } catch (error) {
            console.error(error);
            toast.error("Failed to run code");
            setOutput("System Error");
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Toolbar */}
            <div className="flex items-center justify-between p-2 border-b bg-muted/40">
                <div className="flex items-center gap-2">
                    <Select value={language} onValueChange={setLanguage}>
                        <SelectTrigger className="w-[120px] h-8 text-xs">
                            <SelectValue placeholder="Language" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="python">Python</SelectItem>
                            <SelectItem value="javascript">JavaScript</SelectItem>
                            <SelectItem value="go">Go</SelectItem>
                            <SelectItem value="c">C</SelectItem>
                            <SelectItem value="cpp">C++</SelectItem>
                            <SelectItem value="java">Java</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-center gap-2">
                    <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => setCode("")}
                        className="h-8 w-8 p-0"
                        title="Reset Code"
                    >
                        <RotateCcw className="h-4 w-4" />
                    </Button>
                    <Button 
                        size="sm" 
                        onClick={handleRun} 
                        disabled={isRunning}
                        className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
                    >
                        {isRunning ? "Running..." : (
                            <>
                                <Play className="w-3 h-3 mr-1.5" />
                                Run Code
                            </>
                        )}
                    </Button> 
                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 min-h-0">
                 <CodeEditor 
                    language={language}
                    code={code}
                    onChange={(val) => setCode(val || "")}
                    theme="vs-dark"
                />
            </div>

            {/* Console Output */}
            <div className="h-[30%] border-t flex flex-col bg-slate-950 text-slate-50">
                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800 text-xs font-mono text-slate-400 bg-slate-900">
                    <Terminal className="w-3 h-3" />
                    <span>Console Output</span>
                </div>
                <div className="flex-1 p-3 font-mono text-sm overflow-auto whitespace-pre-wrap">
                    {output || <span className="text-slate-600 italic">Ready to run...</span>}
                </div>
            </div>
        </div>
    );
}
