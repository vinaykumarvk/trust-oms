/**
 * Task Manager (CRM — Phases 7 & 8)
 *
 * Task management page for CRM-related tasks:
 *   - Task list with columns: title, priority (color-coded), status, due_date, assigned_to, actions
 *   - Filters: status, priority, assigned_to
 *   - Create task dialog: title, description, task_type, priority, due_date, reminder_date, assigned_to
 *   - Status change actions via dropdown on each row
 *   - Overdue indicator (red text/border for past-due tasks)
 *   - Priority colors: LOW=blue, MEDIUM=yellow, HIGH=orange, CRITICAL=red
 */

import { useState, useMemo } from 'react';
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
import { toast } from 'sonner';
import {
  Plus, CheckSquare, Clock, AlertCircle, X,
  ListTodo, Calendar, User,
} from 'lucide-react';
import { SkeletonRows } from '@/components/ui/skeleton-rows';

/* ---------- API helpers ---------- */

function getToken(): string {
  try {
    const stored = localStorage.getItem('trustoms-user');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.token || '';
    }
  } catch {
    // ignore
  }
  return '';
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function fetcher(url: string) {
  return fetch(url, { headers: authHeaders() }).then((r) => r.json());
}

/* ---------- Types ---------- */

interface TaskRecord {
  id: number;
  title: string;
  description: string | null;
  task_type: string;
  priority: string;
  status: string;
  due_date: string | null;
  reminder_date: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  created_at: string;
  updated_at: string;
}

interface UserOption {
  id: number;
  name: string;
  email: string;
}

interface TaskListResult {
  data: TaskRecord[];
  total: number;
}

interface NewTaskForm {
  title: string;
  description: string;
  task_type: string;
  priority: string;
  due_date: string;
  reminder_date: string;
  assigned_to: string;
}

/* ---------- Constants ---------- */

const STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

const TASK_TYPES = [
  'FOLLOW_UP',
  'CALL_BACK',
  'DOCUMENT_REVIEW',
  'MEETING_PREP',
  'PROPOSAL_DRAFT',
  'CLIENT_REVIEW',
  'COMPLIANCE_CHECK',
  'INTERNAL',
  'OTHER',
] as const;

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  MEDIUM: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  HIGH: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  IN_PROGRESS: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  CANCELLED: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
};

const STATUS_ICONS: Record<string, typeof Clock> = {
  PENDING: Clock,
  IN_PROGRESS: ListTodo,
  COMPLETED: CheckSquare,
  CANCELLED: X,
};

const INITIAL_FORM: NewTaskForm = {
  title: '',
  description: '',
  task_type: '',
  priority: 'MEDIUM',
  due_date: '',
  reminder_date: '',
  assigned_to: '',
};

/* ---------- Helpers ---------- */

