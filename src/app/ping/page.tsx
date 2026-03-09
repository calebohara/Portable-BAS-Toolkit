'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import {
  Activity, Play, Square, Plus, Trash2, Download, Info,
  CheckCircle2, XCircle, Loader2, AlertTriangle, Clock,
  ChevronDown, ChevronUp, X,
} from 'lucide-react';
import { TopBar } from '@/components/layout/top-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@/components/ui/select';
import { cn, sanitizeFilename } from '@/lib/utils';
import { toast } from 'sonner';
import { useProjects, usePingSessions } from '@/hooks/use-projects';
import type { PingTarget, PingResultEntry, PingSession, PingStatus } from '@/types';
import { v4 as uuid } from 'uuid';

// ─── HTTP reachability check ────────────────────────────────
// Browsers cannot send ICMP. We use fetch() to test TCP/HTTP reachability.
// This is a legitimate reachability test, NOT a fake ping.
async function checkReachability(host: string, port?: number): Promise<PingResultEntry> {
  const start = performance.now();
  const target = port
    ? `http://${host}:${port}`
    : `http://${host}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    await fetch(target, {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeout);
    const elapsed = Math.round(performance.now() - start);

    return {
      timestamp: new Date().toISOString(),
      status: 'reachable',
      responseTimeMs: elapsed,
    };
  } catch (err: unknown) {
    const elapsed = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : 'Unknown error';

    // AbortError means timeout
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        timestamp: new Date().toISOString(),
        status: 'unreachable',
        responseTimeMs: elapsed,
        error: 'Request timed out (5s)',
      };
    }

    // TypeError with 'Failed to fetch' = network unreachable or CORS
    // In no-cors mode, an opaque response is still "reachable"
    // A TypeError means the host didn't respond at all
    return {
      timestamp: new Date().toISOString(),
      status: 'unreachable',
      responseTimeMs: elapsed,
      error: message,
    };
  }
}

// ─── Status UI ──────────────────────────────────────────────
const STATUS_CONFIG: Record<PingStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  reachable: { label: 'Reachable', color: 'text-green-500', icon: CheckCircle2 },
  unreachable: { label: 'Unreachable', color: 'text-red-500', icon: XCircle },
  pending: { label: 'Testing...', color: 'text-yellow-500', icon: Loader2 },
  error: { label: 'Error', color: 'text-orange-500', icon: AlertTriangle },
};

// ─── Result Row ─────────────────────────────────────────────
function ResultRow({ target, results }: { target: PingTarget; results: PingResultEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  const latest = results[results.length - 1];
  const reachableCount = results.filter(r => r.status === 'reachable').length;
  const totalCount = results.length;
  const avgTime = results.filter(r => r.responseTimeMs !== undefined)
    .reduce((sum, r) => sum + (r.responseTimeMs || 0), 0) / (reachableCount || 1);

  if (!latest) return null;

  const config = STATUS_CONFIG[latest.status];
  const StatusIcon = config.icon;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/30 transition-colors"
      >
        <StatusIcon className={cn('h-4 w-4 shrink-0', config.color, latest.status === 'pending' && 'animate-spin')} />
        <div className="flex-1 text-left">
          <span className="font-mono font-medium">{target.host}</span>
          {target.port && <span className="text-muted-foreground">:{target.port}</span>}
          {target.label && <span className="text-muted-foreground ml-2">({target.label})</span>}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {latest.responseTimeMs !== undefined && (
            <span className={latest.status === 'reachable' ? 'text-green-500' : ''}>
              {latest.responseTimeMs}ms
            </span>
          )}
          {totalCount > 1 && (
            <span>{reachableCount}/{totalCount} OK</span>
          )}
          {totalCount > 1 && reachableCount > 0 && (
            <span>avg {Math.round(avgTime)}ms</span>
          )}
        </div>
        {totalCount > 1 && (
          expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>

      {expanded && results.length > 0 && (
        <div className="border-t border-border bg-muted/20 max-h-48 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-4 py-1.5 text-left font-medium">#</th>
                <th className="px-4 py-1.5 text-left font-medium">Time</th>
                <th className="px-4 py-1.5 text-left font-medium">Status</th>
                <th className="px-4 py-1.5 text-right font-medium">Latency</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => {
                const rc = STATUS_CONFIG[r.status];
                return (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-1.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-1.5 font-mono">{format(new Date(r.timestamp), 'HH:mm:ss')}</td>
                    <td className={cn('px-4 py-1.5', rc.color)}>{rc.label}</td>
                    <td className="px-4 py-1.5 text-right font-mono">
                      {r.responseTimeMs !== undefined ? `${r.responseTimeMs}ms` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function PingToolPage() {
  const { projects } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const { sessions: savedSessions, saveSession, removeSession } = usePingSessions();

  // Test config
  const [targets, setTargets] = useState<PingTarget[]>([{ host: '', label: '' }]);
  const [mode, setMode] = useState<'single' | 'repeated' | 'multi'>('single');
  const [repeatCount, setRepeatCount] = useState(5);
  const [intervalMs, setIntervalMs] = useState(1000);

  // Running state
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Record<string, PingResultEntry[]>>({});
  const abortRef = useRef(false);
  const [showHistory, setShowHistory] = useState(false);

  // ─── Add/remove targets ────────────────────────────────
  const addTarget = useCallback(() => {
    setTargets(prev => [...prev, { host: '', label: '' }]);
  }, []);

  const removeTarget = useCallback((idx: number) => {
    setTargets(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  }, []);

  const updateTarget = useCallback((idx: number, patch: Partial<PingTarget>) => {
    setTargets(prev => prev.map((t, i) => i === idx ? { ...t, ...patch } : t));
  }, []);

  // ─── Run test ──────────────────────────────────────────
  const runTest = useCallback(async () => {
    const validTargets = targets.filter(t => t.host.trim());
    if (validTargets.length === 0) {
      toast.error('Enter at least one host');
      return;
    }

    setRunning(true);
    abortRef.current = false;
    setResults({});

    const iterations = mode === 'single' ? 1 : repeatCount;

    for (let i = 0; i < iterations; i++) {
      if (abortRef.current) break;

      const promises = validTargets.map(async (target) => {
        // Set pending
        setResults(prev => ({
          ...prev,
          [target.host]: [...(prev[target.host] || []), {
            timestamp: new Date().toISOString(),
            status: 'pending' as PingStatus,
          }],
        }));

        const result = await checkReachability(target.host, target.port);

        setResults(prev => {
          const existing = prev[target.host] || [];
          // Replace the last pending entry
          const updated = [...existing];
          let pendingIdx = -1;
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].status === 'pending') { pendingIdx = i; break; }
          }
          if (pendingIdx >= 0) {
            updated[pendingIdx] = result;
          } else {
            updated.push(result);
          }
          return { ...prev, [target.host]: updated };
        });
      });

      if (mode === 'multi') {
        // All targets in parallel
        await Promise.all(promises);
      } else {
        // Sequential for single target repeated
        for (const p of promises) await p;
      }

      // Wait between iterations
      if (i < iterations - 1 && !abortRef.current) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    }

    setRunning(false);
  }, [targets, mode, repeatCount, intervalMs]);

  const stopTest = useCallback(() => {
    abortRef.current = true;
    setRunning(false);
  }, []);

  // ─── Save results ─────────────────────────────────────
  const handleSaveSession = useCallback(async () => {
    const session: PingSession = {
      id: uuid(),
      projectId: selectedProjectId,
      targets: targets.filter(t => t.host.trim()),
      results,
      mode,
      intervalMs,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    await saveSession(session);
    toast.success('Ping results saved');
  }, [selectedProjectId, targets, results, mode, intervalMs, saveSession]);

  // ─── Export ────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const validTargets = targets.filter(t => t.host.trim());
    const lines: string[] = [];
    lines.push('═══════════════════════════════════════════════════════');
    lines.push('  BAU Suite — Reachability Test Results');
    lines.push('═══════════════════════════════════════════════════════');
    lines.push('');
    lines.push(`Date:     ${format(new Date(), 'MMM d, yyyy h:mm a')}`);
    lines.push(`Mode:     ${mode}`);
    lines.push(`Targets:  ${validTargets.length}`);
    lines.push('');
    lines.push('NOTE: Browser-based HTTP reachability test (not ICMP ping)');
    lines.push('');

    for (const target of validTargets) {
      const hostResults = results[target.host] || [];
      const reachable = hostResults.filter(r => r.status === 'reachable').length;
      const total = hostResults.length;
      const times = hostResults.filter(r => r.responseTimeMs).map(r => r.responseTimeMs!);
      const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
      const min = times.length ? Math.min(...times) : 0;
      const max = times.length ? Math.max(...times) : 0;

      lines.push('───────────────────────────────────────────────────────');
      lines.push(`Host:     ${target.host}${target.port ? ':' + target.port : ''}`);
      if (target.label) lines.push(`Label:    ${target.label}`);
      lines.push(`Result:   ${reachable}/${total} reachable`);
      if (times.length) {
        lines.push(`Latency:  avg=${avg}ms  min=${min}ms  max=${max}ms`);
      }
      lines.push('');

      for (const r of hostResults) {
        const ts = format(new Date(r.timestamp), 'HH:mm:ss');
        const status = r.status === 'reachable' ? 'OK' : 'FAIL';
        lines.push(`  [${ts}] ${status} ${r.responseTimeMs ? r.responseTimeMs + 'ms' : ''} ${r.error || ''}`);
      }
      lines.push('');
    }

    lines.push('───────────────────────────────────────────────────────');
    lines.push('Generated by BAU Suite');

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFilename(`ping_results_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.txt`);
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Results exported');
  }, [targets, results, mode]);

  // ─── Load saved session ────────────────────────────────
  const loadSession = useCallback((s: PingSession) => {
    setTargets(s.targets.length > 0 ? s.targets : [{ host: '', label: '' }]);
    setResults(s.results);
    setMode(s.mode);
    setIntervalMs(s.intervalMs);
    setShowHistory(false);
  }, []);

  const hasResults = Object.keys(results).length > 0;
  const validTargets = targets.filter(t => t.host.trim());

  return (
    <>
      <TopBar title="Ping Tool" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
          {/* Disclaimer */}
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm flex gap-3">
            <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-muted-foreground">
              <strong className="text-foreground">Browser Reachability Test</strong> — Browsers cannot send ICMP
              ping packets. This tool tests HTTP/TCP reachability using <code className="text-xs bg-muted px-1 rounded">fetch()</code>.
              It confirms whether a host responds on a given port — useful for verifying BAS controller
              web interfaces, switches, and servers are reachable. Response times reflect HTTP round-trip,
              not ICMP latency.
            </div>
          </div>

          {/* Config */}
          <div className="rounded-lg border border-border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4" /> Test Configuration
              </h2>
              <div className="flex items-center gap-2">
                <Select value={selectedProjectId || '_none'} onValueChange={v => v && setSelectedProjectId(v === '_none' ? '' : v)}>
                  <SelectTrigger className="h-8 text-xs w-48"><SelectValue placeholder="Project (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">No project</SelectItem>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.projectNumber} — {p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant={showHistory ? 'secondary' : 'outline'} className="h-8 gap-1 text-xs"
                  onClick={() => setShowHistory(!showHistory)}>
                  <Clock className="h-3 w-3" /> History
                </Button>
              </div>
            </div>

            {/* Mode selector */}
            <div className="flex items-center gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Mode</Label>
                <Select value={mode} onValueChange={v => v && setMode(v as typeof mode)}>
                  <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single Check</SelectItem>
                    <SelectItem value="repeated">Repeated</SelectItem>
                    <SelectItem value="multi">Multi-Target</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {mode === 'repeated' && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Count</Label>
                    <Input type="number" value={repeatCount} min={2} max={100}
                      onChange={e => setRepeatCount(parseInt(e.target.value) || 5)}
                      className="h-8 text-xs w-20" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Interval (ms)</Label>
                    <Input type="number" value={intervalMs} min={500} max={10000} step={500}
                      onChange={e => setIntervalMs(parseInt(e.target.value) || 1000)}
                      className="h-8 text-xs w-24" />
                  </div>
                </>
              )}
            </div>

            {/* Targets */}
            <div className="space-y-2">
              <Label className="text-xs">Targets</Label>
              {targets.map((target, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={target.host}
                    onChange={e => updateTarget(idx, { host: e.target.value })}
                    placeholder="10.40.1.10"
                    className="h-8 text-xs font-mono flex-1"
                    disabled={running}
                  />
                  <Input
                    value={target.port ?? ''}
                    onChange={e => updateTarget(idx, { port: e.target.value ? parseInt(e.target.value) : undefined })}
                    placeholder="Port"
                    type="number"
                    className="h-8 text-xs w-20"
                    disabled={running}
                  />
                  <Input
                    value={target.label || ''}
                    onChange={e => updateTarget(idx, { label: e.target.value })}
                    placeholder="Label (optional)"
                    className="h-8 text-xs w-32"
                    disabled={running}
                  />
                  {targets.length > 1 && (
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => removeTarget(idx)} disabled={running}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              {(mode === 'multi' || targets.length < 10) && (
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={addTarget} disabled={running}>
                  <Plus className="h-3 w-3" /> Add Target
                </Button>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {running ? (
                <Button size="sm" variant="destructive" className="gap-1.5" onClick={stopTest}>
                  <Square className="h-3.5 w-3.5" /> Stop
                </Button>
              ) : (
                <Button size="sm" className="gap-1.5" onClick={runTest} disabled={validTargets.length === 0}>
                  <Play className="h-3.5 w-3.5" /> Run Test
                </Button>
              )}
              {hasResults && !running && (
                <>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={handleExport}>
                    <Download className="h-3.5 w-3.5" /> Export
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={handleSaveSession}>
                    Save Results
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground"
                    onClick={() => setResults({})}>
                    Clear
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Results */}
          {hasResults && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold">Results</h2>
              {validTargets.map(target => (
                <ResultRow
                  key={target.host}
                  target={target}
                  results={results[target.host] || []}
                />
              ))}

              {/* Summary */}
              {!running && validTargets.length > 1 && (
                <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                  <strong className="text-foreground">Summary:</strong>{' '}
                  {validTargets.filter(t => {
                    const r = results[t.host];
                    return r && r[r.length - 1]?.status === 'reachable';
                  }).length} of {validTargets.length} hosts reachable
                </div>
              )}
            </div>
          )}

          {/* History */}
          {showHistory && (
            <div className="rounded-lg border border-border p-4 space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4" /> Saved Results
              </h2>
              {savedSessions.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No saved results yet.</p>
              ) : (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {savedSessions.map(s => (
                    <div key={s.id}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted/30 transition-colors"
                    >
                      <button onClick={() => loadSession(s)} className="flex-1 text-left">
                        <div className="font-medium">
                          {s.targets.map(t => t.host).join(', ')}
                        </div>
                        <div className="text-muted-foreground text-[10px] mt-0.5">
                          {format(new Date(s.createdAt), 'MMM d, yyyy h:mm a')} — {s.mode} mode
                        </div>
                      </button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeSession(s.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
