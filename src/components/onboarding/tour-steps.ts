export interface TourStep {
  id: string;
  target: string; // data-tour attribute selector
  title: string;
  content: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
  route?: string; // navigate here before showing step
  action?: 'open-sidebar'; // special actions
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    target: '[data-tour="sidebar-logo"]',
    title: 'Welcome to BAU Suite',
    content: 'Your portable project toolkit for Building Automation Systems. Let\'s take a quick tour of the key features.',
    placement: 'right',
    route: '/',
    action: 'open-sidebar',
  },
  {
    id: 'dashboard',
    target: '[data-tour="quick-actions"]',
    title: 'Quick Actions',
    content: 'Jump to common tasks — create projects, upload files, add notes, or check offline files.',
    placement: 'bottom',
    route: '/',
  },
  {
    id: 'upload-btn',
    target: '[data-tour="upload-button"]',
    title: 'Quick Upload',
    content: 'Upload documents from anywhere in the app. Assign to a project or send to the uploads inbox for later.',
    placement: 'bottom',
  },
  {
    id: 'search-btn',
    target: '[data-tour="search-button"]',
    title: 'Global Search',
    content: 'Search across all projects, files, devices, IP entries, and notes. Use Cmd+K (or Ctrl+K) as a shortcut.',
    placement: 'bottom',
  },
  {
    id: 'nav-projects',
    target: '[data-tour="nav-projects"]',
    title: 'Projects',
    content: 'Create and manage BAS projects. Each project holds files, devices, IP plans, notes, and contacts.',
    placement: 'right',
    action: 'open-sidebar',
  },
  {
    id: 'nav-reports',
    target: '[data-tour="nav-reports"]',
    title: 'Daily Reports',
    content: 'Record structured daily field reports tied to a project. Track work completed, issues, coordination notes, and equipment status — then export via Teams, Outlook, PDF, or share package.',
    placement: 'right',
    action: 'open-sidebar',
  },
  {
    id: 'nav-terminal',
    target: '[data-tour="nav-terminal"]',
    title: 'Telnet HMI Tool',
    content: 'Connect to BAS controllers via a browser-based terminal. Log session output, export to .txt, and attach logs to projects. Supports multiple sessions in tabs.',
    placement: 'right',
    action: 'open-sidebar',
  },
  {
    id: 'nav-inbox',
    target: '[data-tour="nav-documents"]',
    title: 'Uploads Inbox',
    content: 'Documents uploaded without a project assignment land here. Assign them to projects whenever you\'re ready.',
    placement: 'right',
    action: 'open-sidebar',
  },
  {
    id: 'nav-offline',
    target: '[data-tour="nav-offline"]',
    title: 'Offline & Pinned',
    content: 'Pin projects for offline access. All data is stored locally — perfect for job sites without Wi-Fi.',
    placement: 'right',
    action: 'open-sidebar',
  },
  {
    id: 'nav-settings',
    target: '[data-tour="nav-settings"]',
    title: 'Settings',
    content: 'Switch themes, manage storage, clear caches, and install the app as a PWA for a native experience.',
    placement: 'right',
    action: 'open-sidebar',
  },
  {
    id: 'theme-switcher',
    target: '[data-tour="theme-switcher"]',
    title: 'Theme Switching',
    content: 'Toggle between light, dark, and system themes. Dark mode is great for mechanical rooms and low-light fieldwork.',
    placement: 'bottom',
  },
  {
    id: 'notepad-fab',
    target: '[data-tour="notepad-fab"]',
    title: 'Sticky Notepad',
    content: 'A quick-access scratchpad available from any page. Jot down IP addresses, device numbers, commands, or reminders — notes persist across navigation and offline.',
    placement: 'left',
  },
  {
    id: 'nav-help',
    target: '[data-tour="nav-help"]',
    title: 'Help & Guides',
    content: 'Find feature guides, FAQs, troubleshooting tips, and replay this tour anytime from the Help page.',
    placement: 'right',
    action: 'open-sidebar',
  },
  {
    id: 'complete',
    target: '[data-tour="sidebar-logo"]',
    title: 'You\'re All Set!',
    content: 'Start by creating a project or uploading a document. You can replay this tour anytime from Help or Settings.',
    placement: 'right',
    action: 'open-sidebar',
  },
];
