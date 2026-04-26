/**
 * RM Workspace (CRM Phase 4)
 *
 * Relationship Manager landing page with:
 *   - Count tiles: My Leads, My Prospects, Meetings Today, Pending Tasks, Pipeline Value
 *   - Quick actions row: Add Lead, Add Prospect, Schedule Meeting, File Call Report
 *   - Recent activity feed (placeholder mock data)
 *   - Pipeline summary mini-chart (div-based bar chart)
 */

import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@ui/components/ui/card';
import { Button } from '@ui/components/ui/button';
import { Badge } from '@ui/components/ui/badge';
import {
  Users, UserPlus, Calendar, FileText, DollarSign,
  Plus, ClipboardList, TrendingUp, Phone, CheckCircle,
  ArrowRight, Clock, MessageSquare,
} from 'lucide-react';
import { fetcher } from '@/lib/api';

/* ---------- Interfaces ---------- */

interface WorkspaceStats {
  my_leads: number;
  my_prospects: number;
  meetings_today: number;
  pending_tasks: number;
  pipeline_value: number;
  pipeline_currency: string;
}

interface PipelineSummary {
  new: number;
  contacted: number;
  qualified: number;
  client_accepted: number;
  converted: number;
}

/* ---------- Mock activity data ---------- */

// TODO: Replace mock activity data with real API call
const MOCK_ACTIVITIES = [
  { id: 1, type: 'LEAD_CREATED', description: 'New lead Maria Santos created via referral', time: '10 min ago', icon: UserPlus, color: 'text-blue-600 dark:text-blue-400' },
  { id: 2, type: 'MEETING_SCHEDULED', description: 'Meeting with Jose Reyes scheduled for today 2:00 PM', time: '25 min ago', icon: Calendar, color: 'text-green-600 dark:text-green-400' },
  { id: 3, type: 'CALL_REPORT', description: 'Call report filed for Carlos Tan - interested in UITF', time: '1 hr ago', icon: Phone, color: 'text-yellow-600 dark:text-yellow-400' },
  { id: 4, type: 'STATUS_CHANGE', description: 'Lead Ana Cruz status changed to QUALIFIED', time: '2 hrs ago', icon: CheckCircle, color: 'text-orange-600 dark:text-orange-400' },
  { id: 5, type: 'PROSPECT_CONVERTED', description: 'Prospect Miguel Lim converted to client', time: '3 hrs ago', icon: ArrowRight, color: 'text-purple-600 dark:text-purple-400' },
  { id: 6, type: 'TASK_COMPLETED', description: 'Follow-up task for Patricia Garcia completed', time: '4 hrs ago', icon: ClipboardList, color: 'text-green-600 dark:text-green-400' },
  { id: 7, type: 'LEAD_CREATED', description: 'New lead David Tan imported from campaign "Q2 Event"', time: '5 hrs ago', icon: UserPlus, color: 'text-blue-600 dark:text-blue-400' },
  { id: 8, type: 'MEETING_SCHEDULED', description: 'Follow-up meeting with ABC Corp scheduled', time: 'Yesterday', icon: Calendar, color: 'text-green-600 dark:text-green-400' },
  { id: 9, type: 'MESSAGE_SENT', description: 'Product brochure sent to Rosa Mendoza', time: 'Yesterday', icon: MessageSquare, color: 'text-cyan-600 dark:text-cyan-400' },
  { id: 10, type: 'STATUS_CHANGE', description: 'Lead Ben Torres status changed to CLIENT_ACCEPTED', time: 'Yesterday', icon: TrendingUp, color: 'text-green-600 dark:text-green-400' },
];

/* ---------- Component ---------- */