function isOverdue(task: TaskRecord): boolean {
  if (!task.due_date) return false;
  if (task.status === 'COMPLETED' || task.status === 'CANCELLED') return false;
  const dueDate = new Date(task.due_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dueDate < today;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString();
}

/* ---------- Component ---------- */

export default function TaskManager() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newTask, setNewTask] = useState<NewTaskForm>(INITIAL_FORM);

  // Filters
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterAssignedTo, setFilterAssignedTo] = useState('all');

  /* ---- Queries ---- */

  const { data: listResult, isPending: listPending } = useQuery<TaskListResult>({
    queryKey: ['crm-tasks'],
    queryFn: () => fetcher('/api/v1/crm/tasks?pageSize=500'),
    refetchInterval: 15000,
  });

  const { data: usersData } = useQuery<{ data: UserOption[] }>({
    queryKey: ['crm-task-users'],
    queryFn: () => fetcher('/api/v1/users?pageSize=200'),
  });

  const tasks = listResult?.data ?? [];
  const users = usersData?.data ?? [];

  // Apply filters
  const filteredTasks = useMemo(() => {
    return tasks.filter((task: TaskRecord) => {
      if (filterStatus !== 'all' && task.status !== filterStatus) return false;
      if (filterPriority !== 'all' && task.priority !== filterPriority) return false;
      if (filterAssignedTo !== 'all' && task.assigned_to !== filterAssignedTo) return false;
      return true;
    });
  }, [tasks, filterStatus, filterPriority, filterAssignedTo]);

  // Summary stats
  const stats = useMemo(() => {
    const pending = tasks.filter((t: TaskRecord) => t.status === 'PENDING').length;
    const inProgress = tasks.filter((t: TaskRecord) => t.status === 'IN_PROGRESS').length;
    const completed = tasks.filter((t: TaskRecord) => t.status === 'COMPLETED').length;
    const overdue = tasks.filter((t: TaskRecord) => isOverdue(t)).length;
    return { pending, inProgress, completed, overdue };
  }, [tasks]);

  // Unique assignees for filter
  const assignees = useMemo(() => {
    const unique = new Map<string, string>();
    for (const task of tasks) {
      if (task.assigned_to) {
        unique.set(task.assigned_to, task.assigned_to_name || task.assigned_to);
      }
    }
    return Array.from(unique.entries());
  }, [tasks]);

  /* ---- Mutations ---- */

  const createMutation = useMutation({
    mutationFn: (data: NewTaskForm) =>
      fetch('/api/v1/crm/tasks', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          title: data.title,
          description: data.description || undefined,
          task_type: data.task_type,
          priority: data.priority,
          due_date: data.due_date || undefined,
          reminder_date: data.reminder_date || undefined,
          assigned_to: data.assigned_to || undefined,
          status: 'PENDING',
        }),
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Create failed'); });
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-tasks'] });
      setCreateOpen(false);
      setNewTask(INITIAL_FORM);
      toast.success('Task created successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, newStatus }: { id: number; newStatus: string }) =>
      fetch(`/api/v1/crm/tasks/${id}/status`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ status: newStatus }),
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Update failed'); });
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-tasks'] });
      toast.success('Task status updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  /* ---- Render ---- */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Task Manager</h1>
          <p className="text-muted-foreground">
            Manage and track CRM tasks, follow-ups, and action items
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" /> New Task
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[540px]">
            <DialogHeader>
              <DialogTitle>Create Task</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
              <div>
                <label className="text-sm font-medium">Title *</label>
                <Input
                  placeholder="e.g. Follow up with Santos Corp on UITF proposal"
                  value={newTask.title}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setNewTask({ ...newTask, title: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <textarea
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px] resize-y"
                  placeholder="Additional details about the task..."
                  value={newTask.description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setNewTask({ ...newTask, description: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Task Type *</label>
                  <Select
                    value={newTask.task_type}
                    onValueChange={(v: string) => setNewTask({ ...newTask, task_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Priority *</label>
                  <Select
                    value={newTask.priority}
                    onValueChange={(v: string) => setNewTask({ ...newTask, priority: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Due Date</label>
                  <Input
                    type="date"
                    value={newTask.due_date}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewTask({ ...newTask, due_date: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Reminder Date</label>
                  <Input
                    type="date"
                    value={newTask.reminder_date}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewTask({ ...newTask, reminder_date: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Assigned To</label>
                <Select
                  value={newTask.assigned_to}
                  onValueChange={(v: string) => setNewTask({ ...newTask, assigned_to: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u: UserOption) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate(newTask)}
                disabled={!newTask.title || !newTask.task_type || createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating...' : 'Create Task'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {listPending
          ? Array.from({ length: 4 }).map((_, i) => (
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
          : [
              { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-gray-600' },
              { label: 'In Progress', value: stats.inProgress, icon: ListTodo, color: 'text-blue-600' },
              { label: 'Completed', value: stats.completed, icon: CheckSquare, color: 'text-green-600' },
              { label: 'Overdue', value: stats.overdue, icon: AlertCircle, color: 'text-red-600' },
            ].map((card) => (
              <Card key={card.label}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">{card.label}</CardTitle>
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{card.value}</div>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[160px]">
              <label className="text-sm font-medium">Status</label>
              <Select value={filterStatus} onValueChange={(v: string) => setFilterStatus(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[160px]">
              <label className="text-sm font-medium">Priority</label>
              <Select value={filterPriority} onValueChange={(v: string) => setFilterPriority(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[180px]">
              <label className="text-sm font-medium">Assigned To</label>
              <Select value={filterAssignedTo} onValueChange={(v: string) => setFilterAssignedTo(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {assignees.map(([id, name]) => (
                    <SelectItem key={id} value={id}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(filterStatus !== 'all' || filterPriority !== 'all' || filterAssignedTo !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterStatus('all');
                  setFilterPriority('all');
                  setFilterAssignedTo('all');
                }}
              >
                <X className="mr-1 h-4 w-4" /> Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tasks Table */}
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[240px]">Title</TableHead>
              <TableHead className="min-w-[100px]">Priority</TableHead>
              <TableHead className="min-w-[120px]">Status</TableHead>
              <TableHead className="min-w-[110px]">Due Date</TableHead>
              <TableHead className="min-w-[140px]">Assigned To</TableHead>
              <TableHead className="min-w-[200px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listPending ? (
              <SkeletonRows cols={6} />
            ) : filteredTasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                    <ListTodo className="h-10 w-10 text-muted-foreground/50" />
                    <p>No tasks found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredTasks.map((task: TaskRecord) => {
                const overdue = isOverdue(task);
                const StatusIcon = STATUS_ICONS[task.status] || Clock;

                return (
                  <TableRow
                    key={task.id}
                    className={overdue ? 'border-l-4 border-l-red-500 dark:border-l-red-600' : ''}
                  >
                    <TableCell>
                      <div>
                        <p className={`font-medium ${overdue ? 'text-red-600 dark:text-red-400' : ''}`}>
                          {task.title}
                        </p>
                        {task.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                            {task.description}
                          </p>
                        )}
                        {task.task_type && (
                          <Badge variant="outline" className="text-xs mt-1">
                            {task.task_type.replace(/_/g, ' ')}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={PRIORITY_COLORS[task.priority] || ''}
                        variant="secondary"
                      >
                        {task.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <StatusIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <Badge
                          className={STATUS_COLORS[task.status] || ''}
                          variant="secondary"
                        >
                          {task.status.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className={`flex items-center gap-1 text-sm ${
                        overdue ? 'text-red-600 font-medium dark:text-red-400' : 'text-muted-foreground'
                      }`}>
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(task.due_date)}
                        {overdue && (
                          <AlertCircle className="h-3.5 w-3.5 text-red-500 ml-1" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{task.assigned_to_name || task.assigned_to || '-'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Select
                          value={task.status}
                          onValueChange={(v: string) =>
                            statusMutation.mutate({ id: task.id, newStatus: v })
                          }
                          disabled={statusMutation.isPending}
                        >
                          <SelectTrigger className="h-8 w-[140px] text-xs">
                            <SelectValue placeholder="Change status" />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s.replace(/_/g, ' ')}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
