'use client';

import { Suspense, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { TopBar } from '@/components/layout/top-bar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import {
  Save, FolderOpen, Download, ImageIcon, FileSpreadsheet, Printer,
  ZoomOut, BarChart3,
} from 'lucide-react';
import { toast } from 'sonner';

import type {
  TrendDataPoint, TrendSeries, TrendAnomaly,
  TrendSeriesStats, AnomalyConfig, TrendSession, TrendSourceSystem,
} from '@/types';
import type { ParseResult } from '@/lib/trend-csv-parser';
import { mergeParsedResults } from '@/lib/trend-csv-parser';
import { detectAnomalies, computeSeriesStats, defaultAnomalyConfig } from '@/lib/trend-anomaly-engine';
import { exportCleanCSV, downloadCSV, exportChartAsPng, printReport } from '@/lib/trend-export';
import { useTrendSessions } from '@/hooks/use-trend-sessions';
import { useGlobalProjectTrendSessions } from '@/hooks/use-global-projects';
import { useProjects } from '@/hooks/use-projects';
import { GlobalModeBanner } from '@/components/global-projects/global-mode-banner';

import { CsvUploadPanel } from '@/components/trend-viewer/csv-upload-panel';
import { SeriesPanel } from '@/components/trend-viewer/series-panel';
import { AnomalyPanel } from '@/components/trend-viewer/anomaly-panel';
import { StatisticsPanel } from '@/components/trend-viewer/statistics-panel';
import { DataTablePanel } from '@/components/trend-viewer/data-table-panel';
import { SessionSaveDialog, SessionLoadDialog } from '@/components/trend-viewer/session-dialogs';

import type { TrendChartHandle } from '@/components/trend-viewer/trend-chart';

// Lazy-load TrendChart (pulls in recharts ~200KB) — only needed when data is loaded.
// Wraps forwardRef component so next/dynamic can handle it.
const TrendChart = dynamic(
  () => import('@/components/trend-viewer/trend-chart').then(m => ({ default: m.TrendChart })),
  { ssr: false, loading: () => <div className="h-[400px] flex items-center justify-center text-muted-foreground text-sm">Loading chart...</div> }
);

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function TrendViewerPage() {
  return (
    <Suspense fallback={<><TopBar title="Trend Data Visualizer" /><div className="flex-1 flex items-center justify-center p-16" role="status" aria-live="polite"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-label="Loading" /></div></>}>
      <TrendViewerPageInner />
    </Suspense>
  );
}

