'use client';

import { useState, useCallback, useRef } from 'react';
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
  const { sessions, addSession, removeSession } = useTrendSessions();

  const hasData = data.length > 0;

  // ─── Process loaded files ────────────────────────────────
  const processData = useCallback((mergedData: TrendDataPoint[], mergedSeries: TrendSeries[], config: AnomalyConfig) => {
    setData(mergedData);
    setSeries(mergedSeries);
    setZoomDomain(null);

    // Compute anomalies
    const visibleSeries = mergedSeries.filter(s => s.visible);
    const detectedAnomalies = detectAnomalies(mergedData, visibleSeries, config);
    setAnomalies(detectedAnomalies);

    // Compute stats
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
  const handleSeriesChange = useCallback((newSeries: TrendSeries[]) => {
    setSeries(newSeries);
    const visibleSeries = newSeries.filter(s => s.visible);
    setAnomalies(detectAnomalies(data, visibleSeries, anomalyConfig));
  }, [data, anomalyConfig]);

  // ─── Anomaly config changes ─────────────────────────────
  const handleConfigChange = useCallback((config: AnomalyConfig) => {
    setAnomalyConfig(config);
    const visibleSeries = series.filter(s => s.visible);
    setAnomalies(detectAnomalies(data, visibleSeries, config));
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
  const handleLoad = useCallback((session: TrendSession) => {
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
      />
      <SessionLoadDialog
        open={loadOpen}
        onOpenChange={setLoadOpen}
        sessions={sessions}
        onLoad={handleLoad}
        onDelete={removeSession}
      />
    </div>
  );
}
