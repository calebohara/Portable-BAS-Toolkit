'use client';

import { useState, useCallback, useRef } from 'react';
import {
  MessageSquare, Mail, FileDown, Package, ChevronRight, ChevronLeft,
  Copy, Check, Printer, Download, Eye, EyeOff, Users,
} from 'lucide-react';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn, escapeHtml } from '@/lib/utils';
import { openUrl } from '@/lib/tauri-bridge';
import { toast } from 'sonner';
import {
  FILE_CATEGORY_LABELS, type Project, type ProjectFile, type FieldNote,
  type DeviceEntry, type IpPlanEntry, type ActivityLogEntry, type FileCategory,
} from '@/types';
import {
  type ShareFormat, type ShareConfig, type ShareSection,
  type AudiencePreset, type ShareContentSelection,
  SHARE_FORMAT_LABELS, SHARE_FORMAT_DESCRIPTIONS,
  SHARE_SECTION_LABELS, DETAIL_LEVEL_LABELS, DETAIL_LEVEL_DESCRIPTIONS,
  ALL_SECTIONS, ALL_FILE_CATEGORIES,
  AUDIENCE_PRESETS, createDefaultSelection, applyPreset,
  type DetailLevel,
} from './share-types';
import { formatForTeams, formatForOutlook, generateSharePackage, type ShareData } from './share-formatters';
import { SharePdfView } from './share-pdf-view';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  files: ProjectFile[];
  notes: FieldNote[];
  devices: DeviceEntry[];
  ipEntries: IpPlanEntry[];
  activity: ActivityLogEntry[];
}

const FORMAT_ICONS: Record<ShareFormat, typeof MessageSquare> = {
  teams: MessageSquare,
  outlook: Mail,
  pdf: FileDown,
  package: Package,
};

const STEPS = ['Format', 'Content', 'Review & Export'] as const;

