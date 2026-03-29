'use client';

import { useState, useEffect, useCallback } from 'react';
import { Star, Trash2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getAllReviews, deleteReview } from '@/lib/db';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import type { UserReview } from '@/types';

export function ReviewsPanel() {
  const [reviews, setReviews] = useState<UserReview[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserReview | null>(null);
  const [loading, setLoading] = useState(true);

  const loadReviews = useCallback(async () => {
    try {
      const data = await getAllReviews();
      setReviews(data);
    } catch (err) {
      console.error('Failed to load reviews:', err);
      toast.error('Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteReview(deleteTarget.id);
      setReviews((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      if (expandedId === deleteTarget.id) setExpandedId(null);
      toast.success('Review deleted');
    } catch (err) {
      console.error('Failed to delete review:', err);
      toast.error('Failed to delete review');
    }
  }, [deleteTarget, expandedId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        Loading reviews...
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Star className="mb-2 h-8 w-8 opacity-40" />
        <p className="text-sm">No reviews yet</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Star className="h-4 w-4 text-primary" />
          User Reviews ({reviews.length})
        </h3>
        <span className="text-xs text-muted-foreground">
          Avg: {(reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)} / 5
        </span>
      </div>

      <div className="space-y-2">
        {reviews.map((review) => {
          const isExpanded = expandedId === review.id;
          return (
            <Card key={review.id} className="overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : review.id)}
                aria-expanded={isExpanded}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{review.displayName || 'Anonymous'}</span>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`h-3 w-3 ${
                            star <= review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground truncate max-w-[300px]">
                    {review.comment}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Date(review.createdAt).toLocaleDateString()}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                />
              </button>

              {isExpanded && (
                <div className="border-t border-border px-4 py-3 space-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Review</p>
                    <p className="text-sm whitespace-pre-wrap">{review.comment}</p>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Rating: {review.rating}/5</span>
                    {review.appVersion && <span>Version: v{review.appVersion}</span>}
                    {review.deviceClass && <span>Device: {review.deviceClass}</span>}
                    <span>Submitted: {new Date(review.createdAt).toLocaleString()}</span>
                    {review.updatedAt !== review.createdAt && (
                      <span>Edited: {new Date(review.updatedAt).toLocaleString()}</span>
                    )}
                  </div>

                  <div className="flex items-center pt-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive ml-auto"
                      onClick={() => setDeleteTarget(review)}
                      aria-label={`Delete review from ${review.displayName}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete Review"
        description={`Are you sure you want to delete the review from "${deleteTarget?.displayName || 'Anonymous'}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </>
  );
}
