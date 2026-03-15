'use client';

import { useState, useMemo, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquare, Send, Trash2, Filter, Reply, ChevronDown, ChevronUp } from 'lucide-react';
import { useGlobalMessages } from '@/hooks/use-global-projects';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { toast } from 'sonner';
import type { GlobalProject, GlobalMessage } from '@/types/global-projects';

interface MessageBoardProps {
  projects: GlobalProject[];
  onUnreadChange?: (count: number) => void;
}

export function MessageBoard({ projects, onUnreadChange }: MessageBoardProps) {
  const { messages, loading, postMessage, removeMessage, unreadCount, markRead } = useGlobalMessages();
  const { user } = useAuth();

  // New post form
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [posting, setPosting] = useState(false);

  // Filter
  const [filterProjectId, setFilterProjectId] = useState<string>('');

  // Mark messages as read when board tab is opened
  useEffect(() => {
    markRead();
  }, [markRead]);

  // Notify parent of unread count changes
  useEffect(() => {
    onUnreadChange?.(unreadCount);
  }, [unreadCount, onUnreadChange]);

  const filtered = useMemo(() => {
    if (!filterProjectId) return messages;
    return messages.filter((m) => m.globalProjectId === filterProjectId);
  }, [messages, filterProjectId]);

  // Collect unique projects referenced in messages for the filter
  const projectsInMessages = useMemo(() => {
    const allFlat = messages.flatMap((m) => [m, ...(m.replies || [])]);
    const ids = new Set(allFlat.map((m) => m.globalProjectId).filter(Boolean));
    return projects.filter((p) => ids.has(p.id));
  }, [messages, projects]);

  const handlePost = async () => {
    if (!subject.trim()) {
      toast.error('Subject is required');
      return;
    }
    setPosting(true);
    try {
      await postMessage(subject.trim(), body.trim(), selectedProjectId || null);
      setSubject('');
      setBody('');
      setSelectedProjectId('');
      toast.success('Message posted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to post message');
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (messageId: string) => {
    try {
      await removeMessage(messageId);
      toast.success('Message deleted');
    } catch {
      toast.error('Failed to delete message');
    }
  };

  return (
    <div className="space-y-4">
      {/* New Post Form */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">New Post</p>
          <Input
            placeholder="Subject *"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && subject.trim()) handlePost(); }}
          />
          <textarea
            placeholder="Message body (optional)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
          />
          <div className="flex items-center gap-2">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="">No project (general)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <Button
              onClick={handlePost}
              disabled={!subject.trim() || posting}
              className="gap-1.5"
              size="sm"
            >
              <Send className="h-3.5 w-3.5" />
              Post
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filter Bar */}
      {projectsInMessages.length > 0 && (
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5">
            <button
              onClick={() => setFilterProjectId('')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                !filterProjectId
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All
            </button>
            {projectsInMessages.map((p) => (
              <button
                key={p.id}
                onClick={() => setFilterProjectId(p.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors truncate max-w-32 ${
                  filterProjectId === p.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages List */}
      {loading ? (
        <div className="flex items-center justify-center p-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={filterProjectId ? 'No messages for this project' : 'No messages yet'}
          description={filterProjectId ? 'Try removing the filter or post the first message.' : 'Start the conversation — post the first message above.'}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((msg) => (
            <MessageCard
              key={msg.id}
              message={msg}
              userId={user?.id}
              projects={projects}
              onDelete={handleDelete}
              onReply={postMessage}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Individual Message Card with Reply Support ──────────────────────────────

interface MessageCardProps {
  message: GlobalMessage;
  userId?: string;
  projects: GlobalProject[];
  onDelete: (id: string) => void;
  onReply: (subject: string, body: string, projectId?: string | null, parentId?: string | null) => Promise<GlobalMessage>;
  isReply?: boolean;
}

function MessageCard({ message: msg, userId, projects, onDelete, onReply, isReply }: MessageCardProps) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replying, setReplying] = useState(false);
  const [showReplies, setShowReplies] = useState(true);
  const [confirmDeleteMsg, setConfirmDeleteMsg] = useState(false);
  const [confirmDeleteReplyId, setConfirmDeleteReplyId] = useState<string | null>(null);

  const handleReply = async () => {
    if (!replyBody.trim()) return;
    setReplying(true);
    try {
      await onReply(`Re: ${msg.subject}`, replyBody.trim(), msg.globalProjectId, msg.id);
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
    <div>
      <Card className={`group ${isReply ? 'border-l-2 border-l-muted-foreground/20' : ''}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Author Avatar */}
            <div className={`flex shrink-0 items-center justify-center rounded-full bg-primary/10 overflow-hidden text-xs font-semibold text-primary ${isReply ? 'h-6 w-6' : 'h-8 w-8'}`}>
              {msg.authorAvatarUrl ? (
                <img src={msg.authorAvatarUrl} alt="" className={`rounded-full object-cover ${isReply ? 'h-6 w-6' : 'h-8 w-8'}`} />
              ) : (
                (msg.authorName?.[0] ?? '?').toUpperCase()
              )}
            </div>

            <div className="flex-1 min-w-0">
              {/* Header: author + time */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold truncate">
                  {msg.authorName || 'Unknown'}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                </span>
                {msg.projectName && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {msg.projectName}
                  </Badge>
                )}
              </div>

              {/* Subject */}
              <p className="text-sm font-medium mt-0.5">{msg.subject}</p>

              {/* Body */}
              {msg.body && (
                <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{msg.body}</p>
              )}

              {/* Action row */}
              <div className="flex items-center gap-2 mt-2">
                {/* Reply button (not on replies themselves) */}
                {!isReply && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                    onClick={() => setShowReplyForm(!showReplyForm)}
                  >
                    <Reply className="h-3 w-3" />
                    Reply
                  </Button>
                )}

                {/* Reply count toggle */}
                {!isReply && (msg.replyCount ?? 0) > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                    onClick={() => setShowReplies(!showReplies)}
                  >
                    {showReplies ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {msg.replyCount} {msg.replyCount === 1 ? 'reply' : 'replies'}
                  </Button>
                )}
              </div>
            </div>

            {/* Delete button (own messages only) */}
            {userId === msg.createdBy && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 max-sm:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                onClick={() => setConfirmDeleteMsg(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}

            <ConfirmDialog
              open={confirmDeleteMsg}
              onOpenChange={setConfirmDeleteMsg}
              title="Delete Message"
              description={`Are you sure you want to delete "${msg.subject}"? This action cannot be undone.`}
              confirmLabel="Delete"
              variant="destructive"
              onConfirm={() => onDelete(msg.id)}
            />
          </div>

          {/* Inline Reply Form */}
          {showReplyForm && (
            <div className="mt-3 ml-11 flex items-start gap-2">
              <textarea
                placeholder="Write a reply..."
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                rows={2}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
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

          {/* Replies (inside same card) */}
          {!isReply && showReplies && msg.replies && msg.replies.length > 0 && (
            <div className="mt-3 ml-11 space-y-3 border-t border-border pt-3">
              {msg.replies.map((reply) => (
                <div key={reply.id} className="flex items-start gap-2 group/reply">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 overflow-hidden text-[10px] font-semibold text-primary">
                    {reply.authorAvatarUrl ? (
                      <img src={reply.authorAvatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                    ) : (
                      (reply.authorName?.[0] ?? '?').toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold truncate">{reply.authorName || 'Unknown'}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{reply.body}</p>
                  </div>
                  {userId === reply.createdBy && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover/reply:opacity-100 max-sm:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      onClick={() => setConfirmDeleteReplyId(reply.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                  <ConfirmDialog
                    open={confirmDeleteReplyId === reply.id}
                    onOpenChange={(open) => { if (!open) setConfirmDeleteReplyId(null); }}
                    title="Delete Reply"
                    description="Are you sure you want to delete this reply? This action cannot be undone."
                    confirmLabel="Delete"
                    variant="destructive"
                    onConfirm={() => onDelete(reply.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
