/**
 * Workflow Definitions Page
 *
 * Admin-only CRUD page for managing approval workflow rules.
 * Features:
 *   - Table view with all workflow definitions
 *   - Add/Edit form in a Sheet dialog
 *   - Toggle active status
 *   - Delete with confirmation
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@ui/lib/queryClient';
import { useToast } from '@ui/components/ui/toast';

import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Badge } from '@ui/components/ui/badge';
import { Button } from '@ui/components/ui/button';
import { Input } from '@ui/components/ui/input';
import { Skeleton } from '@ui/components/ui/skeleton';
import { Switch } from '@ui/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@ui/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@ui/components/ui/alert-dialog';
import { Label } from '@ui/components/ui/label';
import { Separator } from '@ui/components/ui/separator';

import {
  Plus,
  Pencil,
  Trash2,
  Settings2,
  Loader2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkflowDefinition {
  id: number;
  entity_type: string | null;
  action: string | null;
  required_approvers: number | null;
  sla_hours: number | null;
  auto_approve_roles: string[] | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
}

interface WorkflowListResponse {
  data: WorkflowDefinition[];
  total: number;
  page: number;
  pageSize: number;
}

interface WorkflowFormData {
  entity_type: string;
  action: string;
  required_approvers: number;
  sla_hours: number;
  auto_approve_roles: string;
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ROLES = [
  'SYSTEM_ADMIN',
  'BO_MAKER',
  'BO_CHECKER',
  'BO_HEAD',
  'RELATIONSHIP_MANAGER',
  'SENIOR_RM',
  'TRADER',
  'SENIOR_TRADER',
  'MO_MAKER',
  'MO_CHECKER',
  'FUND_ACCOUNTANT',
  'COMPLIANCE_OFFICER',
  'CCO',
  'RISK_OFFICER',
  'CRO',
  'TRUST_BUSINESS_HEAD',
];

const ACTIONS = ['create', 'update', 'delete'];

const DEFAULT_FORM: WorkflowFormData = {
  entity_type: '',
  action: 'create',
  required_approvers: 1,
  sla_hours: 24,
  auto_approve_roles: '',
  is_active: true,
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function WorkflowDefinitionsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<WorkflowFormData>(DEFAULT_FORM);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);

  // Query — list workflow definitions
  const listQuery = useQuery<WorkflowListResponse>({
    queryKey: ['workflow-definitions', page],
    queryFn: () =>
      apiRequest(
        'GET',
        `/api/v1/workflow-definitions?page=${page}&pageSize=${pageSize}`,
      ),
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest('POST', '/api/v1/workflow-definitions', data),
    onSuccess: () => {
      toast({ title: 'Workflow definition created' });
      queryClient.invalidateQueries({ queryKey: ['workflow-definitions'] });
      setFormOpen(false);
    },
    onError: (err: Error) => {
      toast({
        title: 'Failed to create workflow definition',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (params: { id: number; data: Record<string, unknown> }) =>
      apiRequest('PATCH', `/api/v1/workflow-definitions/${params.id}`, params.data),
    onSuccess: () => {
      toast({ title: 'Workflow definition updated' });
      queryClient.invalidateQueries({ queryKey: ['workflow-definitions'] });
      setFormOpen(false);
    },
    onError: (err: Error) => {
      toast({
        title: 'Failed to update workflow definition',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest('DELETE', `/api/v1/workflow-definitions/${id}`),
    onSuccess: () => {
      toast({ title: 'Workflow definition deleted' });
      queryClient.invalidateQueries({ queryKey: ['workflow-definitions'] });
      setDeleteOpen(false);
    },
    onError: (err: Error) => {
      toast({
        title: 'Failed to delete workflow definition',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  // Handlers
  const handleOpenCreate = useCallback(() => {
    setFormMode('create');
    setEditingId(null);
    setFormData(DEFAULT_FORM);
    setFormOpen(true);
  }, []);

  const handleOpenEdit = useCallback((wf: WorkflowDefinition) => {
    setFormMode('edit');
    setEditingId(wf.id);
    setFormData({
      entity_type: wf.entity_type ?? '',
      action: wf.action ?? 'create',
      required_approvers: wf.required_approvers ?? 1,
      sla_hours: wf.sla_hours ?? 24,
      auto_approve_roles: Array.isArray(wf.auto_approve_roles)
        ? wf.auto_approve_roles.join(', ')
        : '',
      is_active: wf.is_active ?? true,
    });
    setFormOpen(true);
  }, []);

  const handleOpenDelete = useCallback((id: number) => {
    setDeletingId(id);
    setDeleteOpen(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!formData.entity_type.trim()) {
      toast({ title: 'Entity type is required', variant: 'destructive' });
      return;
    }

    const payload: Record<string, unknown> = {
      entity_type: formData.entity_type.trim(),
      action: formData.action,
      required_approvers: formData.required_approvers,
      sla_hours: formData.sla_hours,
      auto_approve_roles: formData.auto_approve_roles
        ? formData.auto_approve_roles
            .split(',')
            .map((r) => r.trim())
            .filter(Boolean)
        : [],
      is_active: formData.is_active,
    };

    if (formMode === 'create') {
      createMutation.mutate(payload);
    } else if (editingId !== null) {
      updateMutation.mutate({ id: editingId, data: payload });
    }
  }, [formData, formMode, editingId, createMutation, updateMutation, toast]);

  const handleDelete = useCallback(() => {
    if (deletingId !== null) {
      deleteMutation.mutate(deletingId);
    }
  }, [deletingId, deleteMutation]);

  const isMutating =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  const workflows = listQuery.data?.data ?? [];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Workflow Definitions
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage approval workflow rules for entity operations
          </p>
        </div>
        <Button onClick={handleOpenCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Workflow
        </Button>
      </div>

      {/* Table */}
      {listQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : workflows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Settings2 className="mb-3 h-10 w-10" />
            <p className="text-sm">No workflow definitions configured</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={handleOpenCreate}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Create First Workflow
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entity Type</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Required Approvers</TableHead>
                <TableHead>SLA Hours</TableHead>
                <TableHead>Auto-Approve Roles</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workflows.map((wf) => (
                <TableRow key={wf.id}>
                  <TableCell className="font-medium">
                    {wf.entity_type}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        wf.action === 'create'
                          ? 'default'
                          : wf.action === 'delete'
                            ? 'destructive'
                            : 'secondary'
                      }
                    >
                      {wf.action}
                    </Badge>
                  </TableCell>
                  <TableCell>{wf.required_approvers ?? 1}</TableCell>
                  <TableCell>{wf.sla_hours ?? 24}h</TableCell>
                  <TableCell>
                    {Array.isArray(wf.auto_approve_roles) &&
                    wf.auto_approve_roles.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {wf.auto_approve_roles.map((role) => (
                          <Badge key={role} variant="outline" className="text-xs">
                            {role}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={wf.is_active ? 'default' : 'secondary'}
                    >
                      {wf.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => handleOpenEdit(wf)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleOpenDelete(wf.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add/Edit Sheet */}
      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {formMode === 'create'
                ? 'Add Workflow Definition'
                : 'Edit Workflow Definition'}
            </SheetTitle>
            <SheetDescription>
              Configure approval requirements for a specific entity type and action.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5">
            {/* Entity Type */}
            <div className="space-y-2">
              <Label htmlFor="entity_type">Entity Type</Label>
              <Input
                id="entity_type"
                placeholder="e.g. portfolios, securities, clients"
                value={formData.entity_type}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, entity_type: e.target.value }))
                }
              />
            </div>

            {/* Action */}
            <div className="space-y-2">
              <Label htmlFor="action">Action</Label>
              <Select
                value={formData.action}
                onValueChange={(v) =>
                  setFormData((prev) => ({ ...prev, action: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIONS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a.charAt(0).toUpperCase() + a.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Required Approvers */}
            <div className="space-y-2">
              <Label htmlFor="required_approvers">Required Approvers</Label>
              <Input
                id="required_approvers"
                type="number"
                min={1}
                max={6}
                value={formData.required_approvers}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    required_approvers: Math.min(6, Math.max(1, parseInt(e.target.value) || 1)),
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Number of approvers required (1-6)
              </p>
            </div>

            {/* SLA Hours */}
            <div className="space-y-2">
              <Label htmlFor="sla_hours">SLA Hours</Label>
              <Input
                id="sla_hours"
                type="number"
                min={1}
                value={formData.sla_hours}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    sla_hours: Math.max(1, parseInt(e.target.value) || 24),
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Hours before SLA breach
              </p>
            </div>

            {/* Auto-Approve Roles */}
            <div className="space-y-2">
              <Label htmlFor="auto_approve_roles">Auto-Approve Roles</Label>
              <Input
                id="auto_approve_roles"
                placeholder="SYSTEM_ADMIN, BO_HEAD"
                value={formData.auto_approve_roles}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    auto_approve_roles: e.target.value,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated roles that bypass approval. Available roles:{' '}
                {USER_ROLES.slice(0, 4).join(', ')}...
              </p>
            </div>

            <Separator />

            {/* Is Active */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">
                  Inactive workflows will not enforce approvals
                </p>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, is_active: checked }))
                }
              />
            </div>
          </div>

          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isMutating}>
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              {formMode === 'create' ? 'Create' : 'Save Changes'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow Definition</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this workflow definition? This
              action cannot be undone and may affect approval requirements for
              pending requests.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
