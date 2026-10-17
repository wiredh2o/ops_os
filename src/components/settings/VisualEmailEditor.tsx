import { useRef, useEffect, useCallback, useState } from "react";
import EmailEditor, { EditorRef, EmailEditorProps } from "react-email-editor";
import { Button } from "@/components/ui/button";
import { Loader2, Save, RotateCcw, Code, Eye } from "lucide-react";

interface MergeField {
  name: string;
  value: string;
  sample?: string;
}

interface VisualEmailEditorProps {
  initialHtml: string;
  mergeFields: MergeField[];
  onExportHtml: (html: string) => void;
  onSave: () => void;
  onReset: () => void;
  isSaving?: boolean;
  templateId: string;
}

export function VisualEmailEditor({
  initialHtml,
  mergeFields,
  onExportHtml,
  onSave,
  onReset,
  isSaving,
  templateId,
}: VisualEmailEditorProps) {
  const emailEditorRef = useRef<EditorRef>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const onReady: EmailEditorProps["onReady"] = useCallback((unlayer) => {
    console.log("Unlayer editor ready");
    setEditorReady(true);
    setIsLoading(false);

    // Register merge tags
    const mergeTags: Record<string, { name: string; value: string; sample?: string }> = {};
    mergeFields.forEach((field) => {
      const key = field.value.replace(/\{\{|\}\}/g, "");
      mergeTags[key] = {
        name: field.name,
        value: field.value,
        sample: field.sample || field.value,
      };
    });

    // Configure the editor
    unlayer.setMergeTags(mergeTags);

    // Load initial HTML if provided
    if (initialHtml) {
      unlayer.loadDesign({
        html: initialHtml,
        classic: true,
      } as any);
    }
  }, [initialHtml, mergeFields]);

  const exportHtml = useCallback(() => {
    const unlayer = emailEditorRef.current?.editor;
    if (!unlayer) return;

    unlayer.exportHtml((data: { html: string }) => {
      const { html } = data;
      onExportHtml(html);
    });
  }, [onExportHtml]);

  const handleSave = useCallback(() => {
    exportHtml();
    // Small delay to ensure export completes
    setTimeout(() => {
      onSave();
    }, 100);
  }, [exportHtml, onSave]);

  // Export HTML when editor content changes
  useEffect(() => {
    if (!editorReady) return;

    const unlayer = emailEditorRef.current?.editor;
    if (!unlayer) return;

    // Listen for design updates
    unlayer.addEventListener("design:updated", () => {
      unlayer.exportHtml((data: { html: string }) => {
        onExportHtml(data.html);
      });
    });

    return () => {
      unlayer.removeEventListener("design:updated");
    };
  }, [editorReady, onExportHtml]);

  // Reload when template changes
  useEffect(() => {
    if (!editorReady) return;

    const unlayer = emailEditorRef.current?.editor;
    if (!unlayer || !initialHtml) return;

    unlayer.loadDesign({
      html: initialHtml,
      classic: true,
    } as any);
  }, [templateId, editorReady, initialHtml]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Visual Editor</span>
          {isLoading && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading editor...
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving || !editorReady}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            Save
          </Button>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden bg-white" style={{ height: "600px" }}>
        <EmailEditor
          ref={emailEditorRef}
          onReady={onReady}
          minHeight="600px"
          options={{
            displayMode: "email",
            features: {
              textEditor: {
                spellChecker: true,
              },
            },
            tools: {
              // Enable only essential tools
              text: { enabled: true },
              image: { enabled: true },
              button: { enabled: true },
              divider: { enabled: true },
              html: { enabled: true },
              heading: { enabled: true },
              menu: { enabled: false },
              social: { enabled: false },
              video: { enabled: false },
              timer: { enabled: false },
            },
            appearance: {
              theme: "light",
            },
          }}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Drag and drop elements to build your email. Use merge tags from the right panel to personalize content.
      </p>
    </div>
  );
}
