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
import { Shield, UserX, FileCheck, Clock, Plus } from 'lucide-react';

function fetcher(url: string) { return fetch(url).then(r => r.json()); }

export default function ConsentPrivacyCenter() {
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState('');
  const [searchedClient, setSearchedClient] = useState('');
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantData, setGrantData] = useState({ clientId: '', purpose: '', channelScope: ['EMAIL', 'SMS'], legalBasis: '', dpaRef: 'R.A. 10173' });

  const { data: consents } = useQuery({
    queryKey: ['consents', searchedClient],
    queryFn: () => fetcher(`/api/v1/consent/client/${searchedClient}`),
    enabled: !!searchedClient,
  });

  const { data: erasureQueue } = useQuery({
    queryKey: ['erasure-queue'],
    queryFn: () => fetcher('/api/v1/consent/erasure-queue'),
  });

  const grantMutation = useMutation({
    mutationFn: (data: typeof grantData) => fetch('/api/v1/consent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['consents'] }); setGrantOpen(false); toast.success('Consent granted'); },
  });

  const withdrawMutation = useMutation({
    mutationFn: (consentId: string) => fetch(`/api/v1/consent/${consentId}/withdraw`, { method: 'PUT' }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['consents'] }); toast.success('Consent withdrawn'); },
  });

  const erasureMutation = useMutation({
    mutationFn: (cId: string) => fetch(`/api/v1/consent/erasure/${cId}`, { method: 'POST' }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['erasure-queue'] }); toast.success('Erasure request submitted'); },
  });

  const processErasureMutation = useMutation({
    mutationFn: (cId: string) => fetch(`/api/v1/consent/erasure/${cId}/process`, { method: 'POST' }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['erasure-queue'] }); toast.success('Erasure processed'); },
  });

  const purposeColors: Record<string, string> = {
    OPERATIONAL: 'bg-blue-100 text-blue-800',
    MARKETING: 'bg-purple-100 text-purple-800',
    AUTOMATED_DECISION: 'bg-orange-100 text-orange-800',
    RESEARCH_AGGREGATE: 'bg-green-100 text-green-800',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Privacy & Consent Center</h1>
          <p className="text-muted-foreground">DPA compliance — consent management and erasure workflows</p>
        </div>
        <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" /> Grant Consent</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Grant Consent</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Input placeholder="Client ID" value={grantData.clientId} onChange={e => setGrantData({ ...grantData, clientId: e.target.value })} />
              <Select value={grantData.purpose} onValueChange={v => setGrantData({ ...grantData, purpose: v })}>
                <SelectTrigger><SelectValue placeholder="Purpose" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPERATIONAL">Operational</SelectItem>
                  <SelectItem value="MARKETING">Marketing</SelectItem>
                  <SelectItem value="AUTOMATED_DECISION">Automated Decision</SelectItem>
                  <SelectItem value="RESEARCH_AGGREGATE">Research Aggregate</SelectItem>
                </SelectContent>
              </Select>
              <Select value={grantData.legalBasis} onValueChange={v => setGrantData({ ...grantData, legalBasis: v })}>
                <SelectTrigger><SelectValue placeholder="Legal Basis" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CONSENT">Consent</SelectItem>
                  <SelectItem value="CONTRACT">Contract</SelectItem>
                  <SelectItem value="LEGAL_OBLIGATION">Legal Obligation</SelectItem>
                  <SelectItem value="LEGITIMATE_INTEREST">Legitimate Interest</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setGrantOpen(false)}>Cancel</Button>
              <Button onClick={() => grantMutation.mutate(grantData)} disabled={!grantData.clientId || !grantData.purpose || !grantData.legalBasis}>Grant</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="flex items-center gap-3 pt-6"><Shield className="h-8 w-8 text-blue-600" /><div><p className="text-2xl font-bold">{consents?.data?.length || 0}</p><p className="text-sm text-muted-foreground">Active Consents</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-6"><UserX className="h-8 w-8 text-red-600" /><div><p className="text-2xl font-bold">{erasureQueue?.total || 0}</p><p className="text-sm text-muted-foreground">Erasure Queue</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-6"><FileCheck className="h-8 w-8 text-green-600" /><div><p className="text-2xl font-bold">{consents?.data?.filter((c: any) => c.purpose === 'MARKETING' && c.granted).length || 0}</p><p className="text-sm text-muted-foreground">Marketing Consents</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-6"><Clock className="h-8 w-8 text-orange-600" /><div><p className="text-2xl font-bold">{erasureQueue?.data?.filter((e: any) => e.overdue).length || 0}</p><p className="text-sm text-muted-foreground">Overdue Erasures</p></div></CardContent></Card>
      </div>

      <Tabs defaultValue="consents">
        <TabsList>
          <TabsTrigger value="consents">Client Consents</TabsTrigger>
          <TabsTrigger value="erasure">Erasure Queue</TabsTrigger>
        </TabsList>

        <TabsContent value="consents" className="mt-4 space-y-4">
          <div className="flex gap-2">
            <Input placeholder="Enter Client ID to search" value={clientId} onChange={e => setClientId(e.target.value)} className="max-w-xs" />
            <Button variant="outline" onClick={() => setSearchedClient(clientId)}>Search</Button>
            {searchedClient && <Button variant="destructive" size="sm" onClick={() => erasureMutation.mutate(searchedClient)}>Request Erasure</Button>}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Consent ID</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Channels</TableHead>
                <TableHead>Legal Basis</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Granted At</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!consents?.data || consents.data.length === 0) && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{searchedClient ? 'No consents found' : 'Search for a client to view consents'}</TableCell></TableRow>
              )}
              {consents?.data?.map((c: any) => (
                <TableRow key={c.consent_id}>
                  <TableCell className="font-mono text-sm">{c.consent_id}</TableCell>
                  <TableCell><Badge className={purposeColors[c.purpose] || ''}>{c.purpose}</Badge></TableCell>
                  <TableCell>{Array.isArray(c.channel_scope) ? c.channel_scope.join(', ') : '—'}</TableCell>
                  <TableCell>{c.legal_basis}</TableCell>
                  <TableCell><Badge className={c.granted ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>{c.granted ? 'Active' : 'Withdrawn'}</Badge></TableCell>
                  <TableCell>{c.granted_at ? new Date(c.granted_at).toLocaleDateString() : '—'}</TableCell>
                  <TableCell>{c.granted && <Button variant="outline" size="sm" onClick={() => withdrawMutation.mutate(c.consent_id)}>Withdraw</Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="erasure" className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client ID</TableHead>
                <TableHead>Requested At</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead>Days Remaining</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!erasureQueue?.data || erasureQueue.data.length === 0) && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No erasure requests pending</TableCell></TableRow>
              )}
              {erasureQueue?.data?.map((e: any) => (
                <TableRow key={e.clientId}>
                  <TableCell>{e.clientId}</TableCell>
                  <TableCell>{new Date(e.requestedAt).toLocaleDateString()}</TableCell>
                  <TableCell>{new Date(e.deadline).toLocaleDateString()}</TableCell>
                  <TableCell><Badge className={e.overdue ? 'bg-red-100 text-red-800' : e.daysRemaining <= 7 ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}>{e.overdue ? 'OVERDUE' : `${e.daysRemaining}d`}</Badge></TableCell>
                  <TableCell><Badge className={e.overdue ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}>{e.overdue ? 'Overdue' : 'Pending'}</Badge></TableCell>
                  <TableCell><Button variant="outline" size="sm" onClick={() => processErasureMutation.mutate(e.clientId)}>Process Erasure</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
}
