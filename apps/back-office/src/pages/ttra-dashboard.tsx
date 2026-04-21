import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@ui/components/ui/card';
import { Button } from '@ui/components/ui/button';
import { Badge } from '@ui/components/ui/badge';
import { Input } from '@ui/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@ui/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@ui/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@ui/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/ui/tabs';
import { toast } from 'sonner';
import {
  FileText, Clock, CheckCircle, AlertTriangle, XCircle, RefreshCw, Plus, Send,
} from 'lucide-react';

const API = '/api/v1/ttra';

const statusColors: Record<string, string> = {
  APPLIED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  UNDER_REVIEW: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  EXPIRED: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  RENEWAL_PENDING: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

function fetcher(url: string) {
  return fetch(url).then((r) => r.json());
}

export default function TTRADashboard() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [newApp, setNewApp] = useState({ clientId: '', treatyCountry: '', corDocumentRef: '', effectiveFrom: '', effectiveTo: '' });

  const { data: summary } = useQuery({ queryKey: ['ttra-summary'], queryFn: () => fetcher(`${API}/summary`), refetchInterval: 30000 });
  const { data: applications } = useQuery({ queryKey: ['ttra-list', statusFilter], queryFn: () => fetcher(`${API}?status=${statusFilter === 'ALL' ? '' : statusFilter}`) });
  const { data: expiring } = useQuery({ queryKey: ['ttra-expiring'], queryFn: () => fetcher(`${API}/expiring?days=60`) });

  const createMutation = useMutation({
    mutationFn: (data: typeof newApp) => fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ttra-list'] }); queryClient.invalidateQueries({ queryKey: ['ttra-summary'] }); setCreateOpen(false); toast.success('TTRA application created'); },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status, rulingNo }: { id: string; status: string; rulingNo?: string }) =>
      fetch(`${API}/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, rulingNo }) }).then((r) => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ttra-list'] }); queryClient.invalidateQueries({ queryKey: ['ttra-summary'] }); toast.success('Status updated'); },
  });

  const expiryCheckMutation = useMutation({
    mutationFn: () => fetch(`${API}/batch/expiry-check`, { method: 'POST' }).then((r) => r.json()),
    onSuccess: (data: any) => { queryClient.invalidateQueries({ queryKey: ['ttra-list'] }); toast.success(`Expiry check complete: ${data.expiredCount} expired`); },
  });

  const reminderMutation = useMutation({
    mutationFn: () => fetch(`${API}/batch/reminders`, { method: 'POST' }).then((r) => r.json()),
    onSuccess: (data: any) => toast.success(`${data.remindersSent} reminders sent`),
  });

  const summaryCards = [
    { label: 'Applied', value: summary?.applied || 0, icon: FileText, color: 'text-blue-600' },
    { label: 'Under Review', value: summary?.underReview || 0, icon: Clock, color: 'text-yellow-600' },
    { label: 'Approved', value: summary?.approved || 0, icon: CheckCircle, color: 'text-green-600' },
    { label: 'Expiring Soon', value: summary?.expiringSoon || 0, icon: AlertTriangle, color: 'text-orange-600' },
    { label: 'Expired', value: summary?.expired || 0, icon: XCircle, color: 'text-gray-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">TTRA Management</h1>
          <p className="text-muted-foreground">Tax Treaty Relief Application lifecycle management</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => expiryCheckMutation.mutate()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Run Expiry Check
          </Button>
          <Button variant="outline" size="sm" onClick={() => reminderMutation.mutate()}>
            <Send className="mr-2 h-4 w-4" /> Send Reminders
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-2 h-4 w-4" /> New Application</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create TTRA Application</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <Input placeholder="Client ID" value={newApp.clientId} onChange={(e) => setNewApp({ ...newApp, clientId: e.target.value })} />
                <Input placeholder="Treaty Country (ISO 2-letter)" maxLength={2} value={newApp.treatyCountry} onChange={(e) => setNewApp({ ...newApp, treatyCountry: e.target.value.toUpperCase() })} />
                <Input placeholder="CoR Document Reference" value={newApp.corDocumentRef} onChange={(e) => setNewApp({ ...newApp, corDocumentRef: e.target.value })} />
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-sm text-muted-foreground">Effective From</label><Input type="date" value={newApp.effectiveFrom} onChange={(e) => setNewApp({ ...newApp, effectiveFrom: e.target.value })} /></div>
                  <div><label className="text-sm text-muted-foreground">Effective To</label><Input type="date" value={newApp.effectiveTo} onChange={(e) => setNewApp({ ...newApp, effectiveTo: e.target.value })} /></div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={() => createMutation.mutate(newApp)} disabled={!newApp.clientId || !newApp.treatyCountry}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="flex items-center gap-3 pt-6">
              <card.icon className={`h-8 w-8 ${card.color}`} />
              <div>
                <p className="text-2xl font-bold">{card.value}</p>
                <p className="text-sm text-muted-foreground">{card.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all" onClick={() => setStatusFilter('ALL')}>All</TabsTrigger>
          <TabsTrigger value="applied" onClick={() => setStatusFilter('APPLIED')}>Applied</TabsTrigger>
          <TabsTrigger value="review" onClick={() => setStatusFilter('UNDER_REVIEW')}>Under Review</TabsTrigger>
          <TabsTrigger value="approved" onClick={() => setStatusFilter('APPROVED')}>Approved</TabsTrigger>
          <TabsTrigger value="expiring" onClick={() => setStatusFilter('EXPIRING')}>Expiring</TabsTrigger>
          <TabsTrigger value="expired" onClick={() => setStatusFilter('EXPIRED')}>Expired</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <ApplicationsTable
            data={applications?.data || []}
            onUpdateStatus={(id: string, status: string, rulingNo?: string) => statusMutation.mutate({ id, status, rulingNo })}
          />
        </TabsContent>
        <TabsContent value="applied" className="mt-4">
          <ApplicationsTable data={applications?.data || []} onUpdateStatus={(id: string, status: string, rulingNo?: string) => statusMutation.mutate({ id, status, rulingNo })} />
        </TabsContent>
        <TabsContent value="review" className="mt-4">
          <ApplicationsTable data={applications?.data || []} onUpdateStatus={(id: string, status: string, rulingNo?: string) => statusMutation.mutate({ id, status, rulingNo })} />
        </TabsContent>
        <TabsContent value="approved" className="mt-4">
          <ApplicationsTable data={applications?.data || []} onUpdateStatus={(id: string, status: string, rulingNo?: string) => statusMutation.mutate({ id, status, rulingNo })} />
        </TabsContent>
        <TabsContent value="expiring" className="mt-4">
          <ExpiringTable data={expiring?.data || []} />
        </TabsContent>
        <TabsContent value="expired" className="mt-4">
          <ApplicationsTable data={applications?.data || []} onUpdateStatus={(id: string, status: string, rulingNo?: string) => statusMutation.mutate({ id, status, rulingNo })} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ApplicationsTable({ data, onUpdateStatus }: { data: any[]; onUpdateStatus: (id: string, status: string, rulingNo?: string) => void }) {
  const [statusDialog, setStatusDialog] = useState<{ open: boolean; ttraId: string; currentStatus: string }>({ open: false, ttraId: '', currentStatus: '' });
  const [newStatus, setNewStatus] = useState('');
  const [rulingNo, setRulingNo] = useState('');

  const nextStatuses: Record<string, string[]> = {
    APPLIED: ['UNDER_REVIEW'],
    UNDER_REVIEW: ['APPROVED', 'REJECTED'],
    APPROVED: ['EXPIRED'],
    REJECTED: ['RENEWAL_PENDING'],
    EXPIRED: ['RENEWAL_PENDING'],
    RENEWAL_PENDING: ['APPLIED'],
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>TTRA ID</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Treaty Country</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Effective From</TableHead>
            <TableHead>Effective To</TableHead>
            <TableHead>Review Due</TableHead>
            <TableHead>BIR Ruling</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 && (
            <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No TTRA applications found</TableCell></TableRow>
          )}
          {data.map((app: any) => (
            <TableRow key={app.ttra_id}>
              <TableCell className="font-mono text-sm">{app.ttra_id}</TableCell>
              <TableCell>{app.client_id}</TableCell>
              <TableCell>{app.treaty_country}</TableCell>
              <TableCell><Badge className={statusColors[app.ttra_status] || ''}>{app.ttra_status}</Badge></TableCell>
              <TableCell>{app.effective_from}</TableCell>
              <TableCell>{app.effective_to}</TableCell>
              <TableCell>{app.next_review_due}</TableCell>
              <TableCell>{app.bir_ctrr_ruling_no || '\u2014'}</TableCell>
              <TableCell>
                <Button variant="outline" size="sm" onClick={() => { setStatusDialog({ open: true, ttraId: app.ttra_id, currentStatus: app.ttra_status }); setNewStatus(''); setRulingNo(''); }}>
                  Update Status
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={statusDialog.open} onOpenChange={(open) => setStatusDialog({ ...statusDialog, open })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update TTRA Status</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Current: <Badge className={statusColors[statusDialog.currentStatus] || ''}>{statusDialog.currentStatus}</Badge></p>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger><SelectValue placeholder="Select new status" /></SelectTrigger>
              <SelectContent>
                {(nextStatuses[statusDialog.currentStatus] || []).map((s: string) => (
                  <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {newStatus === 'APPROVED' && (
              <Input placeholder="BIR CTRR Ruling No" value={rulingNo} onChange={(e) => setRulingNo(e.target.value)} />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialog({ ...statusDialog, open: false })}>Cancel</Button>
            <Button onClick={() => { onUpdateStatus(statusDialog.ttraId, newStatus, rulingNo || undefined); setStatusDialog({ ...statusDialog, open: false }); }} disabled={!newStatus}>Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ExpiringTable({ data }: { data: any[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>TTRA ID</TableHead>
          <TableHead>Client</TableHead>
          <TableHead>Treaty Country</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead>Days Left</TableHead>
          <TableHead>Review Due</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 && (
          <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No expiring applications</TableCell></TableRow>
        )}
        {data.map((app: any) => {
          const daysLeft = Math.ceil((new Date(app.effective_to).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          return (
            <TableRow key={app.ttra_id}>
              <TableCell className="font-mono text-sm">{app.ttra_id}</TableCell>
              <TableCell>{app.client_id}</TableCell>
              <TableCell>{app.treaty_country}</TableCell>
              <TableCell>{app.effective_to}</TableCell>
              <TableCell>
                <Badge className={daysLeft <= 15 ? 'bg-red-100 text-red-800' : daysLeft <= 30 ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800'}>
                  {daysLeft}d
                </Badge>
              </TableCell>
              <TableCell>{app.next_review_due}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
