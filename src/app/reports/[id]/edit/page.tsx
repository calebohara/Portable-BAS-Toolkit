'use client';

import { use } from 'react';
import { useDailyReport, useDailyReports } from '@/hooks/use-projects';

import { ReportForm } from '@/components/reports/report-form';

export default function EditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { report, loading } = useDailyReport(id);
  const { createReport, updateReport } = useDailyReports();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground">Report not found.</p>
      </div>
    );
  }

  return (
    <ReportForm
      mode="edit"
      initial={report}
      onSave={createReport}
      onUpdate={updateReport}
    />
  );
}
