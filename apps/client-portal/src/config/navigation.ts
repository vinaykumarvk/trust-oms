/**
 * Client Portal Navigation Configuration
 *
 * Defines the sidebar navigation items for the client self-service portal.
 */

export interface ClientNavItem {
  label: string;
  path: string;
  icon: string;
}

export const clientNavItems: ClientNavItem[] = [
  { label: 'Dashboard', path: '/', icon: 'LayoutDashboard' },
  { label: 'Portfolio', path: '/portfolio', icon: 'Briefcase' },
  { label: 'Performance', path: '/performance', icon: 'TrendingUp' },
  { label: 'Statements', path: '/statements', icon: 'FileText' },
  { label: 'Campaign Inbox', path: '/campaign-inbox', icon: 'Megaphone' },
  { label: 'Messages', path: '/messages', icon: 'MessageSquare' },
  { label: 'Risk Profile', path: '/risk-profile', icon: 'Compass' },
  { label: 'Proposals', path: '/proposals', icon: 'FileSpreadsheet' },
  { label: 'Service Requests', path: '/service-requests', icon: 'ClipboardList' },
  { label: 'Preferences', path: '/preferences', icon: 'Settings' },
];
