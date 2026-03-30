import { format } from 'date-fns';
import type { TrendDataPoint, TrendSeries, TrendSeriesStats, TrendSession } from '@/types';
import { TREND_ANOMALY_LABELS } from '@/types';
import { copyToClipboard } from '@/lib/utils';

// ─── Clean CSV Export ────────────────────────────────────────

export function exportCleanCSV(data: TrendDataPoint[], series: TrendSeries[]): string {
  const visibleSeries = series.filter(s => s.visible);
  const headers = ['Timestamp', ...visibleSeries.map(s => s.unit ? `${s.name} (${s.unit})` : s.name)];
  const rows = data.map(point => {
    const ts = format(new Date(point.timestamp), 'yyyy-MM-dd HH:mm:ss');
    const values = visibleSeries.map(s => {
      const val = point.values[s.id];
      return val !== null ? val.toString() : '';
    });
    return [ts, ...values].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

export function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}

// ─── Chart PNG Export (SVG → Canvas → PNG) ───────────────────

export async function exportChartAsPng(chartContainer: HTMLDivElement, filename = 'trend-chart.png'): Promise<void> {
  const svgElement = chartContainer.querySelector('svg');
  if (!svgElement) throw new Error('No chart SVG found');

  const svgData = new XMLSerializer().serializeToString(svgElement);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  const scale = 2; // High-DPI export

  await new Promise<void>((resolve, reject) => {
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = svgElement.clientWidth * scale;
      canvas.height = svgElement.clientHeight * scale;

      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas context failed')); return; }

      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(blob => {
        if (blob) {
          downloadBlob(blob, filename);
          resolve();
        } else {
          reject(new Error('Canvas to blob failed'));
        }
      }, 'image/png');

      URL.revokeObjectURL(url);
    };
    img.onerror = () => reject(new Error('Failed to load SVG as image'));
    img.src = url;
  });
}

// ─── Print Report ────────────────────────────────────────────

export function printReport(session: TrendSession) {
  const statsTable = session.stats.map(stat => {
    const s = session.series.find(s => s.id === stat.seriesId);
    return `
      <tr>
        <td>${s?.name ?? 'Unknown'}</td>
        <td>${stat.min.toFixed(2)}</td>
        <td>${stat.max.toFixed(2)}</td>
        <td>${stat.mean.toFixed(2)}</td>
        <td>${stat.median.toFixed(2)}</td>
        <td>${stat.stdDev.toFixed(2)}</td>
        <td>${stat.sampleCount}</td>
        <td>${stat.gapCount}</td>
        <td>${stat.runtimeHours !== null ? stat.runtimeHours.toFixed(1) + ' hr' : '—'}</td>
      </tr>
    `;
  }).join('');

  const anomaliesByType: Record<string, number> = {};
  for (const a of session.anomalies) {
    anomaliesByType[a.type] = (anomaliesByType[a.type] || 0) + 1;
  }

  const anomalySummary = Object.entries(anomaliesByType)
    .map(([type, count]) => `<li>${TREND_ANOMALY_LABELS[type as keyof typeof TREND_ANOMALY_LABELS] ?? type}: ${count}</li>`)
    .join('');

  const timeRange = session.data.length > 0
    ? `${format(new Date(session.data[0].timestamp), 'MMM d, yyyy HH:mm')} — ${format(new Date(session.data[session.data.length - 1].timestamp), 'MMM d, yyyy HH:mm')}`
    : 'No data';

  const html = `<!DOCTYPE html>
<html><head><title>Trend Report — ${session.name}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 900px; margin: 0 auto; padding: 24px; color: #1a1a1a; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 { font-size: 16px; margin-top: 24px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 16px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: right; }
  th { background: #f5f5f5; text-align: center; }
  td:first-child, th:first-child { text-align: left; }
  ul { padding-left: 20px; }
  li { margin: 4px 0; font-size: 13px; }
  @media print { body { margin: 0; } }
</style></head><body>
  <h1>Trend Analysis Report</h1>
  <p class="meta"><strong>${session.name}</strong>${session.description ? ` — ${session.description}` : ''}</p>
  <p class="meta">Time Range: ${timeRange} | Series: ${session.series.length} | Data Points: ${session.data.length}</p>

  <h2>Statistics</h2>
  <table>
    <thead><tr>
      <th>Series</th><th>Min</th><th>Max</th><th>Mean</th><th>Median</th><th>Std Dev</th><th>Samples</th><th>Gaps</th><th>Runtime</th>
    </tr></thead>
    <tbody>${statsTable}</tbody>
  </table>

  ${session.anomalies.length > 0 ? `
  <h2>Anomaly Summary</h2>
  <ul>${anomalySummary}</ul>
  <p class="meta">${session.anomalies.length} total anomalies detected</p>
  ` : '<h2>Anomalies</h2><p>No anomalies detected.</p>'}

  <p class="meta" style="margin-top:32px; border-top:1px solid #ddd; padding-top:8px;">
    Generated by BAU Suite Trend Data Visualizer — ${format(new Date(), 'MMM d, yyyy HH:mm')}
  </p>
</body></html>`;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  }
}

// ─── Copy Stats to Clipboard ─────────────────────────────────

export async function copyStatsToClipboard(stats: TrendSeriesStats[], series: TrendSeries[]) {
  const headers = ['Series', 'Min', 'Max', 'Mean', 'Median', 'Std Dev', 'Samples', 'Gaps', 'Runtime (hr)'];
  const rows = stats.map(stat => {
    const s = series.find(s => s.id === stat.seriesId);
    return [
      s?.name ?? 'Unknown',
      stat.min.toFixed(2),
      stat.max.toFixed(2),
      stat.mean.toFixed(2),
      stat.median.toFixed(2),
      stat.stdDev.toFixed(2),
      stat.sampleCount.toString(),
      stat.gapCount.toString(),
      stat.runtimeHours !== null ? stat.runtimeHours.toFixed(1) : '—',
    ].join('\t');
  });

  const text = [headers.join('\t'), ...rows].join('\n');
  await copyToClipboard(text);
}

// ─── Helpers ─────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
