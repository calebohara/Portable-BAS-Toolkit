'use client';

import { useState, useEffect, useCallback } from 'react';
import { Star, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { APP_VERSION } from '@/lib/version';
import { getAllReviews, saveReview, deleteReview } from '@/lib/db';
import { useDeviceClass } from '@/hooks/use-device-class';
import { useAuth } from '@/providers/auth-provider';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import type { UserReview } from '@/types';

interface ReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

function StarRating({
  value,
  hoveredValue,
  onHover,
  onClick,
  disabled,
}: {
  value: number;
  hoveredValue: number;
  onHover: (v: number) => void;
  onClick: (v: number) => void;
  disabled: boolean;
}) {
  const display = hoveredValue || value;
  return (
    <div className="space-y-1.5">
      <Label>Rating</Label>
      <div className="flex items-center justify-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className="p-1 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
            onMouseEnter={() => onHover(star)}
            onMouseLeave={() => onHover(0)}
            onClick={() => onClick(star)}
            disabled={disabled}
            aria-label={`Rate ${star} star${star !== 1 ? 's' : ''}`}
          >
            <Star
              className={`h-8 w-8 transition-colors ${
                star <= display ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30'
              }`}
            />
          </button>
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground">{RATING_LABELS[display]}</p>
    </div>
  );
}

export function ReviewDialog({ open, onOpenChange }: ReviewDialogProps) {
  const [rating, setRating] = useState(5);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [existingReview, setExistingReview] = useState<UserReview | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const { deviceClass } = useDeviceClass();
  const { profile } = useAuth();

  // Load existing review when dialog opens
  useEffect(() => {
    if (!open) return;
    setLoadingExisting(true);
    getAllReviews()
      .then((reviews) => {
        // User's own review (first one — they should only have one)
        const mine = reviews.length > 0 ? reviews[0] : null;
        setExistingReview(mine);
        if (mine) {
          setRating(mine.rating);
          setComment(mine.comment);
          setIsEditing(false);
        } else {
          setRating(5);
          setComment('');
          setIsEditing(true); // New review — go straight to form
        }
      })
      .catch(() => {
        setExistingReview(null);
        setIsEditing(true);
      })
      .finally(() => setLoadingExisting(false));
  }, [open]);

  const resetForm = useCallback(() => {
    setRating(5);
    setHoveredRating(0);
    setComment('');
    setExistingReview(null);
    setIsEditing(false);
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    if (submitting) return;
    if (!next) resetForm();
    onOpenChange(next);
  }, [submitting, resetForm, onOpenChange]);

  const handleSubmit = useCallback(async () => {
    if (!comment.trim()) return;

    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      await saveReview({
        id: existingReview?.id || crypto.randomUUID(),
        rating,
        comment: comment.trim(),
        displayName: profile?.displayName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || 'Anonymous',
        appVersion: APP_VERSION,
        deviceClass,
        createdAt: existingReview?.createdAt || now,
        updatedAt: now,
      });
      toast.success(existingReview ? 'Review updated!' : 'Thank you for your review!');
      resetForm();
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to save review:', err);
      toast.error('Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  }, [rating, comment, profile, deviceClass, existingReview, resetForm, onOpenChange]);

  const handleDelete = useCallback(async () => {
    if (!existingReview) return;
    try {
      await deleteReview(existingReview.id);
      toast.success('Review deleted');
      resetForm();
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to delete review:', err);
      toast.error('Failed to delete review');
    }
  }, [existingReview, resetForm, onOpenChange]);

  // Show existing review (read-only view)
  if (open && existingReview && !isEditing && !loadingExisting) {
    return (
      <>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Star className="h-6 w-6 text-primary" />
              </div>
              <DialogTitle className="text-center">Your Review</DialogTitle>
            </DialogHeader>

            <DialogBody>
              <div className="space-y-4 px-5 py-4">
                <div className="flex items-center justify-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-7 w-7 ${
                        star <= existingReview.rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-center text-xs text-muted-foreground">{RATING_LABELS[existingReview.rating]}</p>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-sm whitespace-pre-wrap">{existingReview.comment}</p>
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  Submitted {new Date(existingReview.createdAt).toLocaleDateString()}
                  {existingReview.updatedAt !== existingReview.createdAt && ' (edited)'}
                </p>
              </div>
            </DialogBody>

            <DialogFooter>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive gap-1.5 mr-auto"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
              <Button onClick={() => setIsEditing(true)} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={showDeleteConfirm}
          onOpenChange={setShowDeleteConfirm}
          title="Delete Review"
          description="Are you sure you want to delete your review? This action cannot be undone."
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={handleDelete}
        />
      </>
    );
  }

  // Create / Edit form
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Star className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">
            {existingReview ? 'Edit Your Review' : 'Rate Your Experience'}
          </DialogTitle>
          <DialogDescription className="text-center">
            Share your feedback to help improve BAU Suite for the field.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-4 px-5 py-4">
            <StarRating
              value={rating}
              hoveredValue={hoveredRating}
              onHover={setHoveredRating}
              onClick={setRating}
              disabled={submitting}
            />

            <div className="space-y-1.5">
              <Label htmlFor="review-comment">Your Review</Label>
              <Textarea
                id="review-comment"
                placeholder="What do you like about BAU Suite? How could it be better?"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                disabled={submitting}
              />
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (existingReview) {
                setRating(existingReview.rating);
                setComment(existingReview.comment);
                setIsEditing(false);
              } else {
                handleOpenChange(false);
              }
            }}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !comment.trim()}
            className="gap-1.5"
          >
            <Star className="h-3.5 w-3.5" />
            {submitting ? 'Saving...' : existingReview ? 'Update Review' : 'Submit Review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
