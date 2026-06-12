'use client';

import { useEffect, useRef } from 'react';

/**
 * Soft teal glow that trails the cursor behind the landing page content.
 *
 * - Pure radial gradient (no blur filter) moved with transform only, so
 *   animating it is compositor-only work — no repaints while it moves.
 * - Position, scale, and opacity ease toward their targets in a rAF loop
 *   that stops itself once settled and wakes on the next pointer event.
 * - Tightens over cards, buttons, and links so it reads as focusing on
 *   whatever the cursor is over. Page sections are positioned, so they
 *   paint above it: opaque cards occlude it, text floats over it.
 * - Mouse pointers only; no-op for prefers-reduced-motion (also hidden
 *   in CSS as a fallback).
 */
export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    let running = false;
    let hasMoved = false;
    let last = 0;
    let x = 0, y = 0, scale = 1, opacity = 0;
    let tx = 0, ty = 0, tScale = 1, tOpacity = 0;

    const tick = (now: number) => {
      // Time-based exponential easing so the trail feels identical on 60Hz
      // and 144Hz displays (a fixed per-frame factor would not).
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const kPos = 1 - Math.exp(-7 * dt);
      const kSoft = 1 - Math.exp(-5 * dt);
      x += (tx - x) * kPos;
      y += (ty - y) * kPos;
      scale += (tScale - scale) * kSoft;
      opacity += (tOpacity - opacity) * kSoft;
      el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${scale})`;
      el.style.opacity = opacity.toFixed(3);
      const settled =
        Math.abs(tx - x) < 0.3 && Math.abs(ty - y) < 0.3 &&
        Math.abs(tScale - scale) < 0.003 && Math.abs(tOpacity - opacity) < 0.003;
      if (settled) { running = false; return; }
      raf = requestAnimationFrame(tick);
    };

    const wake = () => {
      if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      tx = e.clientX;
      ty = e.clientY;
      tOpacity = 1;
      // Snap (while still invisible) on the first event so the glow doesn't
      // glide in from a corner it was never at.
      if (!hasMoved) { hasMoved = true; x = tx; y = ty; }
      const over = (e.target as Element | null)?.closest?.('a, button, .hp-card-surface, .hp-hero-card');
      tScale = over ? 0.6 : 1;
      wake();
    };

    const onLeave = () => { tOpacity = 0; wake(); };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return <div ref={ref} className="hp-cursor-glow" aria-hidden="true" />;
}
