'use client';

import { use, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft, Edit, Trash2, Share2, CalendarDays, Clock, MapPin,
  CloudSun, Wrench, AlertTriangle, CalendarCheck, Users, Shield,
  StickyNote, Paperclip, FileText, Send, Lock, Download,
} from 'lucide-react';
import { useDailyReport, useDailyReports, useProject } from '@/hooks/use-projects';
import { getFileBlob } from '@/lib/db';
import { TopBar } from '@/components/layout/top-bar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatFileSize } from '@/components/shared/file-icon';
import { ReportExportDialog } from '@/components/reports/report-export-dialog';
import type { ReportStatus } from '@/types';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogBody,
} from '@/components/ui/dialog';
import { navigateToReportEdit } from '@/lib/routes';

const STATUS_COLORS: Record<ReportStatus, string> = {
  draft: 'bg-field-warning/15 text-field-warning',
  submitted: 'bg-field-info/15 text-field-info',
  finalized: 'bg-field-success/15 text-field-success',
};

const STATUS_ICONS: Record<ReportStatus, React.ReactNode> = {
  draft: <Edit className="h-3 w-3" />,
  submitted: <Send className="h-3 w-3" />,
  finalized: <Lock className="h-3 w-3" />,
};

function Section({ icon: Icon, title, children, iconColor }: {
  icon: typeof CalendarCheck; title: string; children: React.ReactNode; iconColor?: string;
}) {
  if (!children) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Icon className={`h-4 w-4 ${iconColor || 'text-primary'}`} /> {title}
      </h3>
      {children}
    </section>
  );
}

function TextBlock({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
        {icon} {label}
      </p>
      <p className="text-sm whitespace-pre-wrap leading-relaxed">{value}</p>
    </div>
  );
}

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: paramId } = use(params);
  const id = typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('_id') || paramId)
    : paramId;
  const router = useRouter();
  const { report, loading } = useDailyReport(id);
  const { removeReport } = useDailyReports();
  const { project } = useProject(report?.projectId || '');

  const [showDelete, setShowDelete] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await removeReport(id);
      router.push('/reports');
    } catch {
      setDeleting(false);
    }
  };

  const handleDownloadAttachment = async (att: { blobKey: string; fileName: string; mimeType: string }) => {
    let url: string | undefined;
    try {
      const blob = await getFileBlob(att.blobKey);
      if (!blob) return;
      url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.fileName;
      a.click();
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!report) {
    return (
      <>
        <TopBar title="Report Not Found" />
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-muted-foreground mb-4">This report could not be found.</p>
          <Button variant="outline" onClick={() => router.push('/reports')}>Back to Reports</Button>
        </div>
      </>
    );
  }

  const formattedDate = format(new Date(report.date + 'T00:00:00'), 'EEEE, MMMM d, yyyy');

  return (
    <>
      <TopBar title={`Report #${report.reportNumber}`} />
      <div className="p-4 md:p-6 max-w-3xl space-y-6">
        {/* Back */}
        <Button variant="ghost" size="sm" onClick={() => router.push('/reports')} className="gap-1.5 -ml-2">
          <ArrowLeft className="h-4 w-4" /> All Reports
        </Button>

        {/* Header Card */}
        <div className="rounded-xl border border-border p-4 md:p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-lg font-semibold">Daily Report #{report.reportNumber}</h1>
                <Badge className={`text-[10px] gap-1 ${STATUS_COLORS[report.status]}`}>
                  {STATUS_ICONS[report.status]}
                  {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> {formattedDate}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Project</span>
              <p className="font-medium truncate">{project?.name || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Technician</span>
              <p className="font-medium">{report.technicianName || '—'}</p>
            </div>
            {report.hoursOnSite && (
              <div>
                <span className="text-muted-foreground">Hours On Site</span>
                <p className="font-medium">{report.hoursOnSite}h</p>
              </div>
            )}
            {report.location && (
              <div>
                <span className="text-muted-foreground">Location</span>
                <p className="font-medium truncate">{report.location}</p>
              </div>
            )}
          </div>

          {(report.startTime || report.endTime || report.weather) && (
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1 border-t border-border">
              {report.startTime && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {report.startTime} – {report.endTime || '?'}</span>}
              {report.weather && <span className="flex items-center gap-1"><CloudSun className="h-3 w-3" /> {report.weather}</span>}
              {report.location && <span className="flex items-center gap-1 sm:hidden"><MapPin className="h-3 w-3" /> {report.location}</span>}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
            {report.status !== 'finalized' && (
              <Button variant="outline" size="sm" onClick={() => navigateToReportEdit(router, id)} className="gap-1.5">
                <Edit className="h-3.5 w-3.5" /> Edit
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowExport(true)} className="gap-1.5">
              <Share2 className="h-3.5 w-3.5" /> Export / Share
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowDelete(true)} className="gap-1.5 text-destructive hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        </div>

        {/* Content Sections */}
        <div className="space-y-6">
          {/* Work Summary */}
          {(report.workCompleted || report.issuesEncountered || report.workPlannedNext) && (
            <Section icon={CalendarCheck} title="Work Summary">
              <div className="space-y-4">
                <TextBlock label="Work Completed" value={report.workCompleted} />
                <TextBlock label="Issues Encountered" value={report.issuesEncountered} icon={<AlertTriangle className="h-3 w-3 text-field-warning" />} />
                <TextBlock label="Work Planned Next" value={report.workPlannedNext} />
              </div>
            </Section>
          )}

          {/* Systems / Equipment */}
          {(report.equipmentWorkedOn || report.deviceIpChanges) && (
            <Section icon={Wrench} title="Systems / Equipment">
              <div className="space-y-4">
                <TextBlock label="Equipment Worked On" value={report.equipmentWorkedOn} />
                <TextBlock label="Devices / IP Changes" value={report.deviceIpChanges} />
              </div>
            </Section>
          )}

          {/* Coordination */}
          {(report.coordinationNotes || report.safetyNotes) && (
            <Section icon={Users} title="Coordination">
              <div className="space-y-4">
                <TextBlock label="Coordination Notes" value={report.coordinationNotes} />
                <TextBlock label="Safety Notes" value={report.safetyNotes} icon={<Shield className="h-3 w-3 text-field-success" />} />
              </div>
            </Section>
          )}

          {/* General Notes */}
          {report.generalNotes && (
            <Section icon={StickyNote} title="Additional Notes">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{report.generalNotes}</p>
            </Section>
          )}

          {/* Attachments */}
          {report.attachments.length > 0 && (
            <Section icon={Paperclip} title={`Attachments (${report.attachments.length})`}>
              <div className="space-y-1.5">
                {report.attachments.map(a => (
                  <div key={a.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate flex-1">{a.fileName}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(a.size)}</span>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDownloadAttachment(a)}>
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* Meta */}
        <div className="text-xs text-muted-foreground border-t border-border pt-3 space-y-0.5">
          <p>Created: {format(new Date(report.createdAt), 'MMM d, yyyy h:mm a')}</p>
          <p>Updated: {format(new Date(report.updatedAt), 'MMM d, yyyy h:mm a')}</p>
        </div>
      </div>

      {/* Delete Confirmation */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Report</DialogTitle>
            <DialogDescription>
              This will permanently delete Daily Report #{report.reportNumber} for {formattedDate}. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete Report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      {showExport && report && project && (
        <ReportExportDialog
          report={report}
          project={project}
          open={showExport}
          onOpenChange={setShowExport}
        />
      )}
    </>
  );
}