export function ShareDialog({ open, onOpenChange, project, files, notes, devices, ipEntries, activity }: Props) {
  const [step, setStep] = useState(0);
  const [format, setFormat] = useState<ShareFormat>('teams');
  const [content, setContent] = useState<ShareContentSelection>(createDefaultSelection);
  const [metadata, setMetadata] = useState({
    title: '',
    preparedBy: '',
    coverNote: '',
    date: new Date().toISOString(),
  });
  const [copied, setCopied] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const reset = useCallback(() => {
    setStep(0);
    setFormat('teams');
    setContent(createDefaultSelection());
    setMetadata({ title: '', preparedBy: '', coverNote: '', date: new Date().toISOString() });
    setCopied(false);
    setActivePreset(null);
  }, []);

  const handleOpenChange = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const config: ShareConfig = { format, content, metadata };
  const data: ShareData = { project, files, notes, devices, ipEntries, activity };

  // Count selected sections
  const selectedCount = ALL_SECTIONS.filter(s => content.sections[s]).length;

  // ─── Step 1: Format Selection ─────────────────────────────
  const renderFormatStep = () => (
    <div className="space-y-3 px-5 pb-2">
      <p className="text-sm text-muted-foreground">Choose how you want to share this project.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(['teams', 'outlook', 'pdf', 'package'] as ShareFormat[]).map(f => {
          const Icon = FORMAT_ICONS[f];
          return (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-3 text-left transition-all',
                format === f
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  : 'border-border hover:border-primary/30'
              )}
            >
              <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', format === f ? 'text-primary' : 'text-muted-foreground')} />
              <div>
                <p className="text-sm font-medium">{SHARE_FORMAT_LABELS[f]}</p>
                <p className="text-xs text-muted-foreground">{SHARE_FORMAT_DESCRIPTIONS[f]}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ─── Step 2: Content Selection ────────────────────────────
  const handlePreset = (preset: AudiencePreset) => {
    setContent(applyPreset(preset));
    setActivePreset(preset.id);
  };

  const toggleSection = (section: ShareSection) => {
    setActivePreset(null);
    setContent(prev => ({
      ...prev,
      sections: { ...prev.sections, [section]: !prev.sections[section] },
    }));
  };

  const toggleFileCategory = (cat: FileCategory) => {
    setActivePreset(null);
    setContent(prev => ({
      ...prev,
      fileCategories: { ...prev.fileCategories, [cat]: !prev.fileCategories[cat] },
    }));
  };

  const setDetailLevel = (level: DetailLevel) => {
    setActivePreset(null);
    setContent(prev => ({ ...prev, detailLevel: level }));
  };

  const renderContentStep = () => (
    <div className="space-y-4 px-5 pb-2">
      {/* Audience Presets */}
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
          <Users className="h-3.5 w-3.5" /> Audience Presets
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {AUDIENCE_PRESETS.map(preset => (
            <button
              key={preset.id}
              onClick={() => handlePreset(preset)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                activePreset === preset.id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:border-primary/40 text-muted-foreground hover:text-foreground'
              )}
              title={preset.description}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Detail Level */}
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Detail Level</Label>
        <div className="flex gap-2">
          {(['summary', 'standard', 'detailed'] as DetailLevel[]).map(level => (
            <button
              key={level}
              onClick={() => setDetailLevel(level)}
              className={cn(
                'flex-1 rounded-lg border p-2 text-center transition-colors',
                content.detailLevel === level
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/30'
              )}
            >
              <p className="text-xs font-medium">{DETAIL_LEVEL_LABELS[level]}</p>
              <p className="text-[10px] text-muted-foreground">{DETAIL_LEVEL_DESCRIPTIONS[level]}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Section Toggles */}
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
          Sections ({selectedCount}/{ALL_SECTIONS.length})
        </Label>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {ALL_SECTIONS.map(section => {
            const count = getSectionCount(section, data);
            const isEmpty = count === 0 && section !== 'projectInfo';
            return (
              <button
                key={section}
                onClick={() => !isEmpty && toggleSection(section)}
                disabled={isEmpty}
                className={cn(
                  'flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors',
                  isEmpty && 'opacity-40 cursor-not-allowed',
                  content.sections[section] && !isEmpty
                    ? 'border-primary/30 bg-primary/5'
                    : 'border-border'
                )}
              >
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'h-3 w-3 rounded-sm border flex items-center justify-center',
                    content.sections[section] && !isEmpty ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                  )}>
                    {content.sections[section] && !isEmpty && <Check className="h-2 w-2 text-primary-foreground" />}
                  </div>
                  <span>{SHARE_SECTION_LABELS[section]}</span>
                </div>
                {count > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-5">{count}</Badge>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* File Category Filters (only if files section enabled) */}
      {content.sections.files && files.length > 0 && (
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">File Categories</Label>
          <div className="flex flex-wrap gap-1.5">
            {ALL_FILE_CATEGORIES.map(cat => {
              const count = files.filter(f => f.category === cat).length;
              if (count === 0) return null;
              return (
                <button
                  key={cat}
                  onClick={() => toggleFileCategory(cat)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                    content.fileCategories[cat]
                      ? 'border-primary/30 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground'
                  )}
                >
                  {FILE_CATEGORY_LABELS[cat]} ({count})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Sensitive Content Toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          {content.hideSensitive ? <EyeOff className="h-4 w-4 text-field-warning" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
          <div>
            <p className="text-sm font-medium">Hide Sensitive Data</p>
            <p className="text-[10px] text-muted-foreground">Mask IPs, MACs, emails, and phone numbers</p>
          </div>
        </div>
        <Switch
          size="sm"
          checked={content.hideSensitive}
          onCheckedChange={(checked) => setContent(prev => ({ ...prev, hideSensitive: !!checked }))}
        />
      </div>
    </div>
  );

  // ─── Step 3: Review & Export ───────────────────────────────
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleDownloadPackage = () => {
    const json = generateSharePackage(data, config);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(project.projectNumber || project.name).replace(/[<>:"|?*\\\/]/g, '_')}-share-package.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Package downloaded');
  };

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    // Create a temporary print container in the current window
    const printContainer = document.createElement('div');
    printContainer.id = 'bau-print-container';
    printContainer.innerHTML = content.innerHTML;

    // Add print styles
    const style = document.createElement('style');
    style.id = 'bau-print-styles';
    style.textContent = `
      @media print {
        body > *:not(#bau-print-container) { display: none !important; }
        #bau-print-container {
          display: block !important;
          position: absolute; top: 0; left: 0; width: 100%;
          font-family: system-ui, -apple-system, sans-serif; font-size: 12px; color: #111; padding: 20px;
        }
        #bau-print-container h1 { font-size: 20px; margin-bottom: 8px; }
        #bau-print-container h2 { font-size: 15px; margin-bottom: 6px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
        #bau-print-container section { margin-bottom: 16px; }
        #bau-print-container table { width: 100%; border-collapse: collapse; }
        #bau-print-container th, #bau-print-container td { text-align: left; padding: 3px 6px; border-bottom: 1px solid #eee; }
        #bau-print-container th { font-weight: 600; background: #f5f5f5; }
        #bau-print-container .text-gray-500 { color: #6b7280; }
        #bau-print-container .text-gray-400 { color: #9ca3af; }
        #bau-print-container .text-gray-600 { color: #4b5563; }
        #bau-print-container .text-gray-700 { color: #374151; }
        #bau-print-container .text-amber-600 { color: #d97706; }
        #bau-print-container .font-semibold { font-weight: 600; }
        #bau-print-container .font-medium { font-weight: 500; }
        #bau-print-container .font-bold { font-weight: 700; }
        #bau-print-container .whitespace-pre-wrap { white-space: pre-wrap; }
        #bau-print-container .list-disc { list-style-type: disc; padding-left: 20px; }
        #bau-print-container .border-b-2 { border-bottom: 2px solid #1f2937; }
        #bau-print-container .border-b { border-bottom: 1px solid #d1d5db; }
        #bau-print-container .border-t { border-top: 1px solid #d1d5db; }
      }
      #bau-print-container { display: none; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(printContainer);
    window.print();
    // Cleanup after print
    document.body.removeChild(printContainer);
    document.head.removeChild(style);
  };

  const renderReviewStep = () => {
    const teamsOutput = format === 'teams' ? formatForTeams(data, config) : '';
    const outlookOutput = format === 'outlook' ? formatForOutlook(data, config) : null;

    return (
      <div className="space-y-4 px-5 pb-2">
        {/* Metadata fields */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="share-title">Title (optional)</Label>
            <Input
              id="share-title"
              placeholder={`${project.name} — Project Report`}
              value={metadata.title}
              onChange={e => setMetadata(m => ({ ...m, title: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="share-by">Prepared By</Label>
            <Input
              id="share-by"
              placeholder="Your name"
              value={metadata.preparedBy}
              onChange={e => setMetadata(m => ({ ...m, preparedBy: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="share-note">Cover Note</Label>
            <Textarea
              id="share-note"
              placeholder="Optional message to include at the top..."
              value={metadata.coverNote}
              onChange={e => setMetadata(m => ({ ...m, coverNote: e.target.value }))}
              rows={2}
              className="resize-none"
            />
          </div>
        </div>

        {/* Preview */}
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Preview</Label>
          {format === 'teams' && (
            <div className="rounded-lg border border-border bg-muted/30 p-3" style={{ maxHeight: '30vh', overflowY: 'auto' }}>
              <pre className="text-xs whitespace-pre-wrap font-mono">{teamsOutput}</pre>
            </div>
          )}
          {format === 'outlook' && outlookOutput && (
            <div className="space-y-2">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Subject:</p>
                <p className="text-sm font-medium">{outlookOutput.subject}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3" style={{ maxHeight: '25vh', overflowY: 'auto' }}>
                <p className="text-xs font-medium text-muted-foreground mb-1">Body:</p>
                <pre className="text-xs whitespace-pre-wrap font-mono">{outlookOutput.body}</pre>
              </div>
            </div>
          )}
          {format === 'pdf' && (
            <div className="rounded-lg border border-border bg-white" style={{ maxHeight: '30vh', overflowY: 'auto' }}>
              <div ref={printRef} style={{ transform: 'scale(0.7)', transformOrigin: 'top left', width: '142%' }}>
                <SharePdfView
                  project={project}
                  files={files}
                  notes={notes}
                  devices={devices}
                  ipEntries={ipEntries}
                  activity={activity}
                  config={config}
                />
              </div>
            </div>
          )}
          {format === 'package' && (
            <div className="rounded-lg border border-border bg-muted/30 p-3" style={{ maxHeight: '30vh', overflowY: 'auto' }}>
              <pre className="text-xs whitespace-pre-wrap font-mono">
                {generateSharePackage(data, config).substring(0, 2000)}
                {generateSharePackage(data, config).length > 2000 ? '\n...' : ''}
              </pre>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          {format === 'teams' && (
            <Button onClick={() => handleCopy(teamsOutput)} className="gap-1.5">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </Button>
          )}
          {format === 'outlook' && outlookOutput && (
            <>
              <Button onClick={() => handleCopy(`Subject: ${outlookOutput.subject}\n\n${outlookOutput.body}`)} className="gap-1.5">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy Email'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const mailto = `mailto:?subject=${encodeURIComponent(outlookOutput.subject)}&body=${encodeURIComponent(outlookOutput.body)}`;
                  openUrl(mailto);
                }}
                className="gap-1.5"
              >
                <Mail className="h-4 w-4" /> Open in Email
              </Button>
            </>
          )}
          {format === 'pdf' && (
            <Button onClick={handlePrint} className="gap-1.5">
              <Printer className="h-4 w-4" /> Print / Save as PDF
            </Button>
          )}
          {format === 'package' && (
            <Button onClick={handleDownloadPackage} className="gap-1.5">
              <Download className="h-4 w-4" /> Download Package
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Share / Export Project</DialogTitle>
            <DialogDescription>
              Build a custom share package for &quot;{project.name}&quot;
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {/* Step Indicator */}
            <div className="flex items-center gap-2 px-5 py-3">
              {STEPS.map((label, i) => (
                <div key={label} className="flex items-center gap-2 flex-1">
                  <button
                    onClick={() => i < step && setStep(i)}
                    className={cn(
                      'flex items-center gap-1.5 text-xs font-medium transition-colors',
                      i === step ? 'text-primary' : i < step ? 'text-foreground cursor-pointer hover:text-primary' : 'text-muted-foreground'
                    )}
                    disabled={i > step}
                  >
                    <span className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                      i === step ? 'bg-primary text-primary-foreground' : i < step ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                    )}>
                      {i < step ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className={cn('h-px flex-1', i < step ? 'bg-primary/30' : 'bg-border')} />
                  )}
                </div>
              ))}
            </div>

            {/* Step Content */}
            {step === 0 && renderFormatStep()}
            {step === 1 && renderContentStep()}
            {step === 2 && renderReviewStep()}
          </DialogBody>

          <DialogFooter>
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep(s => s - 1)} className="gap-1">
                <ChevronLeft className="h-4 w-4" /> Back
              </Button>
            )}
            <div className="flex-1" />
            {step === 0 && (
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
            )}
            {step < 2 && (
              <Button onClick={() => setStep(s => s + 1)} className="gap-1">
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            )}
            {step === 2 && (
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Done</Button>
            )}
          </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Helpers ─────────────────────────────────────────────────
function getSectionCount(section: ShareSection, data: ShareData): number {
  switch (section) {
    case 'projectInfo': return 1;
    case 'contacts': return data.project.contacts.length;
    case 'panelRoster': return data.project.panelRosterSummary ? 1 : 0;
    case 'techNotes': return data.project.technicianNotes ? 1 : 0;
    case 'networkSummary': return data.ipEntries.length > 0 || data.project.networkSummary ? 1 : 0;
    case 'files': return data.files.length;
    case 'notes': return data.notes.length;
    case 'devices': return data.devices.length;
    case 'ipPlan': return data.ipEntries.length;
    case 'activity': return data.activity.length;
    default: return 0;
  }
}
