'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Send, Plus, Paperclip, X, FileText,
  Bold, Italic, List, ListOrdered, Heading2, Code, Link2, Quote,
} from 'lucide-react';
import { useKbCategories } from '@/hooks/use-knowledge-base';

import { TopBar } from '@/components/layout/top-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { buildStoragePath, uploadProjectFile } from '@/lib/storage';
import { createKbArticle, createKbCategory } from '@/lib/knowledge-base/api';
import type { KbAttachment } from '@/types/knowledge-base';

// ─── Constants ───────────────────────────────────────────────────────────────

const KB_MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ─── Markdown Toolbar ────────────────────────────────────────────────────────

interface ToolbarAction {
  icon: React.ElementType;
  label: string;
  prefix: string;
  suffix: string;
  block?: boolean;
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { icon: Bold, label: 'Bold', prefix: '**', suffix: '**' },
  { icon: Italic, label: 'Italic', prefix: '_', suffix: '_' },
  { icon: Heading2, label: 'Heading', prefix: '## ', suffix: '', block: true },
  { icon: Code, label: 'Code', prefix: '`', suffix: '`' },
  { icon: Quote, label: 'Quote', prefix: '> ', suffix: '', block: true },
  { icon: List, label: 'Bullet List', prefix: '- ', suffix: '', block: true },
  { icon: ListOrdered, label: 'Numbered List', prefix: '1. ', suffix: '', block: true },
  { icon: Link2, label: 'Link', prefix: '[', suffix: '](url)' },
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function NewArticlePage() {
  const router = useRouter();
  const { categories } = useKbCategories();

  // Form state
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Markdown toolbar handler ────────────────────────────────────────────

  const applyFormat = useCallback((action: ToolbarAction) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = body.substring(start, end);

    let newText: string;
    let cursorPos: number;

    if (action.block) {
      // Block-level: insert at line start
      const lineStart = body.lastIndexOf('\n', start - 1) + 1;
      const before = body.substring(0, lineStart);
      const after = body.substring(lineStart);
      newText = before + action.prefix + after;
      cursorPos = start + action.prefix.length;
    } else if (selected) {
      // Wrap selection
      newText = body.substring(0, start) + action.prefix + selected + action.suffix + body.substring(end);
      cursorPos = end + action.prefix.length + action.suffix.length;
    } else {
      // Insert placeholder
      const placeholder = action.label.toLowerCase();
      newText = body.substring(0, start) + action.prefix + placeholder + action.suffix + body.substring(end);
      cursorPos = start + action.prefix.length;
    }

    setBody(newText);
    // Restore focus & selection after state update
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursorPos, cursorPos);
    });
  }, [body]);

  // ── File handling ───────────────────────────────────────────────────────

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid: File[] = [];
    for (const f of files) {
      if (f.size > KB_MAX_FILE_SIZE) {
        toast.error(`"${f.name}" exceeds 25MB limit`);
      } else {
        valid.push(f);
      }
    }
    setPendingFiles((prev) => [...prev, ...valid]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Submit ──────────────────────────────────────────────────────────────

  const handlePost = async () => {
    if (!subject.trim()) {
      toast.error('Subject is required');
      return;
    }

    let finalCategoryId = categoryId;

    // Create new category if needed
    if (showNewCategory && newCategoryName.trim()) {
      try {
        const result = await createKbCategory(newCategoryName.trim());
        if (result.error) {
          toast.error(result.error);
          return;
        }
        finalCategoryId = result.data!.id;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to create category');
        return;
      }
    }

    if (!finalCategoryId) {
      toast.error('Please select or create a category');
      return;
    }

    setPosting(true);
    try {
      // Upload files
      const attachments: KbAttachment[] = [];
      for (const file of pendingFiles) {
        const path = buildStoragePath('kb', file.name, 'knowledge-base');
        await uploadProjectFile(file, path);
        attachments.push({
          id: crypto.randomUUID(),
          fileName: file.name,
          fileType: file.name.split('.').pop()?.toLowerCase() || '',
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          storagePath: path,
        });
      }

      const result = await createKbArticle(subject.trim(), body.trim(), finalCategoryId, attachments);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success('Article posted successfully');
      router.push('/knowledge-base');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to post article');
    } finally {
      setPosting(false);
    }
  };

  // ── Character count ─────────────────────────────────────────────────────

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;

  return (
    <>
      <TopBar title="New Article" />
      <div className="min-h-[calc(100vh-3.5rem)] flex flex-col">
        {/* Top navigation bar */}
        <div className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-14 z-10">
          <div className="max-w-4xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => router.push('/knowledge-base')}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Knowledge Base
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {wordCount} {wordCount === 1 ? 'word' : 'words'}
              </span>
              <Button
                onClick={handlePost}
                disabled={!subject.trim() || posting || (!categoryId && !newCategoryName.trim())}
                className="gap-1.5"
              >
                <Send className="h-4 w-4" />
                {posting ? 'Publishing...' : 'Publish Article'}
              </Button>
            </div>
          </div>
        </div>

        {/* Main compose area */}
        <div className="flex-1 max-w-4xl mx-auto w-full px-4 md:px-6 py-6 md:py-8 space-y-6">
          {/* Subject */}
          <div className="space-y-2">
            <Label>
              Subject <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="Enter a descriptive title for your article..."
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="text-lg h-12 font-medium"
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>
              Category <span className="text-destructive">*</span>
            </Label>
            {!showNewCategory ? (
              <div className="flex items-center gap-3">
                <Select value={categoryId} onValueChange={v => setCategoryId(v ?? '')}>
                  <SelectTrigger className="flex-1 h-10">
                    <SelectValue placeholder="Select a category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="default"
                  className="shrink-0 gap-1.5"
                  onClick={() => setShowNewCategory(true)}
                >
                  <Plus className="h-4 w-4" />
                  New Category
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Input
                  placeholder="Enter new category name..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="flex-1 h-10"
                  autoFocus
                />
                <Button
                  variant="ghost"
                  onClick={() => { setShowNewCategory(false); setNewCategoryName(''); }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>

          {/* Content Editor */}
          <div className="space-y-2">
            <Label>Content</Label>
            <Card className="overflow-hidden">
              {/* Formatting Toolbar */}
              <div className="flex items-center gap-0.5 px-3 py-2 border-b border-border bg-muted/30 flex-wrap">
                {TOOLBAR_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    title={action.label}
                    onClick={() => applyFormat(action)}
                    className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <action.icon className="h-4 w-4" />
                  </button>
                ))}
                <div className="h-5 w-px bg-border mx-1.5" />
                <button
                  type="button"
                  title="Attach Files"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <div className="flex-1" />
                <Badge variant="secondary" className="text-[10px] font-normal">
                  Markdown supported
                </Badge>
              </div>

              {/* Textarea */}
              <CardContent className="p-0">
                <textarea
                  ref={textareaRef}
                  placeholder="Write your article content here...&#10;&#10;You can use Markdown formatting:&#10;**bold**, _italic_, `code`, ## headings, - lists, > quotes"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={18}
                  className="w-full bg-background px-4 py-4 text-sm leading-relaxed ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none resize-y min-h-[300px] font-mono"
                />
              </CardContent>
            </Card>
          </div>

          {/* File Attachments */}
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="default"
                className="gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-4 w-4" />
                Attach Files
              </Button>
              <span className="text-xs text-muted-foreground">
                Max 25MB per file
              </span>
            </div>

            {pendingFiles.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {pendingFiles.map((f, i) => (
                  <div
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm group"
                  >
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium text-sm">{f.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(f.size)}</p>
                    </div>
                    <button
                      onClick={() => removePendingFile(i)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom spacer for breathing room */}
          <div className="h-8" />
        </div>

        {/* Sticky bottom bar (mobile-friendly) */}
        <div className="border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky bottom-0 z-10 md:hidden">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {wordCount} {wordCount === 1 ? 'word' : 'words'}
            </span>
            <Button
              onClick={handlePost}
              disabled={!subject.trim() || posting || (!categoryId && !newCategoryName.trim())}
              className="gap-1.5"
            >
              <Send className="h-4 w-4" />
              {posting ? 'Publishing...' : 'Publish Article'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
