/**
 * Admin Console — Enterprise-Grade Operational Page
 *
 * System administration interface with four tabs:
 *   1. Users — CRUD for user accounts with role assignment (real API)
 *   2. Roles & Permissions — BRD-defined roles (read-only, with user counts)
 *   3. System Configuration — Key-value config management (real API)
 *   4. Feature Flags — Toggle switches for platform features (real API)
 *
 * All data is fetched from live API endpoints:
 *   GET /api/v1/auth/users — list users
 *   POST /api/v1/auth/users — create user
 *   PATCH /api/v1/auth/users/:id — update user
 *   GET /api/v1/system-config — list system configs
 *   PUT /api/v1/system-config/:key — update config value
 *   POST /api/v1/system-config/:key/changes — create new config entry
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import { Switch } from "@ui/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@ui/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@ui/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@ui/components/ui/select";
import { Textarea } from "@ui/components/ui/textarea";
import {
  Users, ShieldCheck, Settings, ToggleLeft, Plus, Pencil,
  UserX, UserCheck, Search, Save, RefreshCw,
  Lock, Key, Info, AlertTriangle, CheckCircle2, XCircle,
  Building2, Shield, Eye,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface User {
  id: number;
  username: string | null;
  full_name: string | null;
  email: string | null;
  role: string | null;
  department: string | null;
  office: string | null;
  timezone: string | null;
  branch_id: number | null;
  client_id: string | null;
  is_active: boolean | null;
  mfa_enabled: boolean | null;
  last_login: string | null;
  created_at: string | null;
}

interface SystemConfigEntry {
  id: number;
  config_key: string;
  config_value: string;
  value_type: string;
  category: string | null;
  description: string | null;
  is_sensitive: boolean;
  is_deleted: boolean;
  min_value: string | null;
  max_value: string | null;
  scope_type: string | null;
  scope_id: string | null;
  requires_approval: boolean | null;
  version: number;
  updated_by: string | null;
  updated_at: string | null;
  created_at: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BRD_ROLES = [
  { name: "RELATIONSHIP_MANAGER", office: "Front Office", description: "Manages client relationships, meetings, and proposals", permissions: 12 },
  { name: "SENIOR_RM", office: "Front Office", description: "Senior relationship manager with oversight duties", permissions: 15 },
  { name: "TRADER", office: "Front Office", description: "Executes trade orders and manages order lifecycle", permissions: 10 },
  { name: "SENIOR_TRADER", office: "Front Office", description: "Senior trader with elevated limits and approval authority", permissions: 14 },
  { name: "BO_MAKER", office: "Back Office", description: "Initiates back-office operations and data entry", permissions: 18 },
  { name: "BO_CHECKER", office: "Back Office", description: "Approves back-office transactions (maker-checker)", permissions: 16 },
  { name: "BO_HEAD", office: "Back Office", description: "Head of back-office with full administrative control", permissions: 24 },
  { name: "MO_MAKER", office: "Middle Office", description: "Initiates middle-office risk and compliance operations", permissions: 14 },
  { name: "MO_CHECKER", office: "Middle Office", description: "Approves middle-office submissions", permissions: 12 },
  { name: "RISK_OFFICER", office: "Compliance", description: "Monitors portfolio risk limits and alerts", permissions: 11 },
  { name: "CRO", office: "Executive", description: "Chief Risk Officer with full risk oversight", permissions: 20 },
  { name: "COMPLIANCE_OFFICER", office: "Compliance", description: "Manages regulatory compliance and reporting", permissions: 16 },
  { name: "DPO", office: "Compliance", description: "Data Protection Officer for DSAR and privacy", permissions: 13 },
  { name: "INTERNAL_AUDITOR", office: "Compliance", description: "Conducts internal audit reviews and trail access", permissions: 8 },
  { name: "AUDITOR", office: "Compliance", description: "External auditor with read-only audit access", permissions: 5 },
  { name: "SYSTEM_ADMIN", office: "System", description: "Full system administration and configuration access", permissions: 30 },
  { name: "HEAD_TELLER", office: "Back Office", description: "Manages teller operations and cash handling", permissions: 10 },
  { name: "TREASURY", office: "Middle Office", description: "Treasury operations and fund management", permissions: 12 },
  { name: "TREASURY_SND", office: "Middle Office", description: "Treasury settlements and delivery", permissions: 11 },
  { name: "FI_OPERATION", office: "Back Office", description: "Fixed income operations processing", permissions: 9 },
  { name: "TRADE_SERVICE", office: "Back Office", description: "Trade servicing and settlement operations", permissions: 10 },
  { name: "BSM", office: "Executive", description: "Branch Service Manager with branch-level oversight", permissions: 17 },
  { name: "CLIENT", office: "System", description: "Client portal user with self-service access", permissions: 6 },
] as const;

const OFFICE_GROUPS = ["Front Office", "Middle Office", "Back Office", "Compliance", "Executive", "System"] as const;

const CONFIG_CATEGORIES = ["General", "Security", "Integration", "Notification", "Compliance", "Operations", "FEATURE_FLAG"] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminConsole() {
  const [activeTab, setActiveTab] = useState("users");

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Console</h1>
          <p className="text-muted-foreground text-sm mt-1">
            System administration, user management, and platform configuration
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Users
          </TabsTrigger>
          <TabsTrigger value="roles" className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Roles & Permissions
          </TabsTrigger>
          <TabsTrigger value="config" className="flex items-center gap-2">
            <Settings className="h-4 w-4" /> System Configuration
          </TabsTrigger>
          <TabsTrigger value="flags" className="flex items-center gap-2">
            <ToggleLeft className="h-4 w-4" /> Feature Flags
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <UsersTab />
        </TabsContent>
        <TabsContent value="roles" className="mt-4">
          <RolesTab />
        </TabsContent>
        <TabsContent value="config" className="mt-4">
          <SystemConfigTab />
        </TabsContent>
        <TabsContent value="flags" className="mt-4">
          <FeatureFlagsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ===========================================================================
// USERS TAB
// ===========================================================================

function UsersTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deactivateUser, setDeactivateUser] = useState<User | null>(null);

  const { data: usersResp, isLoading, refetch } = useQuery({
    queryKey: ["/api/v1/users"],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: "500" });
      if (search) params.set("search", search);
      return apiRequest("GET", apiUrl(`/api/v1/users?${params.toString()}`));
    },
  });

  const users: User[] = usersResp?.data ?? usersResp?.rows ?? [];

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
      if (statusFilter === "Active" && !u.is_active) return false;
      if (statusFilter === "Inactive" && u.is_active) return false;
      return true;
    });
  }, [users, roleFilter, statusFilter]);

  const createMutation = useMutation({
    mutationFn: (data: Partial<User>) => apiRequest("POST", apiUrl("/api/v1/users"), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/users"] });
      setCreateOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: Partial<User> & { id: number }) =>
      apiRequest("PATCH", apiUrl(`/api/v1/users/${id}`), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/users"] });
      setEditUser(null);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", apiUrl(`/api/v1/users/${id}`), { is_active: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/users"] });
      setDeactivateUser(null);
    },
  });

  function statusBadge(user: User) {
    if (!user.is_active) {
      return <Badge variant="secondary">Inactive</Badge>;
    }
    return <Badge variant="default" className="bg-green-600">Active</Badge>;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && refetch()}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Roles</SelectItem>
            {BRD_ROLES.map((r) => (
              <SelectItem key={r.name} value={r.name}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Create User
        </Button>
      </div>

      {/* Summary */}
      <div className="flex gap-4">
        <Card className="flex-1">
          <CardContent className="py-3 flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-500" />
            <div>
              <div className="text-lg font-semibold">{users.length}</div>
              <div className="text-xs text-muted-foreground">Total Users</div>
            </div>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardContent className="py-3 flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-green-500" />
            <div>
              <div className="text-lg font-semibold">{users.filter((u) => u.is_active).length}</div>
              <div className="text-xs text-muted-foreground">Active</div>
            </div>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardContent className="py-3 flex items-center gap-2">
            <UserX className="h-5 w-5 text-red-500" />
            <div>
              <div className="text-lg font-semibold">{users.filter((u) => !u.is_active).length}</div>
              <div className="text-xs text-muted-foreground">Inactive</div>
            </div>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardContent className="py-3 flex items-center gap-2">
            <Lock className="h-5 w-5 text-amber-500" />
            <div>
              <div className="text-lg font-semibold">{users.filter((u) => u.mfa_enabled).length}</div>
              <div className="text-xs text-muted-foreground">MFA Enabled</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading users...</div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Full Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Office</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                    No users found matching current filters
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-mono text-sm">{user.username}</TableCell>
                    <TableCell>{user.full_name || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{user.email || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{user.role || "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{user.office || "—"}</TableCell>
                    <TableCell>{statusBadge(user)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.last_login ? new Date(user.last_login).toLocaleDateString() : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditUser(user)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {user.is_active && (
                          <Button variant="ghost" size="sm" onClick={() => setDeactivateUser(user)}>
                            <UserX className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create User Dialog */}
      <UserFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create User"
        onSubmit={(data) => createMutation.mutate(data)}
        loading={createMutation.isPending}
      />

      {/* Edit User Dialog */}
      {editUser && (
        <UserFormDialog
          open={!!editUser}
          onOpenChange={(open) => !open && setEditUser(null)}
          title="Edit User"
          initialData={editUser}
          onSubmit={(data) => updateMutation.mutate({ ...data, id: editUser.id })}
          loading={updateMutation.isPending}
        />
      )}

      {/* Deactivate Confirmation */}
      <Dialog open={!!deactivateUser} onOpenChange={(open) => !open && setDeactivateUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirm Deactivation
            </DialogTitle>
            <DialogDescription>
              This action will disable the user account. The user will no longer be able to log in.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm">
              Are you sure you want to deactivate <strong>{deactivateUser?.full_name || deactivateUser?.username}</strong>?
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              The account can be reactivated later through the Edit dialog.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateUser(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deactivateUser && deactivateMutation.mutate(deactivateUser.id)}
              disabled={deactivateMutation.isPending}
            >
              {deactivateMutation.isPending ? "Deactivating..." : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// User Form Dialog (shared for Create / Edit)
// ---------------------------------------------------------------------------

function UserFormDialog({
  open,
  onOpenChange,
  title,
  initialData,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialData?: User;
  onSubmit: (data: Partial<User>) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState({
    username: initialData?.username || "",
    full_name: initialData?.full_name || "",
    email: initialData?.email || "",
    role: initialData?.role || "",
    office: initialData?.office || "",
    department: initialData?.department || "",
    is_active: initialData?.is_active ?? true,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(form);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {initialData ? "Update user account details and role assignment." : "Create a new user account with role assignment."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
              disabled={!!initialData}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="full_name">Full Name</Label>
            <Input
              id="full_name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger id="role">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {BRD_ROLES.map((r) => (
                  <SelectItem key={r.name} value={r.name}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="office">Office</Label>
            <Select value={form.office} onValueChange={(v) => setForm({ ...form, office: v })}>
              <SelectTrigger id="office">
                <SelectValue placeholder="Select office" />
              </SelectTrigger>
              <SelectContent>
                {OFFICE_GROUPS.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="department">Department</Label>
            <Input
              id="department"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            />
          </div>
          {initialData && (
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="is_active_toggle">Account Active</Label>
                <p className="text-xs text-muted-foreground">Toggle account active/inactive status</p>
              </div>
              <Switch
                id="is_active_toggle"
                checked={form.is_active}
                onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// ROLES & PERMISSIONS TAB
// ===========================================================================

function RolesTab() {
  const [selectedRole, setSelectedRole] = useState<typeof BRD_ROLES[number] | null>(null);

  const { data: usersResp } = useQuery({
    queryKey: ["/api/v1/users"],
    queryFn: async () => apiRequest("GET", apiUrl("/api/v1/users?pageSize=500")),
  });

  const users: User[] = usersResp?.data ?? usersResp?.rows ?? [];

  function getUserCountForRole(roleName: string): number {
    return users.filter((u) => u.role === roleName && u.is_active).length;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <Info className="h-4 w-4 text-blue-500" />
        <p className="text-sm text-muted-foreground">
          Roles are defined by the Business Requirements Document and cannot be modified.
          User assignment is managed from the Users tab.
        </p>
      </div>

      {OFFICE_GROUPS.map((office) => {
        const rolesInOffice = BRD_ROLES.filter((r) => r.office === office);
        if (rolesInOffice.length === 0) return null;
        return (
          <div key={office} className="space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {office}
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {rolesInOffice.map((role) => {
                const userCount = getUserCountForRole(role.name);
                return (
                  <Card
                    key={role.name}
                    className="cursor-pointer hover:border-primary transition-colors"
                    onClick={() => setSelectedRole(role)}
                  >
                    <CardHeader className="py-3 px-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium">{role.name}</CardTitle>
                        <div className="flex gap-1.5">
                          <Badge variant="outline" className="text-xs">
                            <Key className="h-3 w-3 mr-1" /> {role.permissions}
                          </Badge>
                          {userCount > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              <Users className="h-3 w-3 mr-1" /> {userCount}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="py-0 px-4 pb-3">
                      <p className="text-xs text-muted-foreground">{role.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Role Detail Dialog */}
      <Dialog open={!!selectedRole} onOpenChange={(open) => !open && setSelectedRole(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {selectedRole?.name}
            </DialogTitle>
            <DialogDescription>{selectedRole?.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="text-muted-foreground">Office</Label>
                <p className="font-medium">{selectedRole?.office}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Permission Count</Label>
                <p className="font-medium">{selectedRole?.permissions}</p>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">Assigned Users ({getUserCountForRole(selectedRole?.name || "")})</Label>
              <div className="mt-2 max-h-[200px] overflow-y-auto border rounded-md">
                {users
                  .filter((u) => u.role === selectedRole?.name && u.is_active)
                  .map((u) => (
                    <div key={u.id} className="flex items-center justify-between px-3 py-2 border-b last:border-0">
                      <div>
                        <span className="text-sm font-medium">{u.full_name || u.username}</span>
                        <span className="text-xs text-muted-foreground ml-2">{u.email}</span>
                      </div>
                      <Badge variant="default" className="text-xs bg-green-600">Active</Badge>
                    </div>
                  ))}
                {users.filter((u) => u.role === selectedRole?.name && u.is_active).length === 0 && (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    No active users assigned to this role
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRole(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===========================================================================
// SYSTEM CONFIGURATION TAB
// ===========================================================================

function SystemConfigTab() {
  const queryClient = useQueryClient();
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [editEntry, setEditEntry] = useState<SystemConfigEntry | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: configResp, isLoading } = useQuery({
    queryKey: ["/api/v1/system-config"],
    queryFn: async () => apiRequest("GET", apiUrl("/api/v1/system-config")),
  });

  const configEntries: SystemConfigEntry[] = configResp?.data ?? [];

  const filteredConfigs = useMemo(() => {
    return configEntries
      .filter((c) => !c.is_deleted)
      .filter((c) => c.category !== "FEATURE_FLAG")
      .filter((c) => {
        if (categoryFilter !== "ALL" && c.category !== categoryFilter) return false;
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          return (
            c.config_key.toLowerCase().includes(term) ||
            (c.description || "").toLowerCase().includes(term)
          );
        }
        return true;
      });
  }, [configEntries, categoryFilter, searchTerm]);

  const updateMutation = useMutation({
    mutationFn: ({ key, value, version }: { key: string; value: string; version: number }) =>
      apiRequest("PUT", apiUrl(`/api/v1/system-config/${key}`), {
        config_value: value,
        version,
        change_reason: "Updated via Admin Console",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/system-config"] });
      setEditEntry(null);
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: { config_key: string; config_value: string; value_type: string; category: string; description: string }) =>
      apiRequest("POST", apiUrl(`/api/v1/system-config/${data.config_key}/changes`), {
        config_value: data.config_value,
        value_type: data.value_type,
        description: data.description,
        change_reason: "Created via Admin Console",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/system-config"] });
      setCreateOpen(false);
    },
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search config keys..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Categories</SelectItem>
            {CONFIG_CATEGORIES.filter((c) => c !== "FEATURE_FLAG").map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Config
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading configuration...</div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Last Modified</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredConfigs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                    No configuration entries found
                  </TableCell>
                </TableRow>
              ) : (
                filteredConfigs.map((entry) => (
                  <TableRow key={entry.config_key}>
                    <TableCell className="font-mono text-xs">{entry.config_key}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">
                      {entry.is_sensitive ? (
                        <span className="text-muted-foreground italic">****</span>
                      ) : (
                        entry.config_value
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{entry.category || "General"}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{entry.value_type}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                      {entry.description || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {entry.updated_at ? new Date(entry.updated_at).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setEditEntry(entry)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit Config Dialog */}
      <EditConfigDialog
        entry={editEntry}
        open={!!editEntry}
        onOpenChange={(open) => !open && setEditEntry(null)}
        onSave={(value) => {
          if (editEntry) {
            updateMutation.mutate({ key: editEntry.config_key, value, version: editEntry.version });
          }
        }}
        loading={updateMutation.isPending}
      />

      {/* Create Config Dialog */}
      <CreateConfigDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(data) => createMutation.mutate(data)}
        loading={createMutation.isPending}
      />
    </div>
  );
}

function EditConfigDialog({
  entry,
  open,
  onOpenChange,
  onSave,
  loading,
}: {
  entry: SystemConfigEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (value: string) => void;
  loading: boolean;
}) {
  const [value, setValue] = useState(entry?.config_value || "");

  // Reset value when entry changes
  useMemo(() => {
    if (entry) setValue(entry.config_value || "");
  }, [entry]);

  if (!entry) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Edit Configuration
          </DialogTitle>
          <DialogDescription>
            Update the value for <code className="text-xs bg-muted px-1 py-0.5 rounded">{entry.config_key}</code>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <Label className="text-muted-foreground">Type</Label>
              <p className="font-medium">{entry.value_type}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Category</Label>
              <p className="font-medium">{entry.category || "General"}</p>
            </div>
            {entry.min_value && (
              <div>
                <Label className="text-muted-foreground">Min Value</Label>
                <p className="font-medium">{entry.min_value}</p>
              </div>
            )}
            {entry.max_value && (
              <div>
                <Label className="text-muted-foreground">Max Value</Label>
                <p className="font-medium">{entry.max_value}</p>
              </div>
            )}
          </div>
          {entry.description && (
            <div>
              <Label className="text-muted-foreground">Description</Label>
              <p className="text-sm">{entry.description}</p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="config_value">Value</Label>
            {entry.is_sensitive ? (
              <p className="text-sm text-muted-foreground italic">
                Sensitive values cannot be edited through this interface.
              </p>
            ) : entry.value_type === "JSON" ? (
              <Textarea
                id="config_value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                rows={6}
                className="font-mono text-xs"
              />
            ) : (
              <Input
                id="config_value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                type={entry.value_type === "INTEGER" || entry.value_type === "DECIMAL" ? "number" : "text"}
              />
            )}
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" />
            Version: {entry.version} | Optimistic locking is enforced on save.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave(value)} disabled={loading || entry.is_sensitive}>
            <Save className="h-4 w-4 mr-1" />
            {loading ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateConfigDialog({
  open,
  onOpenChange,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { config_key: string; config_value: string; value_type: string; category: string; description: string }) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState({
    config_key: "",
    config_value: "",
    value_type: "STRING",
    category: "General",
    description: "",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(form);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Configuration Entry</DialogTitle>
          <DialogDescription>Add a new system configuration parameter.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new_key">Config Key</Label>
            <Input
              id="new_key"
              placeholder="e.g. MAX_UPLOAD_SIZE_MB"
              value={form.config_key}
              onChange={(e) => setForm({ ...form, config_key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })}
              className="font-mono"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new_value">Value</Label>
            <Input
              id="new_value"
              value={form.config_value}
              onChange={(e) => setForm({ ...form, config_value: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Value Type</Label>
              <Select value={form.value_type} onValueChange={(v) => setForm({ ...form, value_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="STRING">STRING</SelectItem>
                  <SelectItem value="INTEGER">INTEGER</SelectItem>
                  <SelectItem value="DECIMAL">DECIMAL</SelectItem>
                  <SelectItem value="BOOLEAN">BOOLEAN</SelectItem>
                  <SelectItem value="JSON">JSON</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONFIG_CATEGORIES.filter((c) => c !== "FEATURE_FLAG").map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new_desc">Description</Label>
            <Textarea
              id="new_desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              placeholder="Brief description of this configuration parameter"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// FEATURE FLAGS TAB
// ===========================================================================

function FeatureFlagsTab() {
  const queryClient = useQueryClient();
  const [flagSearch, setFlagSearch] = useState("");

  const { data: configResp, isLoading } = useQuery({
    queryKey: ["/api/v1/system-config"],
    queryFn: async () => apiRequest("GET", apiUrl("/api/v1/system-config")),
  });

  const allConfigs: SystemConfigEntry[] = configResp?.data ?? [];

  // Feature flags are system config entries with category='FEATURE_FLAG' and value_type='BOOLEAN'
  const featureFlags = useMemo(() => {
    return allConfigs
      .filter((c) => !c.is_deleted)
      .filter((c) => c.category === "FEATURE_FLAG" || c.value_type === "BOOLEAN" && c.config_key.startsWith("FF_"))
      .filter((c) => {
        if (!flagSearch) return true;
        const term = flagSearch.toLowerCase();
        return (
          c.config_key.toLowerCase().includes(term) ||
          (c.description || "").toLowerCase().includes(term)
        );
      });
  }, [allConfigs, flagSearch]);

  const enabledCount = featureFlags.filter((f) => f.config_value === "true").length;
  const disabledCount = featureFlags.filter((f) => f.config_value !== "true").length;

  const toggleMutation = useMutation({
    mutationFn: ({ key, currentValue, version }: { key: string; currentValue: string; version: number }) =>
      apiRequest("PUT", apiUrl(`/api/v1/system-config/${key}`), {
        config_value: currentValue === "true" ? "false" : "true",
        version,
        change_reason: `Feature flag toggled via Admin Console`,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/system-config"] });
    },
  });

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="flex gap-4">
        <Card className="flex-1">
          <CardContent className="py-3 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <div>
              <div className="text-lg font-semibold">{enabledCount}</div>
              <div className="text-xs text-muted-foreground">Enabled</div>
            </div>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardContent className="py-3 flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            <div>
              <div className="text-lg font-semibold">{disabledCount}</div>
              <div className="text-xs text-muted-foreground">Disabled</div>
            </div>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardContent className="py-3 flex items-center gap-2">
            <ToggleLeft className="h-5 w-5 text-blue-500" />
            <div>
              <div className="text-lg font-semibold">{featureFlags.length}</div>
              <div className="text-xs text-muted-foreground">Total Flags</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search feature flags..."
          value={flagSearch}
          onChange={(e) => setFlagSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Flags Grid */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading feature flags...</div>
      ) : featureFlags.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ToggleLeft className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-medium">No Feature Flags Found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Feature flags are system config entries with category "FEATURE_FLAG" or keys prefixed with "FF_".
              Create one from the System Configuration tab.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {featureFlags.map((flag) => {
            const isEnabled = flag.config_value === "true";
            return (
              <Card key={flag.config_key} className={`transition-colors ${isEnabled ? "border-green-200 dark:border-green-900" : ""}`}>
                <CardContent className="py-4 px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-mono font-medium truncate" title={flag.config_key}>
                        {flag.config_key}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {flag.description || "No description"}
                      </p>
                      {flag.updated_at && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Last toggled: {new Date(flag.updated_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={() =>
                          toggleMutation.mutate({
                            key: flag.config_key,
                            currentValue: flag.config_value,
                            version: flag.version,
                          })
                        }
                        disabled={toggleMutation.isPending}
                        aria-label={`Toggle ${flag.config_key}`}
                      />
                      <span className={`text-xs font-medium ${isEnabled ? "text-green-600" : "text-muted-foreground"}`}>
                        {isEnabled ? "ON" : "OFF"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
