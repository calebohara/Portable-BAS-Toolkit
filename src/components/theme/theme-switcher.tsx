'use client';

import { useRef, type KeyboardEvent } from 'react';
import { Monitor, Sun, Moon } from 'lucide-react';
import { useAppStore, type ThemeMode } from '@/store/app-store';
import { cn } from '@/lib/utils';

const options: { value: ThemeMode; icon: typeof Monitor; label: string }[] = [
  { value: 'system', icon: Monitor, label: 'System' },
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
];

export function ThemeSwitcher({ className }: { className?: string }) {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const key = e.key;
    if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown') {
      return;
    }
    e.preventDefault();
    const currentIndex = options.findIndex((o) => o.value === theme);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    const direction = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
    const nextIndex = (safeIndex + direction + options.length) % options.length;
    const nextOption = options[nextIndex];
    setTheme(nextOption.value);
    buttonRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border border-border bg-muted/50 p-0.5',
        className
      )}
      role="radiogroup"
      aria-label="Theme"
      data-tour="theme-switcher"
      onKeyDown={handleKeyDown}
    >
      {options.map(({ value, icon: Icon, label }, index) => (
        <button
          key={value}
          ref={(el) => {
            buttonRefs.current[index] = el;
          }}
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          tabIndex={theme === value ? 0 : -1}
          onClick={() => setTheme(value)}
          className={cn(
            'relative flex items-center gap-1.5 rounded-full px-2 py-1 sm:px-3 sm:py-1.5 text-xs font-medium transition-all duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
            theme === value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
