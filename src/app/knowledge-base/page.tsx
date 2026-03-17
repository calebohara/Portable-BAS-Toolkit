'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  BookOpen, Send, Trash2, Reply, ChevronDown, ChevronUp,
  Filter, FileText, Download, Search, MessageSquare, PenLine,
} from 'lucide-react';
import { useKbCategories, useKbArticles } from '@/hooks/use-knowledge-base';
import { useAuth } from '@/providers/auth-provider';
import { TopBar } from '@/components/layout/top-bar';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { getPublicUrl } from '@/lib/storage';
import type { KbArticle, KbReply } from '@/types/knowledge-base';

// ─── Constants ───────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ─── Simple Markdown Renderer ────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  if (!text) return '';
  const html = text
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headings (## text)
    .replace(/^## (.+)$/gm, '<strong class="text-base block mt-3 mb-1">$1</strong>')
    .replace(/^### (.+)$/gm, '<strong class="text-sm block mt-2 mb-1">$1</strong>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">$1</code>')
    // Blockquotes
    .replace(/^&gt; (.+)$/gm, '<div class="border-l-2 border-primary/30 pl-3 text-muted-foreground italic">$1</div>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match: string, text: string, url: string) => {
      const safeUrl = /^(https?:\/\/|\/|mailto:)/i.test(url) ? url.replace(/"/g, '&quot;') : '#';
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">${text}</a>`;
    })
    // Line breaks
    .replace(/\n/g, '<br />');
  return html;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function KnowledgeBasePage() {
  const router = useRouter();
  const { categories } = useKbCategories();
  const { articles, loading, removeArticle, replyToArticle, removeReply } = useKbArticles();
  const { user } = useAuth();

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
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Siemens Knowledge Base</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Shared knowledge, tips, and documentation for the team
            </p>
          </div>
          <Button
            className="gap-2 shrink-0"
            onClick={() => router.push('/knowledge-base/new')}
          >
            <PenLine className="h-4 w-4" />
            New Article
          </Button>
        </div>

        {/* Search & Filter */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search articles by title, content, author, or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10"
            />
          </div>
          {activeCategories.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
              <button
                onClick={() => setFilterCategoryId('')}
                className={`rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors border ${
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
                  className={`rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors border ${
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

        {/* Article count */}
        {!loading && filtered.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? 'article' : 'articles'}
            {filterCategoryId || searchQuery ? ' found' : ''}
          </p>
        )}

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
          <div className="space-y-4">
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
  const [confirmDeleteArticle, setConfirmDeleteArticle] = useState(false);

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
    <Card className="group overflow-hidden">
      <CardContent className="p-0">
        {/* Article Header */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start gap-4">
            {/* Author Avatar */}
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 overflow-hidden text-sm font-semibold text-primary">
              {article.authorAvatarUrl ? (
                <img src={article.authorAvatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" />
              ) : (
                (article.authorName?.[0] ?? '?').toUpperCase()
              )}
            </div>

            <div className="flex-1 min-w-0">
              {/* Meta row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold">
                  {article.authorName || 'Unknown'}
                </span>
                <span className="text-xs text-muted-foreground">posted in</span>
                <Badge variant="secondary" className="text-[11px] px-2 py-0.5">
                  {article.categoryName}
                </Badge>
                <span className="text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(article.createdAt), 'MMM d, yyyy · h:mm a')}
                </span>
              </div>

              {/* Subject */}
              <h3 className="text-lg font-semibold mt-2 leading-tight">{article.subject}</h3>
            </div>

            {/* Delete button (author only) */}
            {userId === article.createdBy && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 max-sm:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => setConfirmDeleteArticle(true)}
                aria-label="Delete article"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <ConfirmDialog
          open={confirmDeleteArticle}
          onOpenChange={setConfirmDeleteArticle}
          title="Delete Article"
          description={`Are you sure you want to delete "${article.subject}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={() => onDeleteArticle(article.id)}
        />

        {/* Body */}
        {article.body && (
          <div className="px-5 pb-4">
            <div
              className="text-sm text-foreground/80 leading-relaxed prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(article.body) }}
            />
          </div>
        )}

        {/* Attachments */}
        {article.attachments.length > 0 && (
          <div className="px-5 pb-4">
            <div className="flex flex-wrap gap-2">
              {article.attachments.map((att) => {
                const url = att.storagePath ? getPublicUrl(att.storagePath) : null;
                return (
                  <a
                    key={att.id}
                    href={url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs hover:bg-accent transition-colors"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate max-w-40">{att.fileName}</span>
                    <span className="text-muted-foreground">{formatFileSize(att.size)}</span>
                    <Download className="h-3.5 w-3.5 text-muted-foreground" />
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* Action bar */}
        <div className="flex items-center gap-1 px-5 py-3 border-t border-border/50 bg-muted/20">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground gap-2"
            onClick={() => setShowReplyForm(!showReplyForm)}
          >
            <Reply className="h-4 w-4" />
            Reply
          </Button>
          {(article.replyCount ?? 0) > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground gap-2"
              onClick={() => setShowReplies(!showReplies)}
            >
              <MessageSquare className="h-4 w-4" />
              {showReplies ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {article.replyCount} {article.replyCount === 1 ? 'reply' : 'replies'}
            </Button>
          )}
        </div>

        {/* Reply Form */}
        {showReplyForm && (
          <div className="px-5 py-4 border-t border-border/50 bg-muted/10">
            <div className="flex items-start gap-3">
              <textarea
                placeholder="Write a reply..."
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                rows={3}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && replyBody.trim()) {
                    e.preventDefault();
                    handleReply();
                  }
                }}
              />
              <div className="flex flex-col gap-1.5">
                <Button
                  onClick={handleReply}
                  disabled={!replyBody.trim() || replying}
                  size="sm"
                  className="h-9 gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => { setShowReplyForm(false); setReplyBody(''); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Replies */}
        {showReplies && article.replies && article.replies.length > 0 && (
          <div className="border-t border-border/50">
            {article.replies.map((reply, i) => (
              <ReplyItem
                key={reply.id}
                reply={reply}
                userId={userId}
                onDelete={onDeleteReply}
                isLast={i === article.replies!.length - 1}
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
  isLast?: boolean;
}

function ReplyItem({ reply, userId, onDelete, isLast }: ReplyItemProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className={`flex items-start gap-3 px-5 py-4 group/reply bg-muted/5 ${!isLast ? 'border-b border-border/30' : ''}`}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 overflow-hidden text-[11px] font-semibold text-primary">
        {reply.authorAvatarUrl ? (
          <img src={reply.authorAvatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          (reply.authorName?.[0] ?? '?').toUpperCase()
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold">{reply.authorName || 'Unknown'}</span>
          <span className="text-xs text-muted-foreground">
            {format(new Date(reply.createdAt), 'MMM d, yyyy · h:mm a')}
          </span>
        </div>
        <p className="text-sm text-foreground/80 mt-1.5 whitespace-pre-wrap leading-relaxed">{reply.body}</p>
      </div>
      {userId === reply.createdBy && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 opacity-0 group-hover/reply:opacity-100 max-sm:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete Reply"
        description="Are you sure you want to delete this reply? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => onDelete(reply.id)}
      />
    </div>
  );
}
