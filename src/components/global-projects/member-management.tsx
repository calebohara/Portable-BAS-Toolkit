'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Copy, Check, RefreshCw, Shield, Trash2, LogOut, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { copyToClipboard } from '@/lib/utils';
import { toast } from 'sonner';
import type { GlobalProjectMember, GlobalProjectRole } from '@/types/global-projects';

interface MemberManagementProps {
  projectId: string;
  members: GlobalProjectMember[];
  currentUserId: string;
  userRole: GlobalProjectRole;
  onRemove: (userId: string) => Promise<void>;
  onPromote: (userId: string) => Promise<void>;
  onRegenerate: () => Promise<string>;
  onLeave: () => Promise<void>;
  accessCode: string;
}

export function MemberManagement({
  projectId,
  members,
  currentUserId,
  userRole,
  onRemove,
  onPromote,
  onRegenerate,
  onLeave,
  accessCode,
}: MemberManagementProps) {
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [currentAccessCode, setCurrentAccessCode] = useState(accessCode);
  const [removeTarget, setRemoveTarget] = useState<GlobalProjectMember | null>(null);
  const [promoteTarget, setPromoteTarget] = useState<GlobalProjectMember | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const isAdmin = userRole === 'admin';

  const handleCopyCode = async () => {
    try {
      await copyToClipboard(currentAccessCode);
      setCopied(true);
      toast.success('Access code copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const newCode = await onRegenerate();
      setCurrentAccessCode(newCode);
      toast.success('Access code regenerated');
    } catch {
      toast.error('Failed to regenerate code');
    } finally {
      setRegenerating(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    try {
      await onRemove(removeTarget.userId);
      toast.success(`Removed ${removeTarget.displayName || removeTarget.email}`);
      setRemoveTarget(null);
    } catch {
      toast.error('Failed to remove member');
    }
  };

  const handlePromote = async () => {
    if (!promoteTarget) return;
    try {
      await onPromote(promoteTarget.userId);
      toast.success(`Promoted ${promoteTarget.displayName || promoteTarget.email} to admin`);
      setPromoteTarget(null);
    } catch {
      toast.error('Failed to promote member');
    }
  };

  const handleLeave = async () => {
    try {
      await onLeave();
      toast.success('Left the project');
    } catch {
      toast.error('Failed to leave project');
    }
  };

  const getInitials = (member: GlobalProjectMember) => {
    if (member.displayName) {
      return member.displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return member.email.slice(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-6">
      {/* Access Code Section */}
      {isAdmin && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Access Code</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Share this code with team members so they can join the project.
            </p>
            <div className="flex items-center gap-2">
              <code className="rounded-lg bg-muted px-4 py-2 text-lg font-mono font-bold tracking-widest">
                {currentAccessCode}
              </code>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopyCode}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleRegenerate}
                disabled={regenerating}
              >
                <RefreshCw className={`h-4 w-4 ${regenerating ? 'animate-spin' : ''}`} />
                Regenerate
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Members List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" />
              Members ({members.length})
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {members.map((member) => {
              const isCurrentUser = member.userId === currentUserId;
              const isMemberRole = member.role === 'member';
              return (
                <div
                  key={member.id}
                  className="flex items-center gap-3 rounded-lg border border-border p-3"
                >
                  {/* Avatar */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold overflow-hidden">
                    {member.avatarUrl ? (
                      <img src={member.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      getInitials(member)
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {member.displayName || member.email}
                        {isCurrentUser && <span className="text-muted-foreground"> (you)</span>}
                      </p>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] shrink-0 ${
                          member.role === 'admin'
                            ? 'bg-primary/10 text-primary'
                            : ''
                        }`}
                      >
                        {member.role === 'admin' ? 'Admin' : 'Member'}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {member.email}
                      {member.joinedAt && (
                        <span> &middot; Joined {format(new Date(member.joinedAt), 'MMM d, yyyy')}</span>
                      )}
                    </p>
                  </div>

                  {/* Admin Actions */}
                  {isAdmin && !isCurrentUser && (
                    <div className="flex items-center gap-1 shrink-0">
                      {isMemberRole && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() => setPromoteTarget(member)}
                          title="Promote to Admin"
                        >
                          <Shield className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Promote</span>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                        onClick={() => setRemoveTarget(member)}
                        title="Remove member"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Remove</span>
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Leave Project */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Leave Project</p>
              <p className="text-xs text-muted-foreground">
                You will lose access to this project and its data.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/50"
              onClick={() => setShowLeaveConfirm(true)}
            >
              <LogOut className="h-4 w-4" />
              Leave
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Confirm Dialogs */}
      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}
        title="Remove Member"
        description={removeTarget ? `Remove "${removeTarget.displayName || removeTarget.email}" from this project? They will lose access to all project data.` : ''}
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleRemove}
      />

      <ConfirmDialog
        open={promoteTarget !== null}
        onOpenChange={(open) => { if (!open) setPromoteTarget(null); }}
        title="Promote to Admin"
        description={promoteTarget ? `Promote "${promoteTarget.displayName || promoteTarget.email}" to admin? They will be able to manage members and project settings.` : ''}
        confirmLabel="Promote"
        onConfirm={handlePromote}
      />

      <ConfirmDialog
        open={showLeaveConfirm}
        onOpenChange={setShowLeaveConfirm}
        title="Leave Project"
        description="Are you sure you want to leave this project? You will lose access to all project data. You can rejoin later with the access code."
        confirmLabel="Leave Project"
        variant="destructive"
        onConfirm={handleLeave}
      />
    </div>
  );
}
