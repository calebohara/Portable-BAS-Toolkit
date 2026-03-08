import { v4 as uuid } from 'uuid';
import type {
  Project, ProjectFile, FieldNote, DeviceEntry, IpPlanEntry, ActivityLogEntry, FileVersion,
} from '@/types';

function makeVersion(fileId: string, num: number, daysAgo: number, notes: string, status: 'current' | 'previous' | 'superseded' = 'previous', size = 1024000): FileVersion {
  const id = uuid();
  return {
    id,
    fileId,
    versionNumber: num,
    uploadedAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    uploadedBy: 'C. Ohara',
    notes,
    size,
    status,
    blobKey: undefined,
  };
}

export function generateDemoData() {
  const now = new Date().toISOString();
  const projects: Project[] = [
    {
      id: 'proj-ahu-upgrade',
      name: 'AHU-1/2 Controls Upgrade',
      customerName: 'Memorial Regional Hospital',
      siteAddress: '3501 Johnson St, Hollywood, FL 33021',
      buildingArea: 'Central Plant / Mechanical Room 104',
      projectNumber: '44OP-001847',
      technicianNotes: 'Phase 1 covers AHU-1 and AHU-2. Existing Apogee P2 controllers being replaced with PXC36 modular. Network backbone staying Ethernet/IP. Coordinate with TAB contractor for final air balance after startup.',
      createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      tags: ['healthcare', 'ahu', 'retrofit', 'PXC36', 'apogee-migration'],
      status: 'active',
      contacts: [
        { name: 'James Rivera', role: 'General Contractor', phone: '954-555-0142', email: 'jrivera@abccontracting.com', company: 'ABC Contracting' },
        { name: 'Sarah Chen', role: 'Mechanical Engineer', phone: '305-555-0189', company: 'Chen MEP Associates' },
        { name: 'Mike Torres', role: 'TAB Contractor', phone: '954-555-0267', company: 'AirFlow Testing Inc' },
        { name: 'Linda Park', role: 'Facilities Manager', phone: '954-555-0312', email: 'lpark@memorialhospital.org', company: 'Memorial Regional Hospital' },
      ],
      panelRosterSummary: 'PXC36.1-AHU1 (AHU-1), PXC36.1-AHU2 (AHU-2), existing PXC100 NAE (retained)',
      networkSummary: 'VLAN 40, subnet 10.40.1.0/24, gateway 10.40.1.1',
      isPinned: true,
      isOfflineAvailable: true,
    },
    {
      id: 'proj-lab-reno',
      name: 'Clinical Lab Renovation BAS',
      customerName: 'Piedmont Medical Center',
      siteAddress: '1800 Horace Mann Ave, Rock Hill, SC 29732',
      buildingArea: 'Building B / 3rd Floor Lab Wing',
      projectNumber: '44OP-002103',
      technicianNotes: 'New Desigo CC server installed. 12 new VAV boxes, 2 exhaust fans, 1 fume hood controller. Pressure cascade monitoring critical for lab safety. BSL-2 rated space.',
      createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      tags: ['healthcare', 'lab', 'desigo-cc', 'vav', 'pressure-cascade'],
      status: 'active',
      contacts: [
        { name: 'David Kim', role: 'Project Manager', phone: '704-555-0198', company: 'Siemens SI' },
        { name: 'Rachel Adams', role: 'Lab Safety Officer', phone: '803-555-0277', company: 'Piedmont Medical Center' },
      ],
      panelRosterSummary: 'PXC50-LAB3-01, PXC50-LAB3-02, PXC22-EF-01, Desigo CC Server',
      networkSummary: 'VLAN 50, subnet 10.50.3.0/24',
      isPinned: false,
      isOfflineAvailable: true,
    },
    {
      id: 'proj-central-plant',
      name: 'Central Plant Panel Migration',
      customerName: 'Oakwood Corporate Campus',
      siteAddress: '4200 Oakwood Blvd, Dearborn, MI 48126',
      buildingArea: 'Central Energy Plant',
      projectNumber: '44OP-000892',
      technicianNotes: 'Full Apogee to Desigo migration. 3 chillers, 2 boilers, cooling tower, primary/secondary pumping. Critical: maintain BACnet addressing from legacy system for SCADA integration.',
      createdAt: new Date(Date.now() - 120 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
      tags: ['commercial', 'central-plant', 'migration', 'apogee-to-desigo', 'chiller'],
      status: 'on-hold',
      contacts: [
        { name: 'Tom Bradley', role: 'Facilities Director', phone: '313-555-0456', company: 'Oakwood Corp' },
      ],
      panelRosterSummary: 'PXC100-CP-01, PXC100-CP-02, PXC36-CT-01, PXC36-PUMP-01',
      networkSummary: 'VLAN 30, subnet 10.30.1.0/24, BACnet/IP BBMD at 10.30.1.1',
      isPinned: false,
      isOfflineAvailable: false,
    },
    {
      id: 'proj-vav-retrofit',
      name: 'VAV Floor 2-5 Retrofit',
      customerName: 'Summit One Vanderbilt',
      siteAddress: '1 Vanderbilt Ave, New York, NY 10017',
      buildingArea: 'Floors 2-5 Office Tenant Space',
      projectNumber: '44OP-003301',
      technicianNotes: 'Replacing 48 legacy VAV controllers with PXC22.1 compact. Reusing existing actuators and sensors where possible. Night setback schedule must match tenant lease agreement.',
      createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
      updatedAt: now,
      tags: ['commercial', 'office', 'vav', 'PXC22', 'tenant-space'],
      status: 'active',
      contacts: [
        { name: 'Alex Morgan', role: 'Building Engineer', phone: '212-555-0834', company: 'Summit Management' },
      ],
      panelRosterSummary: '48x PXC22.1 VAV controllers, 4x PXC100 floor trunk controllers',
      networkSummary: 'MSTP trunks per floor, BACnet/IP backbone VLAN 20',
      isPinned: true,
      isOfflineAvailable: true,
    },
    {
      id: 'proj-exhaust-vfd',
      name: 'Exhaust Fan VFD Retrofit',
      customerName: 'Greenfield Manufacturing',
      siteAddress: '8900 Industrial Pkwy, Greenfield, IN 46140',
      buildingArea: 'Production Floor / Welding Bay',
      projectNumber: '44OP-004455',
      technicianNotes: 'Adding VFDs to 6 exhaust fans. CO monitoring integration with BAS for demand ventilation. Existing MEC panels being upgraded to PXC Modular.',
      createdAt: new Date(Date.now() - 15 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      tags: ['industrial', 'exhaust', 'vfd', 'demand-ventilation', 'CO-monitoring'],
      status: 'active',
      contacts: [],
      panelRosterSummary: 'PXC36-EF-01 through PXC36-EF-06',
      networkSummary: 'MSTP trunk, NAE at 10.10.1.50',
      isPinned: false,
      isOfflineAvailable: false,
    },
  ];

  // Generate files for first project
  const files: ProjectFile[] = [];
  const fileIds = {
    ahuDb1: uuid(), ahuDb2: uuid(), wiringAhu1: uuid(), seqAhu: uuid(),
    ipPlanDoc: uuid(), deviceListDoc: uuid(), backupAhu1: uuid(), backupAhu2: uuid(),
  };

  // Panel databases
  const v1 = makeVersion(fileIds.ahuDb1, 1, 20, 'Initial database upload from Apogee backup', 'superseded', 2400000);
  const v2 = makeVersion(fileIds.ahuDb1, 2, 10, 'Updated after point mapping revisions', 'previous', 2500000);
  const v3 = makeVersion(fileIds.ahuDb1, 3, 2, 'Final startup database - field verified', 'current', 2600000);

  files.push({
    id: fileIds.ahuDb1,
    projectId: 'proj-ahu-upgrade',
    title: 'AHU-1 Panel Database',
    fileName: 'PXC36-AHU1_DB_Rev3.pxc',
    fileType: 'pxc',
    mimeType: 'application/octet-stream',
    category: 'panel-databases',
    panelSystem: 'PXC36.1-AHU1',
    revisionNumber: 'Rev 3',
    revisionDate: new Date(Date.now() - 2 * 86400000).toISOString(),
    uploadedBy: 'C. Ohara',
    notes: 'Final startup database. All points verified against sequence. CO2 demand ventilation logic updated.',
    tags: ['ahu-1', 'pxc36', 'startup', 'field-verified'],
    status: 'current',
    isPinned: true,
    isFavorite: true,
    isOfflineCached: true,
    currentVersionId: v3.id,
    versions: [v1, v2, v3],
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    size: 2600000,
  });

  const vDb2_1 = makeVersion(fileIds.ahuDb2, 1, 15, 'Initial database from engineering', 'previous', 2300000);
  const vDb2_2 = makeVersion(fileIds.ahuDb2, 2, 5, 'Startup database - pending TAB verification', 'current', 2450000);

  files.push({
    id: fileIds.ahuDb2,
    projectId: 'proj-ahu-upgrade',
    title: 'AHU-2 Panel Database',
    fileName: 'PXC36-AHU2_DB_Rev2.pxc',
    fileType: 'pxc',
    mimeType: 'application/octet-stream',
    category: 'panel-databases',
    panelSystem: 'PXC36.1-AHU2',
    revisionNumber: 'Rev 2',
    revisionDate: new Date(Date.now() - 5 * 86400000).toISOString(),
    uploadedBy: 'C. Ohara',
    notes: 'Startup database loaded. Waiting on TAB contractor for final airflow verification before marking field-verified.',
    tags: ['ahu-2', 'pxc36', 'startup', 'pending-verification'],
    status: 'current',
    isPinned: true,
    isFavorite: false,
    isOfflineCached: true,
    currentVersionId: vDb2_2.id,
    versions: [vDb2_1, vDb2_2],
    createdAt: new Date(Date.now() - 15 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    size: 2450000,
  });

  // Wiring diagrams
  const vWire1 = makeVersion(fileIds.wiringAhu1, 1, 25, 'As-built wiring diagram from engineering', 'current', 3200000);

  files.push({
    id: fileIds.wiringAhu1,
    projectId: 'proj-ahu-upgrade',
    title: 'AHU-1 Wiring Diagram',
    fileName: 'AHU1_Wiring_Diagram_AsBuilt.pdf',
    fileType: 'pdf',
    mimeType: 'application/pdf',
    category: 'wiring-diagrams',
    panelSystem: 'PXC36.1-AHU1',
    revisionNumber: 'Rev A',
    revisionDate: new Date(Date.now() - 25 * 86400000).toISOString(),
    uploadedBy: 'C. Ohara',
    notes: 'As-built wiring diagram. Note: field correction on terminals 14-16 for mixed air damper actuator.',
    tags: ['ahu-1', 'wiring', 'as-built'],
    status: 'field-verified',
    isPinned: false,
    isFavorite: true,
    isOfflineCached: false,
    currentVersionId: vWire1.id,
    versions: [vWire1],
    createdAt: new Date(Date.now() - 25 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 25 * 86400000).toISOString(),
    size: 3200000,
  });

  // Sequences
  const vSeq1 = makeVersion(fileIds.seqAhu, 1, 28, 'Original sequence from specification', 'superseded', 450000);
  const vSeq2 = makeVersion(fileIds.seqAhu, 2, 8, 'Updated with CO2 demand ventilation addendum', 'current', 520000);

  files.push({
    id: fileIds.seqAhu,
    projectId: 'proj-ahu-upgrade',
    title: 'AHU-1/2 Sequence of Operations',
    fileName: 'AHU1-2_Sequence_Rev2.pdf',
    fileType: 'pdf',
    mimeType: 'application/pdf',
    category: 'sequences',
    panelSystem: 'AHU-1, AHU-2',
    revisionNumber: 'Rev 2',
    revisionDate: new Date(Date.now() - 8 * 86400000).toISOString(),
    uploadedBy: 'D. Kim',
    notes: 'Updated sequence includes CO2 demand ventilation logic per addendum #3. Economizer free cooling setpoints changed.',
    tags: ['ahu-1', 'ahu-2', 'sequence', 'co2-demand'],
    status: 'current',
    isPinned: false,
    isFavorite: false,
    isOfflineCached: true,
    currentVersionId: vSeq2.id,
    versions: [vSeq1, vSeq2],
    createdAt: new Date(Date.now() - 28 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 8 * 86400000).toISOString(),
    size: 520000,
  });

  // IP Plan doc
  const vIp1 = makeVersion(fileIds.ipPlanDoc, 1, 29, 'IP plan from network design meeting', 'current', 180000);
  files.push({
    id: fileIds.ipPlanDoc,
    projectId: 'proj-ahu-upgrade',
    title: 'BAS Network IP Plan',
    fileName: 'BAS_IP_Plan_VLAN40.xlsx',
    fileType: 'xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    category: 'ip-plan',
    revisionNumber: 'Rev 1',
    revisionDate: new Date(Date.now() - 29 * 86400000).toISOString(),
    uploadedBy: 'C. Ohara',
    notes: 'IP addressing plan for VLAN 40. Coordinated with IT dept.',
    tags: ['network', 'ip-plan', 'vlan-40'],
    status: 'current',
    isPinned: false,
    isFavorite: false,
    isOfflineCached: false,
    currentVersionId: vIp1.id,
    versions: [vIp1],
    createdAt: new Date(Date.now() - 29 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 29 * 86400000).toISOString(),
    size: 180000,
  });

  // Device List doc
  const vDev1 = makeVersion(fileIds.deviceListDoc, 1, 26, 'Initial device list from submittals', 'current', 95000);
  files.push({
    id: fileIds.deviceListDoc,
    projectId: 'proj-ahu-upgrade',
    title: 'BAS Device List',
    fileName: 'Device_List_AHU_Upgrade.csv',
    fileType: 'csv',
    mimeType: 'text/csv',
    category: 'device-list',
    revisionNumber: 'Rev 1',
    revisionDate: new Date(Date.now() - 26 * 86400000).toISOString(),
    uploadedBy: 'C. Ohara',
    notes: 'Complete device list for AHU-1 and AHU-2 upgrade scope.',
    tags: ['device-list', 'ahu-1', 'ahu-2'],
    status: 'current',
    isPinned: false,
    isFavorite: false,
    isOfflineCached: false,
    currentVersionId: vDev1.id,
    versions: [vDev1],
    createdAt: new Date(Date.now() - 26 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 26 * 86400000).toISOString(),
    size: 95000,
  });

  // Backups
  const vBk1 = makeVersion(fileIds.backupAhu1, 1, 3, 'Pre-startup full panel backup', 'current', 5200000);
  files.push({
    id: fileIds.backupAhu1,
    projectId: 'proj-ahu-upgrade',
    title: 'AHU-1 Panel Backup - Pre-Startup',
    fileName: 'PXC36-AHU1_BACKUP_20240302.zip',
    fileType: 'zip',
    mimeType: 'application/zip',
    category: 'backups',
    panelSystem: 'PXC36.1-AHU1',
    revisionNumber: 'Snapshot 1',
    revisionDate: new Date(Date.now() - 3 * 86400000).toISOString(),
    uploadedBy: 'C. Ohara',
    notes: 'Full panel backup taken before startup commissioning. Contains database, trends config, and schedules.',
    tags: ['ahu-1', 'backup', 'pre-startup'],
    status: 'backup-snapshot',
    isPinned: true,
    isFavorite: false,
    isOfflineCached: true,
    currentVersionId: vBk1.id,
    versions: [vBk1],
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    size: 5200000,
  });

  const vBk2 = makeVersion(fileIds.backupAhu2, 1, 5, 'Pre-startup full panel backup', 'current', 4800000);
  files.push({
    id: fileIds.backupAhu2,
    projectId: 'proj-ahu-upgrade',
    title: 'AHU-2 Panel Backup - Pre-Startup',
    fileName: 'PXC36-AHU2_BACKUP_20240228.zip',
    fileType: 'zip',
    mimeType: 'application/zip',
    category: 'backups',
    panelSystem: 'PXC36.1-AHU2',
    revisionNumber: 'Snapshot 1',
    revisionDate: new Date(Date.now() - 5 * 86400000).toISOString(),
    uploadedBy: 'C. Ohara',
    notes: 'Full panel backup before startup.',
    tags: ['ahu-2', 'backup', 'pre-startup'],
    status: 'backup-snapshot',
    isPinned: false,
    isFavorite: false,
    isOfflineCached: false,
    currentVersionId: vBk2.id,
    versions: [vBk2],
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    size: 4800000,
  });

  // Field Notes
  const notes: FieldNote[] = [
    {
      id: uuid(),
      projectId: 'proj-ahu-upgrade',
      content: 'Mixed air damper actuator on AHU-1 wired to wrong terminals (14-16 should be 17-19). Corrected in field and updated wiring diagram. Actuator now stroking correctly 0-100%.',
      category: 'fix',
      author: 'C. Ohara',
      isPinned: true,
      createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
      tags: ['ahu-1', 'wiring', 'damper'],
    },
    {
      id: uuid(),
      projectId: 'proj-ahu-upgrade',
      content: 'Customer requesting after-hours scheduling capability for weekend events. Need to add holiday/special event schedule to both AHU controllers. Discussed with Linda Park.',
      category: 'customer-request',
      author: 'C. Ohara',
      isPinned: false,
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      tags: ['scheduling', 'customer'],
    },
    {
      id: uuid(),
      projectId: 'proj-ahu-upgrade',
      content: 'TAB contractor (Mike Torres) scheduled for next Tuesday 3/12. Need both AHUs running in occupied mode by 7 AM. Verify all damper actuators are responding before TAB arrives.',
      category: 'startup-note',
      author: 'C. Ohara',
      isPinned: true,
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      tags: ['tab', 'startup', 'scheduling'],
    },
    {
      id: uuid(),
      projectId: 'proj-ahu-upgrade',
      content: 'Discharge air temperature sensor on AHU-2 reading 5°F high compared to handheld. Sensor may need recalibration or replacement. Punch item created.',
      category: 'punch-item',
      author: 'C. Ohara',
      isPinned: false,
      createdAt: new Date(Date.now() - 6 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 6 * 86400000).toISOString(),
      tags: ['ahu-2', 'sensor', 'calibration'],
    },
    {
      id: uuid(),
      projectId: 'proj-ahu-upgrade',
      content: 'Switched PXC36-AHU1 from DHCP to static IP 10.40.1.10. Updated IP plan document. Controller is now reachable from Desigo CC workstation.',
      category: 'network-change',
      author: 'C. Ohara',
      isPinned: false,
      createdAt: new Date(Date.now() - 12 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 12 * 86400000).toISOString(),
      tags: ['network', 'ip-change', 'ahu-1'],
    },
    {
      id: uuid(),
      projectId: 'proj-lab-reno',
      content: 'Lab pressure differential holding at -0.03" WC as designed. Verified with Dwyer manometer. All 12 VAV boxes commissioned and trending.',
      category: 'startup-note',
      author: 'D. Kim',
      isPinned: true,
      createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
      tags: ['pressure', 'lab', 'commissioning'],
    },
  ];

  // Devices for AHU project
  const devices: DeviceEntry[] = [
    { id: uuid(), projectId: 'proj-ahu-upgrade', deviceName: 'PXC36.1-AHU1', description: 'AHU-1 Main Controller', system: 'AHU-1', panel: 'MCP-104A', controllerType: 'PXC36 Modular', macAddress: '00:10:AC:3F:A1:01', instanceNumber: '101', ipAddress: '10.40.1.10', floor: '1', area: 'Mech Room 104', status: 'Online', notes: 'Replaced legacy P2 controller' },
    { id: uuid(), projectId: 'proj-ahu-upgrade', deviceName: 'PXC36.1-AHU2', description: 'AHU-2 Main Controller', system: 'AHU-2', panel: 'MCP-104B', controllerType: 'PXC36 Modular', macAddress: '00:10:AC:3F:A1:02', instanceNumber: '102', ipAddress: '10.40.1.11', floor: '1', area: 'Mech Room 104', status: 'Online', notes: 'Replaced legacy P2 controller' },
    { id: uuid(), projectId: 'proj-ahu-upgrade', deviceName: 'NAE-CP-01', description: 'Network Automation Engine', system: 'BAS Network', panel: 'IT-MDF', controllerType: 'PXC100 NAE', macAddress: '00:10:AC:3F:A1:00', instanceNumber: '100', ipAddress: '10.40.1.1', floor: '1', area: 'IT Room', status: 'Online', notes: 'Existing NAE retained, firmware updated to 4.12' },
    { id: uuid(), projectId: 'proj-ahu-upgrade', deviceName: 'SF-AHU1', description: 'AHU-1 Supply Fan VFD', system: 'AHU-1', panel: 'MCP-104A', controllerType: 'Siemens VFD', macAddress: '', instanceNumber: '201', ipAddress: '', floor: '1', area: 'Mech Room 104', status: 'Online', notes: 'BACnet MSTP address 1' },
    { id: uuid(), projectId: 'proj-ahu-upgrade', deviceName: 'RF-AHU1', description: 'AHU-1 Return Fan VFD', system: 'AHU-1', panel: 'MCP-104A', controllerType: 'Siemens VFD', macAddress: '', instanceNumber: '202', ipAddress: '', floor: '1', area: 'Mech Room 104', status: 'Online', notes: 'BACnet MSTP address 2' },
    { id: uuid(), projectId: 'proj-ahu-upgrade', deviceName: 'SF-AHU2', description: 'AHU-2 Supply Fan VFD', system: 'AHU-2', panel: 'MCP-104B', controllerType: 'Siemens VFD', macAddress: '', instanceNumber: '203', ipAddress: '', floor: '1', area: 'Mech Room 104', status: 'Online', notes: 'BACnet MSTP address 3' },
    { id: uuid(), projectId: 'proj-ahu-upgrade', deviceName: 'DAT-AHU1', description: 'AHU-1 Discharge Air Temp Sensor', system: 'AHU-1', panel: 'MCP-104A', controllerType: 'QAM2120', ipAddress: '', floor: '1', area: 'AHU-1 Discharge', status: 'Online', notes: 'Calibrated 3/1' },
    { id: uuid(), projectId: 'proj-ahu-upgrade', deviceName: 'DAT-AHU2', description: 'AHU-2 Discharge Air Temp Sensor', system: 'AHU-2', panel: 'MCP-104B', controllerType: 'QAM2120', ipAddress: '', floor: '1', area: 'AHU-2 Discharge', status: 'Issue', notes: 'Reading 5°F high - punch item' },
    { id: uuid(), projectId: 'proj-ahu-upgrade', deviceName: 'CO2-RA-AHU1', description: 'AHU-1 Return Air CO2 Sensor', system: 'AHU-1', panel: 'MCP-104A', controllerType: 'QPM2100', ipAddress: '', floor: '1', area: 'Return Air Plenum', status: 'Online', notes: 'Demand ventilation input' },
    { id: uuid(), projectId: 'proj-ahu-upgrade', deviceName: 'MAD-AHU1', description: 'AHU-1 Mixed Air Damper Actuator', system: 'AHU-1', panel: 'MCP-104A', controllerType: 'GDB161.1E', ipAddress: '', floor: '1', area: 'AHU-1 Mixed Air Section', status: 'Online', notes: 'Rewired in field - see notes' },
  ];

  // IP Plan entries
  const ipEntries: IpPlanEntry[] = [
    { id: uuid(), projectId: 'proj-ahu-upgrade', ipAddress: '10.40.1.1', hostname: 'NAE-CP-01', panel: 'IT-MDF', vlan: '40', subnet: '10.40.1.0/24', deviceRole: 'Network Controller / BBMD', macAddress: '00:10:AC:3F:A1:00', notes: 'Gateway / BBMD for VLAN 40', status: 'active' },
    { id: uuid(), projectId: 'proj-ahu-upgrade', ipAddress: '10.40.1.10', hostname: 'PXC36-AHU1', panel: 'MCP-104A', vlan: '40', subnet: '10.40.1.0/24', deviceRole: 'Field Controller', macAddress: '00:10:AC:3F:A1:01', notes: 'AHU-1 controller - static IP', status: 'active' },
    { id: uuid(), projectId: 'proj-ahu-upgrade', ipAddress: '10.40.1.11', hostname: 'PXC36-AHU2', panel: 'MCP-104B', vlan: '40', subnet: '10.40.1.0/24', deviceRole: 'Field Controller', macAddress: '00:10:AC:3F:A1:02', notes: 'AHU-2 controller - static IP', status: 'active' },
    { id: uuid(), projectId: 'proj-ahu-upgrade', ipAddress: '10.40.1.50', hostname: 'DESIGO-WS-01', panel: 'IT-MDF', vlan: '40', subnet: '10.40.1.0/24', deviceRole: 'Workstation', notes: 'Desigo CC operator workstation', status: 'active' },
    { id: uuid(), projectId: 'proj-ahu-upgrade', ipAddress: '10.40.1.100', hostname: 'RESERVED', panel: '-', vlan: '40', subnet: '10.40.1.0/24', deviceRole: 'Reserved', notes: 'Reserved for future expansion', status: 'reserved' },
    { id: uuid(), projectId: 'proj-ahu-upgrade', ipAddress: '10.40.1.101', hostname: 'RESERVED', panel: '-', vlan: '40', subnet: '10.40.1.0/24', deviceRole: 'Reserved', notes: 'Reserved for future expansion', status: 'reserved' },
  ];

  // Activity log
  const activityLog: ActivityLogEntry[] = [
    { id: uuid(), projectId: 'proj-ahu-upgrade', action: 'File uploaded', details: 'AHU-1 Panel Database Rev 3 uploaded', timestamp: new Date(Date.now() - 2 * 86400000).toISOString(), user: 'C. Ohara', fileId: fileIds.ahuDb1 },
    { id: uuid(), projectId: 'proj-ahu-upgrade', action: 'Note added', details: 'Mixed air damper wiring correction noted', timestamp: new Date(Date.now() - 4 * 86400000).toISOString(), user: 'C. Ohara' },
    { id: uuid(), projectId: 'proj-ahu-upgrade', action: 'File uploaded', details: 'AHU-1/2 Sequence Rev 2 uploaded', timestamp: new Date(Date.now() - 8 * 86400000).toISOString(), user: 'D. Kim', fileId: fileIds.seqAhu },
    { id: uuid(), projectId: 'proj-ahu-upgrade', action: 'Status changed', details: 'AHU-1 Wiring Diagram marked as Field Verified', timestamp: new Date(Date.now() - 10 * 86400000).toISOString(), user: 'C. Ohara', fileId: fileIds.wiringAhu1 },
    { id: uuid(), projectId: 'proj-ahu-upgrade', action: 'Project created', details: 'Project 44OP-001847 created', timestamp: new Date(Date.now() - 30 * 86400000).toISOString(), user: 'C. Ohara' },
  ];

  return { projects, files, notes, devices, ipEntries, activityLog };
}
