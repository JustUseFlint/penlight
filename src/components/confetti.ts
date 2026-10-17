'use client';
import confetti from 'canvas-confetti';

/** Subtle celebratory burst; skipped when the user prefers reduced motion. */
export function fireConfetti(scale = 1) {
  if (typeof window === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#16A394', '#FFB020', '#FF5459', '#8B5CF6', '#0EA5E9'];
  confetti({ particleCount: Math.round(70 * scale), spread: 70, startVelocity: 38, origin: { y: 0.65 }, colors, ticks: 160, scalar: 0.95 });
  setTimeout(() => confetti({ particleCount: Math.round(40 * scale), spread: 100, startVelocity: 28, origin: { y: 0.7, x: 0.3 }, colors, ticks: 140 }), 180);
  setTimeout(() => confetti({ particleCount: Math.round(40 * scale), spread: 100, startVelocity: 28, origin: { y: 0.7, x: 0.7 }, colors, ticks: 140 }), 300);
}
