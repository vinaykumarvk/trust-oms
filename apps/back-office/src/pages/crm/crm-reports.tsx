/**
 * CRM Management Reports Dashboard
 *
 * Provides 6 reports: RM Productivity, Campaign Performance, Pipeline,
 * Conversion Funnel, Prospect Ageing, and SLA Compliance.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@ui/components/ui/card';
import { Button } from '@ui/components/ui/button';
import { Badge } from '@ui/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@ui/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@ui/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/ui/tabs';
import {
  BarChart3, Users, TrendingUp, Target, Clock, Download,
  Megaphone, PieChart, Activity,
} from 'lucide-react';

function getToken(): string {
  try {
    const stored = localStorage.getItem('trustoms-user');
    if (stored) return JSON.parse(stored).token || '';
  } catch { /* ignore */ }
  return '';
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

function fetcher(url: string) {
  return fetch(url, { headers: authHeaders() }).then((r) => r.json());
}

const AGEING_BUCKETS = [
  { label: '0-30 days', color: 'bg-green-500', key: 'bucket_0_30' },
  { label: '31-60 days', color: 'bg-yellow-500', key: 'bucket_31_60' },
  { label: '61-90 days', color: 'bg-orange-500', key: 'bucket_61_90' },
  { label: '90+ days', color: 'bg-red-500', key: 'bucket_90_plus' },
];

