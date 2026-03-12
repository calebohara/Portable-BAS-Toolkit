'use client';

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  Search, Plus, Pin, StickyNote, Trash2, Edit2, X, Check,
} from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { NOTE_CATEGORY_LABELS, type FieldNote, type NoteCategory } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  projectId: string;
  notes: FieldNote[];
  onAddNote: (data: Omit<FieldNote, 'id' | 'createdAt' | 'updatedAt'>) => Promise<FieldNote>;
  onUpdateNote: (note: FieldNote) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
}

export function FieldNotesView({ projectId, notes, onAddNote, onUpdateNote, onDeleteNote }: Props) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<NoteCategory | 'all'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteCategory, setNewNoteCategory] = useState<NoteCategory>('general');
  const [newNoteTags, setNewNoteTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<FieldNote | null>(null);

  const filtered = useMemo(() => {
    let result = [...notes];
    if (categoryFilter !== 'all') {
      result = result.filter((n) => n.category === categoryFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((n) =>
        n.content.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q)) ||
        n.author.toLowerCase().includes(q)
      );
    }
    // Pinned first, then by date
    result.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
    return result;
  }, [notes, search, categoryFilter]);

  const handleAddNote = async () => {
    if (!newNoteContent.trim()) return;
    setSaving(true);
    try {
      await onAddNote({
        projectId,
        content: newNoteContent.trim(),
        category: newNoteCategory,
        author: 'Field Tech',
        isPinned: false,
        tags: newNoteTags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      setNewNoteContent('');
      setNewNoteTags('');
      setShowAddForm(false);
      toast.success('Note added');
    } catch {
      toast.error('Failed to add note');
    } finally {
      setSaving(false);
    }
  };

  const togglePin = async (note: FieldNote) => {
    try {
      await onUpdateNote({ ...note, isPinned: !note.isPinned });
      toast.success(note.isPinned ? 'Note unpinned' : 'Note pinned');
    } catch {
      toast.error('Failed to update note');
    }
  };

  const handleStartEdit = (note: FieldNote) => {
    setEditingId(note.id);
    setEditContent(note.content);
  };

  const handleSaveEdit = async (note: FieldNote) => {
    if (!editContent.trim()) return;
    try {
      await onUpdateNote({ ...note, content: editContent.trim() });
      setEditingId(null);
      toast.success('Note updated');
    } catch {
      toast.error('Failed to update note');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await onDeleteNote(deleteTarget.id);
      toast.success('Note deleted');
    } catch {
      toast.error('Failed to delete note');
    }
    setDeleteTarget(null);
  };

  const categoryColors: Record<NoteCategory, string> = {
    general: 'bg-muted text-muted-foreground',
    issue: 'bg-field-danger/10 text-field-danger',
    fix: 'bg-field-success/10 text-field-success',
    'punch-item': 'bg-field-warning/10 text-field-warning',
    'startup-note': 'bg-primary/10 text-primary',
    'network-change': 'bg-field-info/10 text-field-info',
    'customer-request': 'bg-primary/10 text-primary',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Field Notes</h2>
        <Button size="sm" className="gap-1.5" onClick={() => setShowAddForm(true)}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add Note</span>
        </Button>
      </div>

      {/* Add Note Form */}
      {showAddForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">New Field Note</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Textarea
              placeholder="Enter your field note..."
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              rows={3}
              autoFocus
            />
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Category</label>
                <Select value={newNoteCategory} onValueChange={(v) => setNewNoteCategory(v as NoteCategory)}>
                  <SelectTrigger className="w-40 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(NOTE_CATEGORY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-1 min-w-32">
                <label className="text-xs text-muted-foreground">Tags (comma separated)</label>
                <Input
                  placeholder="e.g. ahu-1, wiring"
                  value={newNoteTags}
                  onChange={(e) => setNewNoteTags(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <Button size="sm" onClick={handleAddNote} disabled={saving || !newNoteContent.trim()}>
                {saving ? 'Saving...' : 'Save Note'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setCategoryFilter('all')}
            className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors',
              categoryFilter === 'all' ? 'bg-primary/10 text-primary border-primary/20' : 'border-border text-muted-foreground hover:text-foreground'
            )}
          >
            All
          </button>
          {Object.entries(NOTE_CATEGORY_LABELS).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setCategoryFilter(value as NoteCategory)}
              className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors',
                categoryFilter === value ? 'bg-primary/10 text-primary border-primary/20' : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title={search ? 'No matching notes' : 'No field notes yet'}
          description={search ? 'Try a different search term.' : 'Add your first field note to start documenting.'}
          action={!search ? (
            <Button size="sm" onClick={() => setShowAddForm(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Note
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((note) => (
            <Card key={note.id} className={cn(note.isPinned && 'border-primary/20 bg-primary/[0.02]')}>
              <CardContent className="p-3">
                <div className="mb-1.5 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    {note.isPinned && <Pin className="h-3 w-3 text-primary" />}
                    <Badge variant="secondary" className={cn('text-[10px]', categoryColors[note.category])}>
                      {NOTE_CATEGORY_LABELS[note.category]}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {note.author} — {format(new Date(note.createdAt), 'MMM d, h:mm a')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => handleStartEdit(note)}
                      title="Edit"
                      aria-label="Edit"
                    >
                      <Edit2 className="h-3 w-3 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => togglePin(note)}
                      title={note.isPinned ? 'Unpin' : 'Pin'}
                      aria-label={note.isPinned ? 'Unpin' : 'Pin'}
                    >
                      <Pin className={cn('h-3 w-3', note.isPinned ? 'text-primary' : 'text-muted-foreground')} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(note)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {editingId === note.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => handleSaveEdit(note)} disabled={!editContent.trim()} className="gap-1">
                        <Check className="h-3 w-3" /> Save
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                )}
                {note.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {note.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete Note"
        description="This field note will be permanently deleted. This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
