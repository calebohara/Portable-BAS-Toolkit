'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { X, ChevronLeft, ChevronRight, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/app-store';
import { TOUR_STEPS } from './tour-steps';
import { cn } from '@/lib/utils';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function TourOverlay() {
  const router = useRouter();
  const pathname = usePathname();
  const tourActive = useAppStore((s) => s.tourActive);
  const tourStep = useAppStore((s) => s.tourStep);
  const endTour = useAppStore((s) => s.endTour);
  const nextTourStep = useAppStore((s) => s.nextTourStep);
  const prevTourStep = useAppStore((s) => s.prevTourStep);

  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [visible, setVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const navigatingRef = useRef(false);

  const step = TOUR_STEPS[tourStep];
  const isFirst = tourStep === 0;
  const isLast = tourStep === TOUR_STEPS.length - 1;

  // Find and highlight the target element
  const positionTooltip = useCallback(() => {
    if (!step || !tourActive) return;

    const el = document.querySelector(step.target);
    if (!el) {
      setTargetRect(null);
      setVisible(true);
      // Position tooltip in center of screen as fallback
      setTooltipPos({
        top: window.innerHeight / 2 - 100,
        left: Math.max(16, window.innerWidth / 2 - 160),
      });
      return;
    }

    const rect = el.getBoundingClientRect();
    const padding = 6;
    setTargetRect({
      top: rect.top - padding,
      left: rect.left - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    });

    // Calculate tooltip position based on placement
    const tooltipWidth = 320;
    const tooltipHeight = 180;
    const gap = 12;

    let top = 0;
    let left = 0;

    switch (step.placement) {
      case 'bottom':
        top = rect.bottom + gap;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
      case 'top':
        top = rect.top - tooltipHeight - gap;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
      case 'right':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.right + gap;
        break;
      case 'left':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.left - tooltipWidth - gap;
        break;
    }

    // Clamp to viewport
    left = Math.max(12, Math.min(left, window.innerWidth - tooltipWidth - 12));
    top = Math.max(12, Math.min(top, window.innerHeight - tooltipHeight - 12));

    setTooltipPos({ top, left });
    setVisible(true);
  }, [step, tourActive]);

  // Handle step actions (navigation, sidebar open)
  useEffect(() => {
    if (!tourActive || !step) return;

    setVisible(false);

    // Open sidebar if needed
    if (step.action === 'open-sidebar') {
      useAppStore.getState().setSidebarOpen(true);
    }

    // Navigate if needed
    if (step.route && pathname !== step.route) {
      navigatingRef.current = true;
      router.push(step.route);
      // Wait for navigation to complete
      const timer = setTimeout(() => {
        navigatingRef.current = false;
        positionTooltip();
      }, 400);
      return () => clearTimeout(timer);
    }

    // Small delay for DOM updates
    const timer = setTimeout(positionTooltip, 150);
    return () => clearTimeout(timer);
  }, [tourActive, tourStep, step, pathname, router, positionTooltip]);

  // Reposition on resize/scroll
  useEffect(() => {
    if (!tourActive) return;
    const handler = () => positionTooltip();
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [tourActive, positionTooltip]);

  // Keyboard navigation
  useEffect(() => {
    if (!tourActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endTour();
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (isLast) endTour();
        else nextTourStep();
      }
      if (e.key === 'ArrowLeft' && !isFirst) prevTourStep();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tourActive, isFirst, isLast, endTour, nextTourStep, prevTourStep]);

  if (!tourActive || !step) return null;

  return (
    <div className="fixed inset-0 z-[9999]" aria-live="polite">
      {/* Backdrop overlay with spotlight cutout */}
      <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: 'none' }}>
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left}
                y={targetRect.top}
                width={targetRect.width}
                height={targetRect.height}
                rx="8"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0" y="0" width="100%" height="100%"
          fill="rgba(0,0,0,0.55)"
          mask="url(#tour-mask)"
          style={{ pointerEvents: 'auto' }}
          onClick={endTour}
        />
      </svg>

      {/* Spotlight ring */}
      {targetRect && (
        <div
          className="absolute rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background transition-all duration-300"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className={cn(
          'absolute z-10 w-80 rounded-xl border border-border bg-popover p-4 shadow-xl transition-all duration-300',
          visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        )}
        style={{
          top: tooltipPos.top,
          left: tooltipPos.left,
          pointerEvents: 'auto',
        }}
      >
        {/* Close button */}
        <button
          onClick={endTour}
          className="absolute top-2 right-2 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
          aria-label="Close tour"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Content */}
        <div className="pr-6">
          <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{step.content}</p>
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {tourStep + 1} / {TOUR_STEPS.length}
          </span>

          <div className="flex items-center gap-1.5">
            {!isFirst && (
              <Button variant="ghost" size="sm" onClick={prevTourStep} className="h-7 px-2 text-xs gap-1">
                <ChevronLeft className="h-3 w-3" /> Back
              </Button>
            )}
            {isFirst && (
              <Button variant="ghost" size="sm" onClick={endTour} className="h-7 px-2 text-xs gap-1 text-muted-foreground">
                <SkipForward className="h-3 w-3" /> Skip
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => { if (isLast) endTour(); else nextTourStep(); }}
              className="h-7 px-3 text-xs gap-1"
            >
              {isLast ? 'Finish' : 'Next'}
              {!isLast && <ChevronRight className="h-3 w-3" />}
            </Button>
          </div>
        </div>

        {/* Progress dots */}
        <div className="mt-2 flex justify-center gap-1">
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1 rounded-full transition-all',
                i === tourStep ? 'w-4 bg-primary' : 'w-1 bg-muted-foreground/30'
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