export default function RmWorkspace() {
  const navigate = useNavigate();

  /* ---- Queries ---- */

  const { data: stats, isPending: statsPending, isError: statsError } = useQuery<WorkspaceStats>({
    queryKey: ['rm-workspace-stats'],
    queryFn: () => fetcher('/api/v1/leads/workspace-stats'),
    refetchInterval: 30000,
  });

  const { data: pipeline, isPending: pipelinePending, isError: pipelineError } = useQuery<PipelineSummary>({
    queryKey: ['rm-pipeline-summary'],
    queryFn: () => fetcher('/api/v1/leads/pipeline-summary'),
    refetchInterval: 30000,
  });

  /* ---- KPI tiles ---- */

  const kpiTiles = [
    {
      label: 'My Leads',
      value: stats?.my_leads ?? 0,
      icon: Users,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-950',
    },
    {
      label: 'My Prospects',
      value: stats?.my_prospects ?? 0,
      icon: UserPlus,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-950',
    },
    {
      label: 'Meetings Today',
      value: stats?.meetings_today ?? 0,
      icon: Calendar,
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-50 dark:bg-orange-950',
    },
    {
      label: 'Pending Tasks',
      value: stats?.pending_tasks ?? 0,
      icon: ClipboardList,
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-50 dark:bg-yellow-950',
    },
    {
      label: 'Pipeline Value',
      value: stats?.pipeline_value
        ? `${stats.pipeline_currency || 'PHP'} ${(stats.pipeline_value / 1_000_000).toFixed(1)}M`
        : 'PHP 0',
      icon: DollarSign,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-950',
    },
  ];

  /* ---- Quick actions ---- */

  const quickActions = [
    { label: 'Add Lead', icon: Plus, path: '/crm/leads/new', variant: 'default' as const },
    { label: 'Add Prospect', icon: UserPlus, path: '/crm/prospects/new', variant: 'outline' as const },
    { label: 'Schedule Meeting', icon: Calendar, path: '/crm/meetings', variant: 'outline' as const },
    { label: 'File Call Report', icon: FileText, path: '/crm/call-reports/new', variant: 'outline' as const },
  ];

  /* ---- Pipeline chart helpers ---- */

  function getPipelineData(): { label: string; value: number; color: string }[] {
    const p = pipeline ?? { new: 0, contacted: 0, qualified: 0, client_accepted: 0, converted: 0 };
    return [
      { label: 'New', value: p.new, color: 'bg-blue-500 dark:bg-blue-400' },
      { label: 'Contacted', value: p.contacted, color: 'bg-yellow-500 dark:bg-yellow-400' },
      { label: 'Qualified', value: p.qualified, color: 'bg-orange-500 dark:bg-orange-400' },
      { label: 'Accepted', value: p.client_accepted, color: 'bg-green-500 dark:bg-green-400' },
      { label: 'Converted', value: p.converted, color: 'bg-purple-500 dark:bg-purple-400' },
    ];
  }

  const pipelineData = getPipelineData();
  const maxPipelineValue = Math.max(...pipelineData.map((d) => d.value), 1);

  /* ---------- Error state ---------- */

  if (statsError || pipelineError) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive">
        <p>Failed to load data. Please try again.</p>
      </div>
    );
  }

  /* ---------- Render ---------- */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">RM Workspace</h1>
        <p className="text-muted-foreground">
          Your relationship management command center
        </p>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {statsPending
          ? Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                </CardHeader>
                <CardContent>
                  <div className="h-8 w-16 animate-pulse rounded bg-muted" />
                </CardContent>
              </Card>
            ))
          : kpiTiles.map((tile: typeof kpiTiles[number]) => (
              <Card key={tile.label} className={tile.bgColor}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">{tile.label}</CardTitle>
                  <tile.icon className={`h-4 w-4 ${tile.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{tile.value}</div>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {quickActions.map((action: typeof quickActions[number]) => (
              <Button
                key={action.label}
                variant={action.variant}
                onClick={() => navigate(action.path)}
              >
                <action.icon className="mr-2 h-4 w-4" />
                {action.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Two-column layout: Pipeline Chart + Recent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pipeline Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pipeline Summary</CardTitle>
          </CardHeader>
          <CardContent>
            {pipelinePending ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="space-y-1">
                    <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                    <div className="h-6 w-full animate-pulse rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {pipelineData.map((item: typeof pipelineData[number]) => (
                  <div key={item.label} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{item.label}</span>
                      <span className="font-mono text-muted-foreground">{item.value}</span>
                    </div>
                    <div className="h-6 w-full rounded-md bg-muted overflow-hidden">
                      <div
                        className={`h-full ${item.color} rounded-md transition-all duration-500`}
                        style={{ width: `${Math.max((item.value / maxPipelineValue) * 100, 2)}%` }}
                      />
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">Total Pipeline</span>
                    <span className="font-mono font-semibold">
                      {pipelineData.reduce((sum, d) => sum + d.value, 0)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {MOCK_ACTIVITIES.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 rounded-md border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className={`mt-0.5 ${activity.color}`}>
                    <activity.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{activity.description}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <Clock className="h-3 w-3" /> {activity.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
