import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Button } from '@ui/components/ui/button';
import { Badge } from '@ui/components/ui/badge';
import { Input } from '@ui/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@ui/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@ui/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/ui/tabs';
import { toast } from 'sonner';
import { Radio, AlertTriangle, CheckCircle, XCircle, Plus, Gauge } from 'lucide-react';

const API = '/api/v1/degraded-mode';
function fetcher(url: string) { return fetch(url).then(r => r.json()); }

export default function DegradedModeMonitor() {
  const queryClient = useQueryClient();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportData, setReportData] = useState({ failedComponent: '', fallbackPath: '' });

  const { data: feedHealth } = useQuery({ queryKey: ['feed-health'], queryFn: () => fetcher(`${API}/feed-health`), refetchInterval: 15000 });
  const { data: activeIncidents } = useQuery({ queryKey: ['active-incidents'], queryFn: () => fetcher(`${API}/active`), refetchInterval: 10000 });
  const { data: history } = useQuery({ queryKey: ['incident-history'], queryFn: () => fetcher(`${API}/history`) });
  const { data: kpi } = useQuery({ queryKey: ['degraded-kpi'], queryFn: () => fetcher(`${API}/kpi/${new Date().getFullYear()}`) });

  const reportMutation = useMutation({
    mutationFn: (data: typeof reportData) => fetch(`${API}/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['active-incidents'] }); queryClient.invalidateQueries({ queryKey: ['incident-history'] }); setReportOpen(false); toast.success('Incident reported'); },
  });

  const resolveMutation = useMutation({
    mutationFn: (incidentId: string) => fetch(`${API}/${incidentId}/resolve`, { method: 'PUT' }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['active-incidents'] }); queryClient.invalidateQueries({ queryKey: ['incident-history'] }); toast.success('Incident resolved'); },
  });

  const statusIcon = (status: string) => status === 'UP' ? <CheckCircle className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-red-500" />;
  const statusColor = (status: string) => status === 'UP' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';

  return (
    <div className="space-y-6">
      {activeIncidents?.hasActiveIncident && (
        <div className="rounded-lg border-2 border-red-500 bg-red-50 p-4 flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-red-600 animate-pulse" />
          <div>
            <p className="font-semibold text-red-800">DEGRADED MODE ACTIVE</p>
            <p className="text-sm text-red-600">{activeIncidents.data.length} active incident(s) — some feeds may be unavailable</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Feed & Degraded Mode Monitor</h1>
          <p className="text-muted-foreground">Business continuity — feed health and incident management</p>
        </div>
        <Dialog open={reportOpen} onOpenChange={setReportOpen}>
          <DialogTrigger asChild><Button variant="destructive" size="sm"><Plus className="mr-2 h-4 w-4" /> Report Incident</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Report Feed Incident</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Select value={reportData.failedComponent} onValueChange={v => setReportData({ ...reportData, failedComponent: v })}>
                <SelectTrigger><SelectValue placeholder="Failed Component" /></SelectTrigger>
                <SelectContent>
                  {['BLOOMBERG', 'REUTERS', 'DTCC', 'PDTC', 'SWIFT', 'AI', 'DB'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Fallback path / actions taken" value={reportData.fallbackPath} onChange={e => setReportData({ ...reportData, fallbackPath: e.target.value })} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setReportOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={() => reportMutation.mutate(reportData)} disabled={!reportData.failedComponent || !reportData.fallbackPath}>Report</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="flex items-center gap-3 pt-6"><Radio className="h-8 w-8 text-green-600" /><div><p className="text-2xl font-bold">{feedHealth?.feeds?.filter((f: any) => f.status === 'UP').length || 0}/{feedHealth?.feeds?.length || 5}</p><p className="text-sm text-muted-foreground">Feeds Online</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-6"><AlertTriangle className="h-8 w-8 text-red-600" /><div><p className="text-2xl font-bold">{activeIncidents?.data?.length || 0}</p><p className="text-sm text-muted-foreground">Active Incidents</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-6"><Gauge className="h-8 w-8 text-blue-600" /><div><p className="text-2xl font-bold">{kpi?.degradedModeDays || 0}</p><p className="text-sm text-muted-foreground">Degraded Days ({new Date().getFullYear()})</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-6"><CheckCircle className="h-8 w-8 text-green-600" /><div><p className="text-2xl font-bold">{kpi?.target || 3}</p><p className="text-sm text-muted-foreground">Target (Max Days)</p></div></CardContent></Card>
      </div>

      <Tabs defaultValue="feeds">
        <TabsList>
          <TabsTrigger value="feeds">Feed Health</TabsTrigger>
          <TabsTrigger value="incidents">Active Incidents</TabsTrigger>
          <TabsTrigger value="history">Incident History</TabsTrigger>
        </TabsList>

        <TabsContent value="feeds" className="mt-4">
          <div className="grid grid-cols-5 gap-4">
            {feedHealth?.feeds?.map((feed: any) => (
              <Card key={feed.name} className={`border-2 ${feed.status === 'UP' ? 'border-green-200' : 'border-red-300'}`}>
                <CardContent className="pt-6 text-center space-y-2">
                  {statusIcon(feed.status)}
                  <p className="font-bold">{feed.name}</p>
                  <Badge className={statusColor(feed.status)}>{feed.status}</Badge>
                  <p className="text-xs text-muted-foreground">{feed.latencyMs}ms latency</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="incidents" className="mt-4">
          <Table>
            <TableHeader><TableRow><TableHead>Incident ID</TableHead><TableHead>Component</TableHead><TableHead>Started</TableHead><TableHead>Fallback</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {(!activeIncidents?.data || activeIncidents.data.length === 0) && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No active incidents</TableCell></TableRow>}
              {activeIncidents?.data?.map((inc: any) => (
                <TableRow key={inc.incident_id}>
                  <TableCell className="font-mono text-sm">{inc.incident_id}</TableCell>
                  <TableCell><Badge className="bg-red-100 text-red-800">{inc.failed_component}</Badge></TableCell>
                  <TableCell>{inc.started_at ? new Date(inc.started_at).toLocaleString() : '—'}</TableCell>
                  <TableCell>{inc.fallback_path}</TableCell>
                  <TableCell><Button variant="outline" size="sm" onClick={() => resolveMutation.mutate(inc.incident_id)}>Resolve</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Table>
            <TableHeader><TableRow><TableHead>Incident ID</TableHead><TableHead>Component</TableHead><TableHead>Started</TableHead><TableHead>Ended</TableHead><TableHead>RCA</TableHead></TableRow></TableHeader>
            <TableBody>
              {(!history?.data || history.data.length === 0) && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No incident history</TableCell></TableRow>}
              {history?.data?.map((inc: any) => (
                <TableRow key={inc.incident_id}>
                  <TableCell className="font-mono text-sm">{inc.incident_id}</TableCell>
                  <TableCell><Badge>{inc.failed_component}</Badge></TableCell>
                  <TableCell>{inc.started_at ? new Date(inc.started_at).toLocaleString() : '—'}</TableCell>
                  <TableCell>{inc.ended_at ? new Date(inc.ended_at).toLocaleString() : 'Ongoing'}</TableCell>
                  <TableCell><Badge className={inc.rca_completed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>{inc.rca_completed ? 'Complete' : 'Pending'}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
}
