'use client';

import { useMemo, useState, useCallback } from 'react';
import {
  PlayCircle, Search, ChevronDown, X, SearchX,
  type LucideIcon,
} from 'lucide-react';
import { TopBar } from '@/components/layout/top-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/store/app-store';
import { APP_VERSION } from '@/lib/version';
import { cn } from '@/lib/utils';
import {
  helpCategories,
  gettingStartedSteps,
  featureGuides,
  faqItems,
  troubleshootingItems,
  shortcutGroups,
  type CategoryId,
  type FeatureGuide,
  type QaItem,
} from './help-content';

// ─── Search helpers ──────────────────────────────────────────────────────────────

function normalize(s: string) {
  return s.toLowerCase();
}

function guideMatches(guide: FeatureGuide, q: string) {
  if (!q) return true;
  const hay = normalize(
    guide.title + ' ' + guide.summary + ' ' + guide.items.join(' '),
  );
  return hay.includes(q);
}

function qaMatches(item: QaItem, q: string) {
  if (!q) return true;
  return normalize(item.q + ' ' + item.a).includes(q);
}

// ─── Page ─────────────────────────────────────────────────────────────────────────

export default function HelpPage() {
  const startTour = useAppStore((s) => s.startTour);
  const [rawQuery, setRawQuery] = useState('');
  const query = normalize(rawQuery.trim());
  const searching = query.length > 0;

  const filteredGuides = useMemo(
    () => featureGuides.filter((g) => guideMatches(g, query)),
    [query],
  );
  const filteredFaq = useMemo(
    () => faqItems.filter((i) => qaMatches(i, query)),
    [query],
  );
  const filteredTrouble = useMemo(
    () => troubleshootingItems.filter((i) => qaMatches(i, query)),
    [query],
  );

  // Getting Started matches if the query hits any step title/description.
  const gettingStartedVisible = useMemo(() => {
    if (!searching) return true;
    return gettingStartedSteps.some((s) =>
      normalize(s.title + ' ' + s.description).includes(query),
    );
  }, [query, searching]);

  const shortcutsVisible = useMemo(() => {
    if (!searching) return true;
    return (
      'keyboard shortcuts'.includes(query) ||
      shortcutGroups.some((g) =>
        g.shortcuts.some((s) =>
          normalize(g.scope + ' ' + s.action + ' ' + s.keys.join(' ')).includes(query),
        ),
      )
    );
  }, [query, searching]);

  // Which categories have any visible content under the current search?
  const guidesByCategory = useMemo(() => {
    const map = new Map<CategoryId, FeatureGuide[]>();
    for (const g of filteredGuides) {
      const arr = map.get(g.category) ?? [];
      arr.push(g);
      map.set(g.category, arr);
    }
    return map;
  }, [filteredGuides]);

  const visibleCategoryIds = useMemo(() => {
    const ids = new Set<CategoryId>();
    if (gettingStartedVisible) ids.add('getting-started');
    for (const id of guidesByCategory.keys()) ids.add(id);
    if (filteredFaq.length || filteredTrouble.length || shortcutsVisible) ids.add('faq');
    return ids;
  }, [gettingStartedVisible, guidesByCategory, filteredFaq, filteredTrouble, shortcutsVisible]);

  const totalResults =
    filteredGuides.length +
    filteredFaq.length +
    filteredTrouble.length +
    (gettingStartedVisible ? 1 : 0);

  const noResults = searching && totalResults === 0 && !shortcutsVisible;

  const jumpTo = useCallback((id: CategoryId) => {
    const el = document.getElementById(`help-cat-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <>
      <TopBar title="Help & Guides" />

      <div className="mx-auto w-full max-w-7xl p-4 md:p-6 lg:p-8">
        {/* ── Hero header ───────────────────────────────────────────── */}
        <header className="rounded-xl border border-border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight">Help Center</h1>
              <p className="text-sm text-muted-foreground">
                Guides, tips, and troubleshooting for every BAU Suite tool — searchable and offline-ready.
              </p>
            </div>
            <Button onClick={startTour} className="gap-1.5 self-start shrink-0">
              <PlayCircle className="h-4 w-4" />
              Replay Tour
            </Button>
          </div>

          {/* Search box */}
          <div className="relative mt-5 max-w-xl">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <label htmlFor="help-search" className="sr-only">
              Search help articles
            </label>
            <Input
              id="help-search"
              size="lg"
              type="search"
              role="searchbox"
              value={rawQuery}
              onChange={(e) => setRawQuery(e.target.value)}
              placeholder="Search guides, FAQs, and troubleshooting…"
              className="bg-background pl-9 pr-9"
            />
            {rawQuery && (
              <button
                type="button"
                onClick={() => setRawQuery('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {searching && !noResults && (
            <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
              {totalResults} matching {totalResults === 1 ? 'result' : 'results'}
            </p>
          )}
        </header>

        {/* ── Body: nav rail + content ──────────────────────────────── */}
        <div className="mt-6 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
          {/* Category nav — sticky rail on desktop, scroll chips on mobile */}
          <nav aria-label="Help categories" className="mb-5 lg:mb-0">
            <div className="lg:sticky lg:top-20">
              <p className="mb-2 hidden px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:block">
                Categories
              </p>
              {/* Mobile: horizontal scroll chips */}
              <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
                {helpCategories.map((c) => {
                  const enabled = visibleCategoryIds.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={!enabled}
                      onClick={() => jumpTo(c.id)}
                      className={cn(
                        'flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
                        enabled
                          ? 'hover:bg-accent text-foreground'
                          : 'opacity-40 cursor-not-allowed',
                      )}
                    >
                      <c.icon className="h-3.5 w-3.5" />
                      {c.label}
                    </button>
                  );
                })}
              </div>
              {/* Desktop: vertical rail */}
              <ul className="hidden space-y-0.5 lg:block">
                {helpCategories.map((c) => {
                  const enabled = visibleCategoryIds.has(c.id);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        disabled={!enabled}
                        onClick={() => jumpTo(c.id)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                          enabled
                            ? 'text-muted-foreground hover:bg-accent hover:text-foreground'
                            : 'opacity-40 cursor-not-allowed',
                        )}
                      >
                        <c.icon className="h-4 w-4 shrink-0" />
                        <span className="leading-tight">{c.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </nav>

          {/* Content column */}
          <div className="min-w-0 space-y-10">
            {noResults && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
                <SearchX className="h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">No results for “{rawQuery}”</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Try a different keyword, or clear the search to browse all topics.
                </p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setRawQuery('')}>
                  Clear search
                </Button>
              </div>
            )}

            {/* Getting Started */}
            {gettingStartedVisible && (
              <CategorySection id="getting-started" title="Getting Started"
                blurb="Follow these steps to set up your first project.">
                <ol className="grid gap-4 sm:grid-cols-2">
                  {gettingStartedSteps.map(({ icon: Icon, title, description }, i) => (
                    <li
                      key={title}
                      className="flex gap-3 rounded-lg border border-border bg-card p-4"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <h3 className="text-sm font-semibold">{title}</h3>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {description}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CategorySection>
            )}

            {/* Feature-guide categories */}
            {helpCategories
              .filter((c) => c.id !== 'getting-started' && c.id !== 'faq')
              .map((cat) => {
                const guides = guidesByCategory.get(cat.id) ?? [];
                if (!guides.length) return null;
                return (
                  <CategorySection key={cat.id} id={cat.id} title={cat.label} blurb={cat.blurb}>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {guides.map((g) => (
                        <GuideCard key={g.title} guide={g} defaultOpen={searching} />
                      ))}
                    </div>
                  </CategorySection>
                );
              })}

            {/* FAQ / Troubleshooting / Shortcuts */}
            {(filteredFaq.length > 0 || filteredTrouble.length > 0 || shortcutsVisible) && (
              <CategorySection
                id="faq"
                title="FAQ, Troubleshooting & Shortcuts"
                blurb="Answers, fixes, and keyboard shortcuts."
              >
                <div className="space-y-6">
                  {filteredFaq.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold">Frequently Asked Questions</h3>
                      <div className="grid gap-2 lg:grid-cols-2">
                        {filteredFaq.map((item) => (
                          <Accordion key={item.q} title={item.q} defaultOpen={searching}>
                            {item.a}
                          </Accordion>
                        ))}
                      </div>
                    </div>
                  )}

                  {filteredTrouble.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold">Troubleshooting</h3>
                      <div className="grid gap-2 lg:grid-cols-2">
                        {filteredTrouble.map((item) => (
                          <Accordion key={item.q} title={item.q} defaultOpen={searching}>
                            {item.a}
                          </Accordion>
                        ))}
                      </div>
                    </div>
                  )}

                  {shortcutsVisible && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold">Keyboard Shortcuts</h3>
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {shortcutGroups.map((group) => (
                          <div
                            key={group.scope}
                            className="rounded-lg border border-border bg-card p-4"
                          >
                            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {group.scope}
                            </p>
                            <ul className="space-y-2">
                              {group.shortcuts.map((s) => (
                                <li
                                  key={s.action}
                                  className="flex items-center justify-between gap-3 text-sm"
                                >
                                  <span className="text-muted-foreground">{s.action}</span>
                                  <span className="flex shrink-0 gap-1">
                                    {s.keys.map((key) => (
                                      <kbd
                                        key={key}
                                        className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                                      >
                                        {key}
                                      </kbd>
                                    ))}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CategorySection>
            )}
          </div>
        </div>

        {/* Version footer */}
        <p className="mt-12 text-center text-xs text-muted-foreground/50">
          BAU Suite v{APP_VERSION}
        </p>
      </div>
    </>
  );
}

// ─── Category section wrapper ─────────────────────────────────────────────────────

function CategorySection({
  id,
  title,
  blurb,
  children,
}: {
  id: CategoryId;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section id={`help-cat-${id}`} aria-labelledby={`help-cat-${id}-h`} className="scroll-mt-20">
      <div className="mb-4">
        <h2 id={`help-cat-${id}-h`} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{blurb}</p>
      </div>
      {children}
    </section>
  );
}

// ─── Feature guide card ───────────────────────────────────────────────────────────

function GuideCard({ guide, defaultOpen }: { guide: FeatureGuide; defaultOpen: boolean }) {
  const Icon = guide.icon as LucideIcon;
  const [open, setOpen] = useState(defaultOpen);
  const detailsId = `guide-${guide.title.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card transition-colors hover:border-primary/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={detailsId}
        className="flex items-start gap-3 p-4 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-tight">{guide.title}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            {guide.summary}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>
      {open && (
        <ul id={detailsId} className="space-y-1.5 border-t border-border px-4 py-3.5 pl-7">
          {guide.items.map((item, i) => (
            <li key={i} className="list-disc text-xs leading-relaxed text-muted-foreground marker:text-primary/50">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Accordion (FAQ / troubleshooting) ────────────────────────────────────────────

function Accordion({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = `acc-${title.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="h-fit rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-accent/50"
      >
        <span className="flex-1">{title}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>
      {open && (
        <p id={bodyId} className="px-3 pb-3 text-xs leading-relaxed text-muted-foreground">
          {children}
        </p>
      )}
    </div>
  );
}
