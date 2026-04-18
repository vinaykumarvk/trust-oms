/**
 * Admin Console -- Phase 5B (BRD Screen #13)
 *
 * System administration interface with four tabs:
 *   1. Users — CRUD for user accounts with role assignment
 *   2. Roles — View 23 BRD roles with permission counts
 *   3. System Configuration — Key-value config management
 *   4. Feature Flags — Toggle switches for platform features
 *
 * Uses in-memory stub data for all tabs since dedicated admin tables
 * are not yet wired up. The UI structure and interaction patterns are
 * what matter for this phase.
 */
import { useState, useMemo } from "react";
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
import { Separator } from "@ui/components/ui/separator";
import {
  Users, ShieldCheck, Settings, ToggleLeft, Plus, Pencil,
  UserX, UserCheck, Search, Eye, Save, RefreshCw, ChevronRight,
  Lock, Unlock, Key, Info,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StubUser {
  id: number;
  fullName: string;
  email: string;
  role: string;
  status: "Active" | "Inactive";
  lastLogin: string;
}

interface StubRole {
  id: number;
  name: string;
  office: string;
  description: string;
  permissionCount: number;
  permissions: string[];
}

interface ConfigEntry {
  key: string;
  value: string;
  description: string;
  category: string;
}

interface FeatureFlag {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  category: string;
}

// ---------------------------------------------------------------------------
// Stub Data: Users
// ---------------------------------------------------------------------------

const INITIAL_USERS: StubUser[] = [
  { id: 1, fullName: "Maria Santos", email: "m.santos@trustbank.ph", role: "Trust Officer", status: "Active", lastLogin: "2026-04-18 09:15" },
  { id: 2, fullName: "Jose Reyes", email: "j.reyes@trustbank.ph", role: "Fund Manager", status: "Active", lastLogin: "2026-04-18 08:42" },
  { id: 3, fullName: "Ana Cruz", email: "a.cruz@trustbank.ph", role: "CCO", status: "Active", lastLogin: "2026-04-17 16:30" },
  { id: 4, fullName: "Ramon Garcia", email: "r.garcia@trustbank.ph", role: "Trader", status: "Active", lastLogin: "2026-04-18 07:55" },
  { id: 5, fullName: "Elena Rivera", email: "e.rivera@trustbank.ph", role: "Operations Head", status: "Active", lastLogin: "2026-04-18 08:10" },
  { id: 6, fullName: "Pedro Lim", email: "p.lim@trustbank.ph", role: "Settlement Officer", status: "Active", lastLogin: "2026-04-17 17:00" },
  { id: 7, fullName: "Carmen Tan", email: "c.tan@trustbank.ph", role: "RM", status: "Active", lastLogin: "2026-04-18 09:01" },
  { id: 8, fullName: "Miguel Aquino", email: "m.aquino@trustbank.ph", role: "Risk Analyst", status: "Inactive", lastLogin: "2026-03-15 14:22" },
  { id: 9, fullName: "Isabella Mendoza", email: "i.mendoza@trustbank.ph", role: "System Admin", status: "Active", lastLogin: "2026-04-18 06:30" },
  { id: 10, fullName: "Luis Dela Cruz", email: "l.delacruz@trustbank.ph", role: "Auditor", status: "Active", lastLogin: "2026-04-16 11:45" },
  { id: 11, fullName: "Sofia Villanueva", email: "s.villanueva@trustbank.ph", role: "DPO", status: "Active", lastLogin: "2026-04-17 09:20" },
  { id: 12, fullName: "Roberto Fernandez", email: "r.fernandez@trustbank.ph", role: "Trust Business Head", status: "Active", lastLogin: "2026-04-18 08:00" },
];

// ---------------------------------------------------------------------------
// Stub Data: 23 BRD Roles
// ---------------------------------------------------------------------------

const STUB_ROLES: StubRole[] = [
  { id: 1, name: "Trust Business Head", office: "Front Office", description: "Overall trust business oversight and P&L responsibility", permissionCount: 45, permissions: ["VIEW_ALL", "APPROVE_HIGH_VALUE", "EXECUTIVE_DASHBOARD", "KILL_SWITCH_INVOKE", "AUM_REPORTS", "REVENUE_REPORTS"] },
  { id: 2, name: "CRO", office: "Risk", description: "Chief Risk Officer — enterprise risk oversight", permissionCount: 38, permissions: ["VIEW_ALL_RISK", "COMPLIANCE_OVERRIDE", "ORE_MANAGE", "RISK_DASHBOARD", "KILL_SWITCH_INVOKE", "SURVEILLANCE_VIEW"] },
  { id: 3, name: "CCO", office: "Compliance", description: "Chief Compliance Officer — regulatory and compliance oversight", permissionCount: 42, permissions: ["COMPLIANCE_MANAGE", "STR_FILE", "SURVEILLANCE_MANAGE", "WHISTLEBLOWER_MANAGE", "BREACH_RESOLVE", "KYC_OVERRIDE"] },
  { id: 4, name: "Trust Officer", office: "Front Office", description: "Manages client trust accounts and mandate execution", permissionCount: 28, permissions: ["ORDER_CREATE", "PORTFOLIO_VIEW", "CLIENT_MANAGE", "MANDATE_VIEW", "SUITABILITY_CHECK"] },
  { id: 5, name: "Fund Manager", office: "Front Office", description: "Manages UITF/PMT fund portfolios and investment decisions", permissionCount: 32, permissions: ["ORDER_CREATE", "ORDER_APPROVE", "PORTFOLIO_MANAGE", "REBALANCE", "MODEL_PORTFOLIO_MANAGE", "NAV_VIEW"] },
  { id: 6, name: "RM", office: "Front Office", description: "Relationship Manager — client advisory and onboarding", permissionCount: 22, permissions: ["CLIENT_VIEW", "CLIENT_ONBOARD", "SUITABILITY_RUN", "RM_DASHBOARD", "ORDER_VIEW"] },
  { id: 7, name: "Trader", office: "Front Office", description: "Executes orders on exchanges and OTC markets", permissionCount: 18, permissions: ["ORDER_EXECUTE", "BLOCK_MANAGE", "FILL_RECORD", "MARKET_VIEW", "BROKER_SELECT"] },
  { id: 8, name: "Operations Head", office: "Middle Office", description: "Oversees all middle and back-office operations", permissionCount: 40, permissions: ["SETTLEMENT_MANAGE", "RECON_MANAGE", "EOD_MANAGE", "CORPORATE_ACTIONS", "FEE_MANAGE", "CONTROL_TOWER"] },
  { id: 9, name: "Settlement Officer", office: "Back Office", description: "Manages trade settlement and cash movement", permissionCount: 20, permissions: ["SETTLEMENT_PROCESS", "SSI_MANAGE", "CASH_LEDGER_VIEW", "SWIFT_SEND", "SETTLEMENT_MATCH"] },
  { id: 10, name: "NAV Accountant", office: "Back Office", description: "Computes and publishes fund NAV/NAVpu", permissionCount: 16, permissions: ["NAV_COMPUTE", "NAV_PUBLISH", "PRICING_MANAGE", "FUND_ACCOUNTING", "ACCRUAL_MANAGE"] },
  { id: 11, name: "Reconciliation Officer", office: "Back Office", description: "Manages daily reconciliation and break resolution", permissionCount: 15, permissions: ["RECON_RUN", "RECON_RESOLVE", "BREAK_MANAGE", "CUSTODIAN_VIEW", "POSITION_VIEW"] },
  { id: 12, name: "Fee Billing Officer", office: "Back Office", description: "Manages fee computation, accruals, and invoicing", permissionCount: 14, permissions: ["FEE_COMPUTE", "FEE_INVOICE", "FEE_SCHEDULE_MANAGE", "ACCRUAL_VIEW", "TAX_COMPUTE"] },
  { id: 13, name: "Tax Officer", office: "Back Office", description: "Manages withholding tax computation and BIR filings", permissionCount: 12, permissions: ["TAX_COMPUTE", "WHT_FILE", "FATCA_CRS_REPORT", "TAX_SCHEDULE_MANAGE"] },
  { id: 14, name: "Corporate Actions Officer", office: "Back Office", description: "Processes dividends, coupons, maturities, and other corporate actions", permissionCount: 14, permissions: ["CORP_ACTION_PROCESS", "ENTITLEMENT_COMPUTE", "DIVIDEND_MANAGE", "COUPON_MANAGE"] },
  { id: 15, name: "Compliance Officer", office: "Compliance", description: "Monitors compliance rules, pre/post-trade checks", permissionCount: 25, permissions: ["COMPLIANCE_MONITOR", "BREACH_VIEW", "RULE_MANAGE", "LIMIT_MANAGE", "VALIDATION_OVERRIDE"] },
  { id: 16, name: "AML Officer", office: "Compliance", description: "Anti-money laundering monitoring, STR/CTR filing", permissionCount: 20, permissions: ["AML_MONITOR", "STR_FILE", "CTR_FILE", "SANCTIONS_CHECK", "KYC_REVIEW"] },
  { id: 17, name: "Risk Analyst", office: "Risk", description: "Quantitative risk analysis (VaR, duration, stress testing)", permissionCount: 18, permissions: ["RISK_COMPUTE", "VAR_VIEW", "STRESS_TEST", "DURATION_ANALYZE", "RISK_REPORT"] },
  { id: 18, name: "Surveillance Analyst", office: "Compliance", description: "Trade surveillance and pattern detection", permissionCount: 15, permissions: ["SURVEILLANCE_VIEW", "ALERT_DISPOSITION", "PATTERN_ANALYZE", "SAR_FILE"] },
  { id: 19, name: "Auditor", office: "Audit", description: "Internal audit with read-only access to all modules", permissionCount: 30, permissions: ["AUDIT_VIEW_ALL", "AUDIT_LOG_VIEW", "REPORT_GENERATE", "TRAIL_EXPORT"] },
  { id: 20, name: "DPO", office: "Compliance", description: "Data Protection Officer — PDPA compliance and consent management", permissionCount: 18, permissions: ["DPA_MANAGE", "CONSENT_VIEW", "PII_AUDIT", "BREACH_NOTIFY", "RETENTION_MANAGE"] },
  { id: 21, name: "System Admin", office: "IT", description: "System configuration, user management, and platform administration", permissionCount: 50, permissions: ["ADMIN_ALL", "USER_MANAGE", "ROLE_MANAGE", "CONFIG_MANAGE", "FEATURE_FLAG_MANAGE", "SYSTEM_HEALTH"] },
  { id: 22, name: "Client (Portal)", office: "External", description: "Client self-service portal with read-only portfolio access", permissionCount: 8, permissions: ["OWN_PORTFOLIO_VIEW", "OWN_STATEMENT_VIEW", "OWN_NAV_VIEW", "CONSENT_MANAGE"] },
  { id: 23, name: "Whistleblower (Anonymous)", office: "External", description: "Anonymous incident reporting access only", permissionCount: 2, permissions: ["WHISTLEBLOWER_SUBMIT", "CASE_STATUS_VIEW"] },
];

// ---------------------------------------------------------------------------
// Stub Data: System Configuration
// ---------------------------------------------------------------------------

const INITIAL_CONFIGS: ConfigEntry[] = [
  { key: "session_timeout_minutes", value: "30", description: "Session timeout in minutes for all users", category: "Security" },
  { key: "mfa_required", value: "true", description: "Require multi-factor authentication for all users", category: "Security" },
  { key: "password_min_length", value: "12", description: "Minimum password length requirement", category: "Security" },
  { key: "password_expiry_days", value: "90", description: "Days before password expiration", category: "Security" },
  { key: "max_login_attempts", value: "5", description: "Maximum failed login attempts before lockout", category: "Security" },
  { key: "lockout_duration_minutes", value: "30", description: "Account lockout duration after max attempts", category: "Security" },
  { key: "maker_checker_tiers", value: "3", description: "Number of maker-checker approval tiers", category: "Workflow" },
  { key: "high_value_threshold_php", value: "50000000", description: "PHP amount threshold for high-value order approval", category: "Workflow" },
  { key: "stp_target_pct", value: "92", description: "Target STP rate percentage for operations", category: "Operations" },
  { key: "eod_cutoff_time", value: "17:00", description: "End-of-day processing cutoff time (PH time)", category: "Operations" },
  { key: "nav_publication_time", value: "16:30", description: "Target time for UITF NAVpu publication", category: "Operations" },
  { key: "recon_auto_match_tolerance", value: "0.01", description: "Tolerance for auto-matching reconciliation entries", category: "Operations" },
  { key: "uitf_min_initial_php", value: "10000", description: "Minimum initial UITF participation amount", category: "Products" },
  { key: "pera_annual_limit_php", value: "200000", description: "PERA annual contribution limit per RA 9505", category: "Products" },
  { key: "data_retention_years", value: "10", description: "Years to retain transaction and audit data", category: "Compliance" },
  { key: "aml_threshold_php", value: "500000", description: "AML covered transaction reporting threshold", category: "Compliance" },
  { key: "kyc_refresh_years", value: "3", description: "KYC refresh cadence in years", category: "Compliance" },
  { key: "api_rate_limit_per_minute", value: "120", description: "API rate limit per user per minute", category: "System" },
  { key: "audit_log_level", value: "INFO", description: "Audit logging verbosity level", category: "System" },
  { key: "notification_channels", value: "EMAIL,SMS,IN_APP", description: "Enabled notification channels", category: "System" },
];

// ---------------------------------------------------------------------------
// Stub Data: Feature Flags
// ---------------------------------------------------------------------------

const INITIAL_FEATURE_FLAGS: FeatureFlag[] = [
  { key: "AI_SUITABILITY", label: "AI Suitability Assessment", description: "AI-powered client suitability scoring and recommendation engine", enabled: true, category: "AI/ML" },
  { key: "ESG_SCORING", label: "ESG Scoring", description: "Environmental, Social, and Governance scoring for securities", enabled: false, category: "AI/ML" },
  { key: "REAL_TIME_AUM", label: "Real-time AUM", description: "Real-time AUM computation using streaming market data", enabled: true, category: "Analytics" },
  { key: "PREDICTIVE_CASH_FLOW", label: "Predictive Cash Flow", description: "ML-based cash flow prediction for liquidity management", enabled: false, category: "AI/ML" },
  { key: "AUTO_REBALANCE", label: "Auto Rebalancing", description: "Automated portfolio rebalancing based on model drift thresholds", enabled: true, category: "Portfolio" },
  { key: "PERA_MODULE", label: "PERA Module", description: "Personal Equity & Retirement Account (RA 9505) support", enabled: true, category: "Products" },
  { key: "TRADE_SURVEILLANCE", label: "Trade Surveillance", description: "Automated trade pattern detection (wash trading, layering, etc.)", enabled: true, category: "Compliance" },
  { key: "KILL_SWITCH", label: "Kill Switch", description: "Emergency trading halt capability", enabled: true, category: "Risk" },
  { key: "WHISTLEBLOWER_PORTAL", label: "Whistleblower Portal", description: "Anonymous incident reporting with DPO notification", enabled: true, category: "Compliance" },
  { key: "MULTI_CURRENCY", label: "Multi-Currency Support", description: "Support for non-PHP denominated portfolios and FX operations", enabled: true, category: "Operations" },
  { key: "CLIENT_PORTAL", label: "Client Self-Service Portal", description: "External client portal for portfolio viewing and statements", enabled: false, category: "External" },
  { key: "MOBILE_APP", label: "Mobile Application", description: "Mobile app for RM and client access", enabled: false, category: "External" },
  { key: "API_V2", label: "API v2 (GraphQL)", description: "Next-generation GraphQL API endpoints", enabled: false, category: "System" },
  { key: "DARK_MODE", label: "Dark Mode", description: "Dark theme support for all back-office screens", enabled: false, category: "UI" },
  { key: "ADVANCED_CHARTING", label: "Advanced Charting", description: "Interactive charts with drill-down capabilities", enabled: false, category: "Analytics" },
  { key: "BULK_ORDER_UPLOAD", label: "Bulk Order Upload", description: "CSV/Excel bulk order upload with validation", enabled: true, category: "Operations" },
  { key: "FIX_PROTOCOL", label: "FIX Protocol", description: "FIX 4.4 integration for broker connectivity", enabled: false, category: "Integration" },
  { key: "SWIFT_INTEGRATION", label: "SWIFT Integration", description: "SWIFT MT/MX message generation for settlements", enabled: true, category: "Integration" },
];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AdminConsole() {
  const [activeTab, setActiveTab] = useState("users");

  return (
    <div className="space-y-6 p-4 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Console</h1>
        <p className="text-sm text-gray-500 mt-1">
          System administration, user management, and platform configuration
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 max-w-xl">
          <TabsTrigger value="users" className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Users</span>
          </TabsTrigger>
          <TabsTrigger value="roles" className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Roles</span>
          </TabsTrigger>
          <TabsTrigger value="config" className="flex items-center gap-1.5">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Configuration</span>
          </TabsTrigger>
          <TabsTrigger value="features" className="flex items-center gap-1.5">
            <ToggleLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Feature Flags</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="roles">
          <RolesTab />
        </TabsContent>
        <TabsContent value="config">
          <ConfigTab />
        </TabsContent>
        <TabsContent value="features">
          <FeatureFlagsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ===========================================================================
// Tab 1: Users
// ===========================================================================

function UsersTab() {
  const [users, setUsers] = useState<StubUser[]>(INITIAL_USERS);
  const [search, setSearch] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<StubUser | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formRole, setFormRole] = useState("");

  const filteredUsers = useMemo(
    () =>
      users.filter(
        (u) =>
          u.fullName.toLowerCase().includes(search.toLowerCase()) ||
          u.email.toLowerCase().includes(search.toLowerCase()) ||
          u.role.toLowerCase().includes(search.toLowerCase()),
      ),
    [users, search],
  );

  function openAddDialog() {
    setFormName("");
    setFormEmail("");
    setFormRole("");
    setShowAddDialog(true);
  }

  function openEditDialog(user: StubUser) {
    setFormName(user.fullName);
    setFormEmail(user.email);
    setFormRole(user.role);
    setEditingUser(user);
  }

  function handleSaveUser() {
    if (!formName || !formEmail || !formRole) return;

    if (editingUser) {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editingUser.id
            ? { ...u, fullName: formName, email: formEmail, role: formRole }
            : u,
        ),
      );
      setEditingUser(null);
    } else {
      const newUser: StubUser = {
        id: Math.max(...users.map((u) => u.id)) + 1,
        fullName: formName,
        email: formEmail,
        role: formRole,
        status: "Active",
        lastLogin: "Never",
      };
      setUsers((prev) => [...prev, newUser]);
      setShowAddDialog(false);
    }
  }

  function toggleUserStatus(userId: number) {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? { ...u, status: u.status === "Active" ? "Inactive" : "Active" }
          : u,
      ),
    );
  }

  const roleOptions = STUB_ROLES.map((r) => r.name);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">User Management</CardTitle>
          <Button size="sm" onClick={openAddDialog}>
            <Plus className="h-4 w-4 mr-1" />
            Add User
          </Button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Search className="h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search users by name, email, or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="font-semibold w-12">ID</TableHead>
                <TableHead className="font-semibold">Name</TableHead>
                <TableHead className="font-semibold">Email</TableHead>
                <TableHead className="font-semibold">Role</TableHead>
                <TableHead className="font-semibold w-24">Status</TableHead>
                <TableHead className="font-semibold">Last Login</TableHead>
                <TableHead className="font-semibold w-32">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length > 0 ? (
                filteredUsers.map((user) => (
                  <TableRow key={user.id} className="hover:bg-gray-50">
                    <TableCell className="text-xs text-gray-500">{user.id}</TableCell>
                    <TableCell className="font-medium text-sm">{user.fullName}</TableCell>
                    <TableCell className="text-sm text-gray-600">{user.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          user.status === "Active"
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-gray-100 text-gray-500 border-gray-200"
                        }`}
                      >
                        {user.status === "Active" ? (
                          <UserCheck className="h-3 w-3 mr-1" />
                        ) : (
                          <UserX className="h-3 w-3 mr-1" />
                        )}
                        {user.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">{user.lastLogin}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => openEditDialog(user)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-7 px-2 ${
                            user.status === "Active"
                              ? "text-red-600 hover:text-red-700"
                              : "text-green-600 hover:text-green-700"
                          }`}
                          onClick={() => toggleUserStatus(user.id)}
                        >
                          {user.status === "Active" ? (
                            <UserX className="h-3 w-3" />
                          ) : (
                            <UserCheck className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-gray-400 py-8">
                    No users match the search criteria
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="mt-2 text-xs text-gray-400">
          Showing {filteredUsers.length} of {users.length} users
        </div>
      </CardContent>

      {/* Add User Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              Create a new user account with role assignment
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="add-name">Full Name</Label>
              <Input
                id="add-name"
                placeholder="e.g., Juan Dela Cruz"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-email">Email</Label>
              <Input
                id="add-email"
                type="email"
                placeholder="e.g., j.delacruz@trustbank.ph"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-role">Role</Label>
              <Select value={formRole} onValueChange={setFormRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveUser} disabled={!formName || !formEmail || !formRole}>
              <Plus className="h-4 w-4 mr-1" />
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editingUser !== null} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Modify user details and role assignment
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full Name</Label>
              <Input
                id="edit-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select value={formRole} onValueChange={setFormRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveUser} disabled={!formName || !formEmail || !formRole}>
              <Save className="h-4 w-4 mr-1" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ===========================================================================
// Tab 2: Roles
// ===========================================================================

function RolesTab() {
  const [selectedRole, setSelectedRole] = useState<StubRole | null>(null);
  const [search, setSearch] = useState("");

  const filteredRoles = useMemo(
    () =>
      STUB_ROLES.filter(
        (r) =>
          r.name.toLowerCase().includes(search.toLowerCase()) ||
          r.office.toLowerCase().includes(search.toLowerCase()) ||
          r.description.toLowerCase().includes(search.toLowerCase()),
      ),
    [search],
  );

  const officeGroups = useMemo(() => {
    const groups: Record<string, StubRole[]> = {};
    for (const role of filteredRoles) {
      if (!groups[role.office]) groups[role.office] = [];
      groups[role.office].push(role);
    }
    return groups;
  }, [filteredRoles]);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Role Definitions ({STUB_ROLES.length} roles)
            </CardTitle>
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search roles..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="font-semibold w-12">ID</TableHead>
                  <TableHead className="font-semibold">Role Name</TableHead>
                  <TableHead className="font-semibold w-32">Office</TableHead>
                  <TableHead className="font-semibold">Description</TableHead>
                  <TableHead className="font-semibold w-28 text-center">
                    Permissions
                  </TableHead>
                  <TableHead className="font-semibold w-20">View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRoles.map((role) => (
                  <TableRow key={role.id} className="hover:bg-gray-50">
                    <TableCell className="text-xs text-gray-500">{role.id}</TableCell>
                    <TableCell className="font-medium text-sm">{role.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {role.office}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {role.description}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className="text-xs bg-blue-50 text-blue-700 border-blue-200" variant="outline">
                        <Key className="h-3 w-3 mr-1" />
                        {role.permissionCount}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setSelectedRole(role)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Separator className="my-4" />

          {/* Office breakdown summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Object.entries(officeGroups).map(([office, roles]) => (
              <div
                key={office}
                className="text-center p-3 bg-gray-50 rounded-lg border"
              >
                <div className="text-lg font-bold text-gray-700">{roles.length}</div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider">
                  {office}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Role Permissions Dialog */}
      <Dialog open={selectedRole !== null} onOpenChange={(open) => !open && setSelectedRole(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-500" />
              {selectedRole?.name} Permissions
            </DialogTitle>
            <DialogDescription>
              {selectedRole?.description}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="text-xs">
                {selectedRole?.office}
              </Badge>
              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                {selectedRole?.permissionCount} permissions
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {selectedRole?.permissions.map((perm) => (
                <div
                  key={perm}
                  className="flex items-center gap-2 text-xs p-2 bg-gray-50 rounded border"
                >
                  <Lock className="h-3 w-3 text-gray-400 shrink-0" />
                  <span className="font-mono text-gray-700">{perm}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Showing representative permissions. Full permission set managed via Azure AD group mappings.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRole(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ===========================================================================
// Tab 3: System Configuration
// ===========================================================================

function ConfigTab() {
  const [configs, setConfigs] = useState<ConfigEntry[]>(INITIAL_CONFIGS);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("All");

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(configs.map((c) => c.category)))],
    [configs],
  );

  const filteredConfigs = useMemo(
    () =>
      filterCategory === "All"
        ? configs
        : configs.filter((c) => c.category === filterCategory),
    [configs, filterCategory],
  );

  function startEdit(config: ConfigEntry) {
    setEditingKey(config.key);
    setEditValue(config.value);
  }

  function saveEdit() {
    if (!editingKey) return;
    setConfigs((prev) =>
      prev.map((c) => (c.key === editingKey ? { ...c, value: editValue } : c)),
    );
    setEditingKey(null);
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditValue("");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">System Configuration</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="font-semibold w-24">Category</TableHead>
                <TableHead className="font-semibold">Key</TableHead>
                <TableHead className="font-semibold">Description</TableHead>
                <TableHead className="font-semibold w-44">Value</TableHead>
                <TableHead className="font-semibold w-24">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredConfigs.map((config) => (
                <TableRow key={config.key} className="hover:bg-gray-50">
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {config.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-gray-700">
                    {config.key}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {config.description}
                  </TableCell>
                  <TableCell>
                    {editingKey === config.key ? (
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-8 text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit();
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                    ) : (
                      <span className="font-mono text-sm font-medium text-gray-800 bg-gray-50 px-2 py-1 rounded">
                        {config.value}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingKey === config.key ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-green-600"
                          onClick={saveEdit}
                        >
                          <Save className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-gray-500"
                          onClick={cancelEdit}
                        >
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => startEdit(config)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
          <Info className="h-3 w-3" />
          Configuration changes take effect after the next system restart or cache refresh
        </div>
      </CardContent>
    </Card>
  );
}

// ===========================================================================
// Tab 4: Feature Flags
// ===========================================================================

function FeatureFlagsTab() {
  const [flags, setFlags] = useState<FeatureFlag[]>(INITIAL_FEATURE_FLAGS);
  const [filterCategory, setFilterCategory] = useState<string>("All");

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(flags.map((f) => f.category)))],
    [flags],
  );

  const filteredFlags = useMemo(
    () =>
      filterCategory === "All"
        ? flags
        : flags.filter((f) => f.category === filterCategory),
    [flags, filterCategory],
  );

  function toggleFlag(key: string) {
    setFlags((prev) =>
      prev.map((f) => (f.key === key ? { ...f, enabled: !f.enabled } : f)),
    );
  }

  const enabledCount = flags.filter((f) => f.enabled).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Feature Flags</CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              {enabledCount} of {flags.length} features enabled
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredFlags.map((flag) => (
            <div
              key={flag.key}
              className={`p-4 rounded-lg border-2 transition-all ${
                flag.enabled
                  ? "bg-green-50/50 border-green-200"
                  : "bg-gray-50 border-gray-200"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {flag.enabled ? (
                    <Unlock className="h-4 w-4 text-green-600" />
                  ) : (
                    <Lock className="h-4 w-4 text-gray-400" />
                  )}
                  <span className="font-semibold text-sm text-gray-800">
                    {flag.label}
                  </span>
                </div>
                <Switch
                  checked={flag.enabled}
                  onCheckedChange={() => toggleFlag(flag.key)}
                />
              </div>
              <p className="text-xs text-gray-500 mb-2">{flag.description}</p>
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[10px]">
                  {flag.category}
                </Badge>
                <span className="font-mono text-[10px] text-gray-400">
                  {flag.key}
                </span>
              </div>
            </div>
          ))}
        </div>

        <Separator className="my-4" />

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="text-center p-3 bg-green-50 rounded-lg border border-green-100">
            <div className="text-lg font-bold text-green-700">{enabledCount}</div>
            <div className="text-[10px] text-green-600 uppercase tracking-wider">Enabled</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg border border-gray-100">
            <div className="text-lg font-bold text-gray-700">
              {flags.length - enabledCount}
            </div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">Disabled</div>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-100">
            <div className="text-lg font-bold text-blue-700">{flags.length}</div>
            <div className="text-[10px] text-blue-600 uppercase tracking-wider">Total Flags</div>
          </div>
          <div className="text-center p-3 bg-violet-50 rounded-lg border border-violet-100">
            <div className="text-lg font-bold text-violet-700">
              {new Set(flags.map((f) => f.category)).size}
            </div>
            <div className="text-[10px] text-violet-600 uppercase tracking-wider">Categories</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
