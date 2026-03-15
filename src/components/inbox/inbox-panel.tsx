'use client';

import { useState } from 'react';
import { useInbox, type DirectMessage, type InboxContact } from '@/hooks/use-inbox';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Inbox, Send, PenSquare, ArrowLeft, Trash2, Mail,
  Clock, Eraser,
} from 'lucide-react';

// ─── Helper: relative time ──────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ─── Avatar ─────────────────────────────────────────────────────────────────

function Avatar({ name, url, size = 'md' }: { name: string; url: string | null; size?: 'sm' | 'md' }) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const sizeClass = size === 'md' ? 'h-9 w-9 text-xs' : 'h-7 w-7 text-[10px]';

  if (url) {
    return <img src={url} alt={name} className={cn('rounded-full object-cover shrink-0', sizeClass)} />;
  }

  return (
    <div className={cn('rounded-full bg-primary/15 text-primary font-semibold flex items-center justify-center shrink-0', sizeClass)}>
      {initials}
    </div>
  );
}

// ─── Message List Item ──────────────────────────────────────────────────────

function MessageRow({
  message,
  type,
  onSelect,
  onDelete,
}: {
  message: DirectMessage;
  type: 'inbox' | 'sent';
  onSelect: () => void;
  onDelete: () => void;
}) {
  const isUnread = type === 'inbox' && !message.readAt;

  return (
    <div
      className={cn(
        'group flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-border/50 hover:bg-muted/50',
        isUnread && 'bg-primary/[0.03]',
      )}
      onClick={onSelect}
    >
      <div className="relative mt-0.5">
        <Avatar name={message.senderName} url={message.senderAvatar} />
        {isUnread && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('text-sm truncate', isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground/80')}>
            {message.senderName}
          </span>
          <span className="ml-auto text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
            {timeAgo(message.createdAt)}
          </span>
        </div>
        <p className={cn('text-sm truncate', isUnread ? 'font-medium text-foreground/90' : 'text-muted-foreground')}>
          {message.subject || '(No subject)'}
        </p>
        <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
          {message.body.slice(0, 80)}
        </p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="opacity-0 group-hover:opacity-100 max-sm:opacity-100 transition-opacity mt-1 p-1 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
        aria-label="Delete message"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Message Detail View ────────────────────────────────────────────────────

function MessageDetail({
  message,
  type,
  onBack,
  onReply,
  onDelete,
}: {
  message: DirectMessage;
  type: 'inbox' | 'sent';
  onBack: () => void;
  onReply: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium truncate flex-1">
          {message.subject || '(No subject)'}
        </span>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Avatar name={message.senderName} url={message.senderAvatar} />
          <div>
            <p className="text-sm font-semibold text-foreground">{message.senderName}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(message.createdAt).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
          {message.body}
        </div>
      </div>
      {type === 'inbox' && (
        <div className="p-4 border-t border-border">
          <Button size="sm" className="w-full gap-2" onClick={onReply}>
            <Send className="h-3.5 w-3.5" />
            Reply
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Compose View ───────────────────────────────────────────────────────────

function ComposeView({
  contacts,
  onSend,
  onCancel,
  prefillRecipient,
  prefillSubject,
}: {
  contacts: InboxContact[];
  onSend: (recipientId: string, subject: string, body: string) => Promise<{ error: string | null }>;
  onCancel: () => void;
  prefillRecipient?: string;
  prefillSubject?: string;
}) {
  const [recipientId, setRecipientId] = useState(prefillRecipient || '');
  const [subject, setSubject] = useState(prefillSubject || '');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    if (!recipientId || !body.trim()) return;
    setSending(true);
    setError(null);
    const result = await onSend(recipientId, subject, body);
    setSending(false);
    if (result.error) {
      setError(result.error);
    } else {
      onCancel(); // Close compose on success
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold">New Message</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">To</label>
          <select
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Select recipient...</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName} {c.email ? `(${c.email})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject..."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message..."
            rows={8}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </div>
      <div className="p-4 border-t border-border">
        <Button
          size="sm"
          className="w-full gap-2"
          onClick={handleSend}
          disabled={sending || !recipientId || !body.trim()}
        >
          <Send className="h-3.5 w-3.5" />
          {sending ? 'Sending...' : 'Send Message'}
        </Button>
      </div>
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────────────────────────

function EmptyState({ type }: { type: 'inbox' | 'sent' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
        {type === 'inbox' ? <Inbox className="h-6 w-6 text-muted-foreground" /> : <Send className="h-6 w-6 text-muted-foreground" />}
      </div>
      <p className="text-sm font-medium text-foreground/80">
        {type === 'inbox' ? 'No messages yet' : 'No sent messages'}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        {type === 'inbox' ? 'Messages from other users will appear here' : 'Messages you send will appear here'}
      </p>
    </div>
  );
}

// ─── Main Inbox Panel ───────────────────────────────────────────────────────

export function InboxPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const {
    messages, sentMessages, contacts, unreadCount,
    markAsRead, deleteMessage, sendMessage, purgeInbox, purgeSent, loading,
  } = useInbox();

  const [tab, setTab] = useState<'inbox' | 'sent'>('inbox');
  const [selectedMessage, setSelectedMessage] = useState<DirectMessage | null>(null);
  const [selectedType, setSelectedType] = useState<'inbox' | 'sent'>('inbox');
  const [composing, setComposing] = useState(false);
  const [replyTo, setReplyTo] = useState<{ recipientId: string; subject: string } | null>(null);
  const [confirmPurge, setConfirmPurge] = useState(false);

  const handleSelect = async (msg: DirectMessage, type: 'inbox' | 'sent') => {
    setSelectedMessage(msg);
    setSelectedType(type);
    if (type === 'inbox' && !msg.readAt) {
      await markAsRead(msg.id);
    }
  };

  const handleReply = () => {
    if (!selectedMessage) return;
    setReplyTo({
      recipientId: selectedMessage.senderId,
      subject: selectedMessage.subject.startsWith('Re: ') ? selectedMessage.subject : `Re: ${selectedMessage.subject}`,
    });
    setSelectedMessage(null);
    setComposing(true);
  };

  const handleCompose = () => {
    setReplyTo(null);
    setSelectedMessage(null);
    setComposing(true);
  };

  const handleComposeCancel = () => {
    setComposing(false);
    setReplyTo(null);
  };

  const handleBack = () => {
    setSelectedMessage(null);
  };

  const currentMessages = tab === 'inbox' ? messages : sentMessages;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col" showCloseButton={false}>
        <SheetHeader className="sr-only">
          <SheetTitle>Inbox</SheetTitle>
          <SheetDescription>Your direct messages</SheetDescription>
        </SheetHeader>

        {/* Detail View */}
        {selectedMessage && !composing && (
          <MessageDetail
            message={selectedMessage}
            type={selectedType}
            onBack={handleBack}
            onReply={handleReply}
            onDelete={() => {
              deleteMessage(selectedMessage.id, selectedType);
              setSelectedMessage(null);
            }}
          />
        )}

        {/* Compose View */}
        {composing && (
          <ComposeView
            contacts={contacts}
            onSend={sendMessage}
            onCancel={handleComposeCancel}
            prefillRecipient={replyTo?.recipientId}
            prefillSubject={replyTo?.subject}
          />
        )}

        {/* List View */}
        {!selectedMessage && !composing && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Mail className="h-4.5 w-4.5 text-primary" />
                <h2 className="text-base font-semibold">Inbox</h2>
                {unreadCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {currentMessages.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn('h-8 p-0 text-muted-foreground', confirmPurge ? 'w-auto px-2 text-destructive hover:text-destructive hover:bg-destructive/10' : 'w-8')}
                    onClick={() => {
                      if (confirmPurge) {
                        if (tab === 'inbox') purgeInbox();
                        else purgeSent();
                        setConfirmPurge(false);
                      } else {
                        setConfirmPurge(true);
                        setTimeout(() => setConfirmPurge(false), 3000);
                      }
                    }}
                    aria-label={confirmPurge ? 'Confirm purge' : 'Purge all'}
                  >
                    {confirmPurge ? (
                      <span className="text-[11px] font-medium">Clear all?</span>
                    ) : (
                      <Eraser className="h-4 w-4" />
                    )}
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleCompose} aria-label="Compose">
                  <PenSquare className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onOpenChange(false)} aria-label="Close">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border">
              <button
                onClick={() => setTab('inbox')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2',
                  tab === 'inbox'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Inbox className="h-3.5 w-3.5" />
                Inbox
                {unreadCount > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 text-[9px] font-bold text-primary">
                    {unreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setTab('sent')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2',
                  tab === 'sent'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Send className="h-3.5 w-3.5" />
                Sent
              </button>
            </div>

            {/* Message List */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : currentMessages.length === 0 ? (
                <EmptyState type={tab} />
              ) : (
                currentMessages.map((msg) => (
                  <MessageRow
                    key={msg.id}
                    message={msg}
                    type={tab}
                    onSelect={() => handleSelect(msg, tab)}
                    onDelete={() => deleteMessage(msg.id, tab)}
                  />
                ))
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
