'use client';

import { useDailyReports } from '@/hooks/use-projects';
import { ReportForm } from '@/components/reports/report-form';

export default function NewReportPage() {
  const { createReport } = useDailyReports();

  return (
    <ReportForm
      mode="create"
      onSave={createReport}
    />
  );
}