export default function CrmReports() {
  const [activeTab, setActiveTab] = useState('productivity');

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">CRM Reports</h1>
          <p className="text-muted-foreground">Management reporting dashboards</p>
        </div>
        <Button variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="productivity">
            <Users className="mr-1 h-3 w-3" />
            RM Productivity
          </TabsTrigger>
          <TabsTrigger value="campaign">
            <Megaphone className="mr-1 h-3 w-3" />
            Campaigns
          </TabsTrigger>
          <TabsTrigger value="pipeline">
            <TrendingUp className="mr-1 h-3 w-3" />
            Pipeline
          </TabsTrigger>
          <TabsTrigger value="funnel">
            <Target className="mr-1 h-3 w-3" />
            Conversion Funnel
          </TabsTrigger>
          <TabsTrigger value="ageing">
            <Clock className="mr-1 h-3 w-3" />
            Prospect Ageing
          </TabsTrigger>
          <TabsTrigger value="sla">
            <Activity className="mr-1 h-3 w-3" />
            SLA Compliance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="productivity">
          <RmProductivityReport />
        </TabsContent>
        <TabsContent value="campaign">
          <CampaignPerformanceReport />
        </TabsContent>
        <TabsContent value="pipeline">
          <PipelineReport />
        </TabsContent>
        <TabsContent value="funnel">
          <ConversionFunnelReport />
        </TabsContent>
        <TabsContent value="ageing">
          <ProspectAgeingReport />
        </TabsContent>
        <TabsContent value="sla">
          <SlaComplianceReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RmProductivityReport() {
  const { data } = useQuery({ queryKey: ['crm-report-productivity'], queryFn: () => fetcher('/api/v1/leads?pageSize=1') });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          RM Productivity Report
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>RM Name</TableHead>
              <TableHead className="text-right">Meetings Held</TableHead>
              <TableHead className="text-right">Call Reports Filed</TableHead>
              <TableHead className="text-right">Leads Converted</TableHead>
              <TableHead className="text-right">Pipeline Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                Report data will populate when RM activity data is available
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CampaignPerformanceReport() {
  const { data } = useQuery({ queryKey: ['crm-report-campaigns'], queryFn: () => fetcher('/api/v1/campaigns?pageSize=10') });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-5 w-5" />
          Campaign Performance Report
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Leads Generated</TableHead>
              <TableHead className="text-right">Responses</TableHead>
              <TableHead className="text-right">Conversions</TableHead>
              <TableHead className="text-right">ROI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.data || data || []).slice(0, 10).map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{c.campaign_type}</Badge>
                </TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell className="text-right">—</TableCell>
              </TableRow>
            ))}
            {(!data || (Array.isArray(data) ? data.length === 0 : !data?.data?.length)) && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No campaigns found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PipelineReport() {
  const { data } = useQuery({ queryKey: ['crm-report-pipeline'], queryFn: () => fetcher('/api/v1/opportunities/dashboard') });

  const stages = data?.by_stage || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Pipeline Report
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Total Pipeline</p>
              <p className="text-2xl font-bold">
                {data?.total_pipeline_value ? `₱${Number(data.total_pipeline_value).toLocaleString()}` : '₱0'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Weighted Pipeline</p>
              <p className="text-2xl font-bold">
                {data?.weighted_pipeline_value ? `₱${Number(data.weighted_pipeline_value).toLocaleString()}` : '₱0'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Stages</p>
              <p className="text-2xl font-bold">{stages.length}</p>
            </CardContent>
          </Card>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead className="text-right">Total Value</TableHead>
              <TableHead className="text-right">Weighted Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stages.map((s: any) => (
              <TableRow key={s.stage}>
                <TableCell>
                  <Badge variant="outline">{s.stage}</Badge>
                </TableCell>
                <TableCell className="text-right">{s.count}</TableCell>
                <TableCell className="text-right">₱{Number(s.total_value).toLocaleString()}</TableCell>
                <TableCell className="text-right">₱{Number(s.weighted_value).toLocaleString()}</TableCell>
              </TableRow>
            ))}
            {stages.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  No pipeline data
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ConversionFunnelReport() {
  const { data } = useQuery({
    queryKey: ['crm-report-funnel'],
    queryFn: () => fetcher('/api/v1/conversion-history/funnel'),
  });

  const stages = [
    { label: 'Total Leads', key: 'total_leads', color: 'bg-blue-500' },
    { label: 'Qualified', key: 'qualified', color: 'bg-yellow-500' },
    { label: 'Client Accepted', key: 'client_accepted', color: 'bg-orange-500' },
    { label: 'Converted to Prospect', key: 'converted_to_prospect', color: 'bg-green-500' },
    { label: 'Recommended', key: 'recommended', color: 'bg-purple-500' },
    { label: 'Converted to Customer', key: 'converted_to_customer', color: 'bg-emerald-600' },
  ];

  const maxVal = data ? Math.max(...stages.map((s) => data[s.key] || 0), 1) : 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Conversion Funnel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {stages.map((stage) => {
          const val = data?.[stage.key] || 0;
          const width = maxVal > 0 ? (val / maxVal) * 100 : 0;
          return (
            <div key={stage.key} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>{stage.label}</span>
                <span className="font-medium">{val}</span>
              </div>
              <div className="h-6 w-full rounded bg-muted">
                <div
                  className={`h-full rounded ${stage.color} transition-all`}
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ProspectAgeingReport() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Prospect Ageing Report
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-4 mb-6">
          {AGEING_BUCKETS.map((bucket) => (
            <Card key={bucket.key}>
              <CardContent className="pt-4 text-center">
                <div className={`inline-block h-3 w-3 rounded-full ${bucket.color} mr-2`} />
                <p className="text-sm text-muted-foreground">{bucket.label}</p>
                <p className="text-2xl font-bold">—</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="text-center text-muted-foreground">
          Prospect ageing data will populate when prospects are in the system
        </p>
      </CardContent>
    </Card>
  );
}

function SlaComplianceReport() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          SLA Compliance Report
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-sm text-muted-foreground">Within SLA</p>
              <p className="text-2xl font-bold text-green-600">—</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-sm text-muted-foreground">Near Breach</p>
              <p className="text-2xl font-bold text-yellow-600">—</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-sm text-muted-foreground">Breached</p>
              <p className="text-2xl font-bold text-red-600">—</p>
            </CardContent>
          </Card>
        </div>
        <p className="text-center text-muted-foreground">
          SLA compliance data will populate when service requests are processed
        </p>
      </CardContent>
    </Card>
  );
}
