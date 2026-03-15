'use client';

import { useState, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import {
  BookOpen, Send, Trash2, Reply, ChevronDown, ChevronUp,
  Filter, Plus, Paperclip, X, FileText, Download, Search,
} from 'lucide-react';
import { useKbCategories, useKbArticles } from '@/hooks/use-knowledge-base';
import { useAuth } from '@/providers/auth-provider';
import { TopBar } from '@/components/layout/top-bar';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { buildStoragePath, uploadProjectFile, getPublicUrl } from '@/lib/storage';
import type { KbArticle, KbReply, KbAttachment } from '@/types/knowledge-base';

// ─── Constants ───────────────────────────────────────────────────────────────

const KB_MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function KnowledgeBasePage() {
  const { categories, addCategory } = useKbCategories();
  const { articles, loading, postArticle, removeArticle, replyToArticle, removeReply } = useKbArticles();
  const { user } = useAuth();

  // New article dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newCategoryId, setNewCategoryId] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter & search
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Filtered articles
  const filtered = useMemo(() => {
    let result = articles;
    if (filterCategoryId) {
      result = result.filter((a) => a.categoryId === filterCategoryId);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.subject.toLowerCase().includes(q) ||
          a.body.toLowerCase().includes(q) ||
          a.authorName?.toLowerCase().includes(q) ||
          a.categoryName.toLowerCase().includes(q),
      );
    }
    return result;
  }, [articles, filterCategoryId, searchQuery]);

  // Categories used in articles (for filter)
  const activeCategories = useMemo(() => {
    const ids = new Set(articles.map((a) => a.categoryId));
    return categories.filter((c) => ids.has(c.id));
  }, [articles, categories]);

  // ── Handlers ─────────────────────────────────────────────────────────────

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

  const handlePost = async () => {
    if (!newSubject.trim()) {
      toast.error('Subject is required');
      return;
    }

    let categoryId = newCategoryId;

    // Create new category if needed
    if (showNewCategory && newCategoryName.trim()) {
      try {
        const cat = await addCategory(newCategoryName.trim());
        categoryId = cat.id;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to create category');
        return;
      }
    }

    if (!categoryId) {
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

      await postArticle(newSubject.trim(), newBody.trim(), categoryId, attachments);
      setNewSubject('');
      setNewBody('');
      setNewCategoryId('');
      setNewCategoryName('');
      setShowNewCategory(false);
      setPendingFiles([]);
      setDialogOpen(false);
      toast.success('Article posted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to post article');
    } finally {
      setPosting(false);
    }
  };

  const handleDeleteArticle = async (id: string) => {
    try {
      await removeArticle(id);
      toast.success('Article deleted');
    } catch {
      toast.error('Failed to delete article');
    }
  };

  const handleDeleteReply = async (id: string) => {
    try {
      await removeReply(id);
      toast.success('Reply deleted');
    } catch {
      toast.error('Failed to delete reply');
    }
  };

  return (
    <>
      <TopBar title="Knowledge Base" />
      <div className="p-4 md:p-6 max-w-4xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Siemens Knowledge Base</h1>
            <p className="text-xs text-muted-foreground">
              Shared knowledge, tips, and documentation for the team
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger>
              <Button className="gap-1.5" size="sm">
                <Plus className="h-3.5 w-3.5" />
                New Article
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New Knowledge Base Article</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 px-5 py-5">
                {/* Subject */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Subject <span className="text-destructive">*</span></label>
                  <Input
                    placeholder="Enter article subject..."
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                  />
                </div>

                {/* Category */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Category <span className="text-destructive">*</span></label>
                  {!showNewCategory ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={newCategoryId}
                        onChange={(e) => setNewCategoryId(e.target.value)}
                        className="flex-1 h-9 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                      >
                        <option value="">Select category...</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 gap-1 text-xs"
                        onClick={() => setShowNewCategory(true)}
                      >
                        <Plus className="h-3 w-3" />
                        New
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="New category name..."
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        className="flex-1"
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => { setShowNewCategory(false); setNewCategoryName(''); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>

                {/* Body */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Content</label>
                  <textarea
                    placeholder="Write your article content..."
                    value={newBody}
                    onChange={(e) => setNewBody(e.target.value)}
                    rows={6}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                  />
                </div>

                {/* File Attachments */}
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    Attach Files
                    <span className="text-muted-foreground">(max 25MB)</span>
                  </Button>
                  {pendingFiles.length > 0 && (
                    <div className="space-y-1.5">
                      {pendingFiles.map((f, i) => (
                        <div
                          key={`${f.name}-${i}`}
                          className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs"
                        >
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate flex-1">{f.name}</span>
                          <span className="text-muted-foreground shrink-0">{formatFileSize(f.size)}</span>
                          <button
                            onClick={() => removePendingFile(i)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Submit */}
                <div className="flex justify-end pt-2 border-t border-border">
                  <Button
                    onClick={handlePost}
                    disabled={!newSubject.trim() || posting || (!newCategoryId && !newCategoryName.trim())}
                    className="gap-1.5"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {posting ? 'Posting...' : 'Post Article'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {activeCategories.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <button
                onClick={() => setFilterCategoryId('')}
                className={`rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors border ${
                  !filterCategoryId
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
                }`}
              >
                All
              </button>
              {activeCategories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setFilterCategoryId(filterCategoryId === c.id ? '' : c.id)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors border ${
                    filterCategoryId === c.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Articles */}
        {loading ? (
          <div className="flex items-center justify-center p-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={searchQuery || filterCategoryId ? 'No matching articles' : 'No articles yet'}
            description={
              searchQuery || filterCategoryId
                ? 'Try different search terms or clear the filter.'
                : 'Be the first to share knowledge — click "New Article" above.'
            }
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                userId={user?.id}
                onDeleteArticle={handleDeleteArticle}
                onReply={replyToArticle}
                onDeleteReply={handleDeleteReply}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Article Card ────────────────────────────────────────────────────────────

interface ArticleCardProps {
  article: KbArticle;
  userId?: string;
  onDeleteArticle: (id: string) => void;
  onReply: (articleId: string, body: string) => Promise<KbReply>;
  onDeleteReply: (id: string) => void;
}

function ArticleCard({ article, userId, onDeleteArticle, onReply, onDeleteReply }: ArticleCardProps) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replying, setReplying] = useState(false);
  const [showReplies, setShowReplies] = useState(true);

  const handleReply = async () => {
    if (!replyBody.trim()) return;
    setReplying(true);
    try {
      await onReply(article.id, replyBody.trim());
      setReplyBody('');
      setShowReplyForm(false);
      toast.success('Reply posted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to post reply');
    } finally {
      setReplying(false);
    }
  };

  return (
    <Card className="group">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          {/* Author Avatar */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 overflow-hidden text-sm font-semibold text-primary">
            {article.authorAvatarUrl ? (
              <img src={article.authorAvatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              (article.authorName?.[0] ?? '?').toUpperCase()
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Header row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold truncate">
                {article.authorName || 'Unknown'}
              </span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {article.categoryName}
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                {format(new Date(article.createdAt), 'MMM d, yyyy · h:mm a')}
              </span>
            </div>

            {/* Subject */}
            <h3 className="text-base font-semibold mt-1">{article.subject}</h3>

            {/* Body */}
            {article.body && (
              <div className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap leading-relaxed">
                {article.body}
              </div>
            )}

            {/* Attachments */}
            {article.attachments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {article.attachments.map((att) => {
                  const url = att.storagePath ? getPublicUrl(att.storagePath) : null;
                  return (
                    <a
                      key={att.id}
                      href={url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 py-1.5 text-xs hover:bg-accent transition-colors"
                    >
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate max-w-40">{att.fileName}</span>
                      <span className="text-muted-foreground">{formatFileSize(att.size)}</span>
                      <Download className="h-3 w-3 text-muted-foreground" />
                    </a>
                  );
                })}
              </div>
            )}

            {/* Action row */}
            <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/50">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                onClick={() => setShowReplyForm(!showReplyForm)}
              >
                <Reply className="h-3.5 w-3.5" />
                Reply
              </Button>
              {(article.replyCount ?? 0) > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                  onClick={() => setShowReplies(!showReplies)}
                >
                  {showReplies ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {article.replyCount} {article.replyCount === 1 ? 'reply' : 'replies'}
                </Button>
              )}
            </div>
          </div>

          {/* Delete button (author only) */}
          {userId === article.createdBy && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 max-sm:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              onClick={() => onDeleteArticle(article.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Reply Form */}
        {showReplyForm && (
          <div className="mt-3 ml-13 flex items-start gap-2">
            <textarea
              placeholder="Write a reply..."
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              rows={2}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && replyBody.trim()) {
                  e.preventDefault();
                  handleReply();
                }
              }}
            />
            <div className="flex flex-col gap-1">
              <Button
                onClick={handleReply}
                disabled={!replyBody.trim() || replying}
                size="sm"
                className="h-8 gap-1"
              >
                <Send className="h-3 w-3" />
                Send
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => { setShowReplyForm(false); setReplyBody(''); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Replies */}
        {showReplies && article.replies && article.replies.length > 0 && (
          <div className="mt-3 ml-13 space-y-3 border-t border-border pt-3">
            {article.replies.map((reply) => (
              <ReplyItem
                key={reply.id}
                reply={reply}
                userId={userId}
                onDelete={onDeleteReply}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Reply Item ──────────────────────────────────────────────────────────────

interface ReplyItemProps {
  reply: KbReply;
  userId?: string;
  onDelete: (id: string) => void;
}

function ReplyItem({ reply, userId, onDelete }: ReplyItemProps) {
  return (
    <div className="flex items-start gap-2.5 group/reply">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 overflow-hidden text-[10px] font-semibold text-primary">
        {reply.authorAvatarUrl ? (
          <img src={reply.authorAvatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
        ) : (
          (reply.authorName?.[0] ?? '?').toUpperCase()
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold truncate">{reply.authorName || 'Unknown'}</span>
          <span className="text-[10px] text-muted-foreground">
            {format(new Date(reply.createdAt), 'MMM d, yyyy · h:mm a')}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{reply.body}</p>
      </div>
      {userId === reply.createdBy && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 opacity-0 group-hover/reply:opacity-100 max-sm:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(reply.id)}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