function TrendViewerPageInner() {
  const searchParams = useSearchParams();
  const globalProjectId = searchParams.get('globalProjectId') ?? undefined;
  const isGlobalMode = Boolean(globalProjectId);

  // ─── State ───────────────────────────────────────────────
  const [allResults, setAllResults] = useState<ParseResult[]>([]);
  const [series, setSeries] = useState<TrendSeries[]>([]);
  const [data, setData] = useState<TrendDataPoint[]>([]);
  const [anomalies, setAnomalies] = useState<TrendAnomaly[]>([]);
  const [stats, setStats] = useState<TrendSeriesStats[]>([]);
  const [anomalyConfig, setAnomalyConfig] = useState<AnomalyConfig>(defaultAnomalyConfig());
  const [zoomDomain, setZoomDomain] = useState<[number, number] | null>(null);
  const [activeTab, setActiveTab] = useState('series');
  const [saveOpen, setSaveOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);

  const chartRef = useRef<TrendChartHandle>(null);
  // Both hooks called unconditionally — the unused one short-circuits to []
  const { sessions: localSessions, addSession: addLocalSession, removeSession: removeLocalSession } = useTrendSessions();
  const { sessions: globalSessions, addSession: addGlobalSession, removeSession: removeGlobalSession } = useGlobalProjectTrendSessions(globalProjectId);
  // Local-mode project picker for the Save dialog. In global mode the project is
  // implicit (the global project), so the picker is hidden.
  const { projects } = useProjects();

  const sessions = isGlobalMode ? globalSessions : localSessions;
  const addSession = useCallback(
    async (data: Parameters<typeof addLocalSession>[0]) => {
      if (isGlobalMode) {
        return addGlobalSession({
          name: data.name,
          description: data.description,
          sourceSystem: data.sourceSystem,
          series: data.series,
          data: data.data,
          anomalies: data.anomalies,
          anomalyConfig: data.anomalyConfig,
          stats: data.stats,
        });
      }
      return addLocalSession(data);
    },
    [isGlobalMode, addLocalSession, addGlobalSession],
  );
  const removeSession = useCallback(
    async (id: string) => {
      if (isGlobalMode) return removeGlobalSession(id);
      return removeLocalSession(id);
    },
    [isGlobalMode, removeLocalSession, removeGlobalSession],
  );

  const hasData = data.length > 0;

  // ─── Process loaded files ────────────────────────────────
  const processData = useCallback((mergedData: TrendDataPoint[], mergedSeries: TrendSeries[], config: AnomalyConfig) => {
    setData(mergedData);
    setSeries(mergedSeries);
    setZoomDomain(null);

    // Compute anomalies and stats over ALL series — hide/show is a chart-only
    // concern, so both the Anomalies and Statistics panels report on the full
    // dataset (consistent counts; not affected by series visibility toggles).
    const detectedAnomalies = detectAnomalies(mergedData, mergedSeries, config);
    setAnomalies(detectedAnomalies);

    const computedStats = mergedSeries.map(s => computeSeriesStats(mergedData, s.id));
    setStats(computedStats);
  }, []);

  const handleFilesLoaded = useCallback((results: ParseResult[]) => {
    const newResults = [...allResults, ...results];
    setAllResults(newResults);

    const { data: mergedData, series: mergedSeries } = mergeParsedResults(newResults);
    processData(mergedData, mergedSeries, anomalyConfig);

    const totalSeries = mergedSeries.length;
    const totalRows = mergedData.length;
    toast.success(`Loaded ${totalSeries} series, ${totalRows.toLocaleString()} data points`);
  }, [allResults, anomalyConfig, processData]);

  // ─── Series changes (re-run anomalies) ──────────────────
  // Anomalies are computed over ALL series (visibility is a chart concern), so a
  // visibility toggle alone doesn't change the anomaly set — only structural
  // changes (renames/units/added series) do.
  const handleSeriesChange = useCallback((newSeries: TrendSeries[]) => {
    setSeries(newSeries);
    setAnomalies(detectAnomalies(data, newSeries, anomalyConfig));
  }, [data, anomalyConfig]);

  // ─── Anomaly config changes ─────────────────────────────
  const handleConfigChange = useCallback((config: AnomalyConfig) => {
    setAnomalyConfig(config);
    setAnomalies(detectAnomalies(data, series, config));
  }, [data, series]);

  // ─── Jump to anomaly ────────────────────────────────────
  const handleJumpTo = useCallback((timestamp: number) => {
    if (data.length === 0) return;
    // Center view on timestamp with ±30 min window
    const windowMs = 30 * 60_000;
    setZoomDomain([
      Math.max(data[0].timestamp, timestamp - windowMs),
      Math.min(data[data.length - 1].timestamp, timestamp + windowMs),
    ]);
  }, [data]);

  // ─── Zoom controls ──────────────────────────────────────
  const resetZoom = useCallback(() => setZoomDomain(null), []);

  // ─── Save session ───────────────────────────────────────
  const handleSave = useCallback(async (metadata: { name: string; description: string; sourceSystem: TrendSourceSystem; projectId: string }) => {
    try {
      await addSession({
        ...metadata,
        series,
        data,
        anomalies,
        anomalyConfig,
        stats,
      });
      toast.success('Session saved');
    } catch {
      // error handled in hook
    }
  }, [addSession, series, data, anomalies, anomalyConfig, stats]);

  // ─── Load session ───────────────────────────────────────
  // In global mode the session is a `GlobalTrendSession` (no `projectId`); we
  // only read fields shared by both shapes.
  const handleLoad = useCallback((session: Pick<TrendSession, 'series' | 'data' | 'anomalies' | 'anomalyConfig' | 'stats' | 'name'>) => {
    setSeries(session.series);
    setData(session.data);
    setAnomalies(session.anomalies);
    setAnomalyConfig(session.anomalyConfig);
    setStats(session.stats);
    setAllResults([]);
    setZoomDomain(null);
    toast.success(`Loaded "${session.name}"`);
  }, []);

  // ─── Exports ────────────────────────────────────────────
  const handleExportCSV = useCallback(() => {
    const csv = exportCleanCSV(data, series);
    downloadCSV(csv, `trend-export-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('CSV exported');
  }, [data, series]);

  const handleExportPNG = useCallback(async () => {
    if (!chartRef.current?.containerRef) return;
    try {
      await exportChartAsPng(chartRef.current.containerRef);
      toast.success('Chart exported as PNG');
    } catch (e) {
      toast.error('Failed to export chart');
      console.error(e);
    }
  }, []);

  const handlePrint = useCallback(() => {
    const session: TrendSession = {
      id: '', projectId: '', createdAt: '', updatedAt: '',
      name: 'Trend Analysis',
      description: '',
      sourceSystem: 'generic',
      series, data, anomalies, anomalyConfig, stats,
    };
    printReport(session);
  }, [series, data, anomalies, anomalyConfig, stats]);

  // ─── Render ─────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <TopBar title="Trend Data Visualizer" />

      {isGlobalMode && (
        <div className="shrink-0 border-b border-border bg-background px-4 py-2">
          <GlobalModeBanner globalProjectId={globalProjectId} />
        </div>
      )}

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          {!hasData && (
            <div className="text-xs text-muted-foreground">
              Upload trend CSV files to get started
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setLoadOpen(true)}>
              <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
              Open
            </Button>

            {hasData && (
              <>
                <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)}>
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  Save
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Export
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleExportPNG}>
                      <ImageIcon className="h-3.5 w-3.5 mr-2" />
                      Chart as PNG
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportCSV}>
                      <FileSpreadsheet className="h-3.5 w-3.5 mr-2" />
                      Clean CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handlePrint}>
                      <Printer className="h-3.5 w-3.5 mr-2" />
                      Print Report
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>

        {/* Upload panel (always visible when no data, or collapsed when data loaded) */}
        {!hasData ? (
          <Card>
            <CardContent className="p-6">
              <CsvUploadPanel onFilesLoaded={handleFilesLoaded} existingSeriesCount={series.length} />
            </CardContent>
          </Card>
        ) : (
          <details className="group">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              Add more CSV files...
            </summary>
            <div className="mt-2">
              <CsvUploadPanel onFilesLoaded={handleFilesLoaded} existingSeriesCount={series.length} />
            </div>
          </details>
        )}

        {/* Chart */}
        {hasData && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium">
                    {series.filter(s => s.visible).length} of {series.length} series visible
                  </span>
                </div>
                {zoomDomain && (
                  <Button variant="ghost" size="xs" onClick={resetZoom}>
                    <ZoomOut className="h-3 w-3 mr-1" />
                    Reset Zoom
                  </Button>
                )}
              </div>

              <TrendChart
                ref={chartRef}
                data={data}
                series={series}
                anomalies={anomalies}
                zoomDomain={zoomDomain}
                onZoomChange={setZoomDomain}
              />
            </CardContent>
          </Card>
        )}

        {/* Tabbed panels */}
        {hasData && (
          <Card>
            <CardContent className="p-4">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="series">
                    Series ({series.length})
                  </TabsTrigger>
                  <TabsTrigger value="anomalies">
                    Anomalies ({anomalies.length})
                  </TabsTrigger>
                  <TabsTrigger value="statistics">
                    Statistics
                  </TabsTrigger>
                  <TabsTrigger value="data">
                    Data
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="series" className="mt-4">
                  <SeriesPanel series={series} onSeriesChange={handleSeriesChange} />
                </TabsContent>

                <TabsContent value="anomalies" className="mt-4">
                  <AnomalyPanel
                    anomalies={anomalies}
                    series={series}
                    config={anomalyConfig}
                    onConfigChange={handleConfigChange}
                    onJumpTo={handleJumpTo}
                  />
                </TabsContent>

                <TabsContent value="statistics" className="mt-4">
                  <StatisticsPanel stats={stats} series={series} data={data} />
                </TabsContent>

                <TabsContent value="data" className="mt-4">
                  <DataTablePanel
                    data={data}
                    series={series}
                    anomalies={anomalies}
                    zoomDomain={zoomDomain}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialogs */}
      <SessionSaveDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        onSave={handleSave}
        projects={isGlobalMode ? [] : projects}
      />
      <SessionLoadDialog
        open={loadOpen}
        onOpenChange={setLoadOpen}
        // In global mode `sessions` is GlobalTrendSession[]; dialog reads only
        // the common subset (id, name, series, data, sourceSystem, updatedAt),
        // so cast is safe. Type follow-up to widen the dialog prop is Step 5.
        sessions={sessions as unknown as TrendSession[]}
        onLoad={handleLoad}
        onDelete={removeSession}
      />
    </div>
  );
}
