import { describe, it, expect } from 'vitest';
import {
  buildReportSubject,
  buildReportPlainText,
  buildReportHtml,
  assembleEml,
  encodeHeaderValue,
  utf8ToBase64,
  wrapBase64,
} from '../report-eml';
import type { DailyReport, Project } from '@/types';

const project: Project = {
  id: 'p1',
  name: 'Acme Tower',
  projectNumber: '44OP-001847',
  customerName: 'Acme Corp',
  siteAddress: '1 Main St',
} as unknown as Project;

const report: DailyReport = {
  id: 'r1',
  projectId: 'p1',
  date: '2026-06-07',
  reportNumber: 42,
  technicianName: 'Jane Tech',
  status: 'draft',
  createdAt: '2026-06-07T00:00:00Z',
  updatedAt: '2026-06-07T00:00:00Z',
  startTime: '08:00',
  endTime: '16:00',
  hoursOnSite: '8',
  location: 'Roof AHU-1',
  weather: 'Clear',
  workCompleted: 'Replaced <controller> & calibrated sensor',
  issuesEncountered: '',
  workPlannedNext: '',
  coordinationNotes: '',
  equipmentWorkedOn: '',
  deviceIpChanges: '',
  safetyNotes: '',
  generalNotes: '',
  attachments: [
    { id: 'a1', fileName: 'photo.jpg', fileType: 'image', mimeType: 'image/jpeg', size: 1234, blobKey: 'b1' },
  ],
} as unknown as DailyReport;

const meta = { title: '', preparedBy: 'Jane Tech', coverNote: '' };

describe('buildReportSubject', () => {
  it('includes the report number in the default subject', () => {
    const subject = buildReportSubject(report, project, meta);
    expect(subject).toContain('#42');
    expect(subject).toContain('Acme Tower');
  });

  it('honors a user-provided title override', () => {
    const subject = buildReportSubject(report, project, { ...meta, title: 'Custom Title' });
    expect(subject).toBe('Custom Title');
  });
});

describe('buildReportPlainText', () => {
  it('flags manual attachment when files are NOT carried (mailto/text path)', () => {
    const text = buildReportPlainText(report, project, meta, { attachmentsCarried: false });
    expect(text).toContain('ATTACHMENTS (attach these files manually)');
    expect(text).toContain('photo.jpg');
  });

  it('uses a plain attachments header when files ARE carried (.eml path)', () => {
    const text = buildReportPlainText(report, project, meta, { attachmentsCarried: true });
    expect(text).toContain('ATTACHMENTS');
    expect(text).not.toContain('attach these files manually');
  });

  it('never contains a Subject: line', () => {
    const text = buildReportPlainText(report, project, meta);
    expect(text).not.toMatch(/^Subject:/m);
  });
});

describe('buildReportHtml', () => {
  it('HTML-escapes user-entered content', () => {
    const html = buildReportHtml(report, project, meta);
    expect(html).toContain('&lt;controller&gt;');
    expect(html).toContain('&amp;');
    expect(html).not.toContain('<controller>');
  });
});

describe('encodeHeaderValue', () => {
  it('passes ASCII through unchanged', () => {
    expect(encodeHeaderValue('Daily Report #42')).toBe('Daily Report #42');
  });

  it('RFC-2047 base64-encodes non-ASCII (en-dash)', () => {
    const encoded = encodeHeaderValue('Report – test');
    expect(encoded).toMatch(/^=\?UTF-8\?B\?.+\?=$/);
  });
});

describe('wrapBase64', () => {
  it('wraps at 76 chars', () => {
    const long = 'A'.repeat(200);
    const wrapped = wrapBase64(long);
    for (const line of wrapped.split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(76);
    }
  });
});

describe('assembleEml', () => {
  const html = '<html><body>Hi</body></html>';
  const attBase64 = utf8ToBase64('fake file bytes');
  const eml = assembleEml({
    subject: 'Daily Report #42 – Acme',
    html,
    attachments: [{ fileName: 'photo.jpg', mimeType: 'image/jpeg', base64: attBase64 }],
  });

  it('declares multipart/mixed with a boundary that appears in the body', () => {
    const m = eml.match(/boundary="([^"]+)"/);
    expect(m).not.toBeNull();
    const boundary = m![1];
    expect(eml).toContain(`--${boundary}`);
    expect(eml).toContain(`--${boundary}--`);
  });

  it('contains an HTML body part', () => {
    expect(eml).toContain('Content-Type: text/html; charset=utf-8');
    expect(eml).toContain('Content-Transfer-Encoding: base64');
  });

  it('contains a base64 attachment part with disposition', () => {
    expect(eml).toContain('Content-Type: image/jpeg; name="photo.jpg"');
    expect(eml).toContain('Content-Disposition: attachment; filename="photo.jpg"');
    expect(eml).toContain(attBase64);
  });

  it('RFC-2047-encodes the en-dash subject', () => {
    expect(eml).toMatch(/Subject: =\?UTF-8\?B\?.+\?=/);
  });
});
