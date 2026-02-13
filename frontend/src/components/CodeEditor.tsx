import Editor from "@monaco-editor/react";
import { Loader2 } from "lucide-react";

interface CodeEditorProps {
    language: string;
    code: string;
    onChange: (value: string | undefined) => void;
    theme?: string;
}

export function CodeEditor({ language, code, onChange, theme = "vs-dark" }: CodeEditorProps) {
    return (
        <div className="h-full w-full rounded-md overflow-hidden border border-input shadow-sm">
            <Editor
                height="100%"
                language={language}
                value={code}
                theme={theme}
                onChange={onChange}
                loading={<Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />}
                options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    padding: { top: 16, bottom: 16 },
                }}
            />
        </div>
    );
}
