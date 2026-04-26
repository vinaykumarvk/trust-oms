/**
 * Client Portal Layout
 *
 * Clean, modern layout for the client self-service portal.
 * Features:
 * - Top header bar with logo, client name, notification bell, logout
 * - Left sidebar with minimal navigation (teal accent theme)
 * - Mobile-responsive with hamburger menu
 * - Main content area with <Outlet /> for nested routing
 */

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Button } from "@ui/components/ui/button";
import { ScrollArea } from "@ui/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@ui/components/ui/sheet";
import {
  LayoutDashboard,
  Briefcase,
  TrendingUp,
  FileText,
  MessageSquare,
  Settings,
  ClipboardList,
  Bell,
  LogOut,
  Menu,
  X,
  Megaphone,
  Compass,
  FileSpreadsheet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@ui/lib/utils";
import { clientNavItems } from "@/config/navigation";

// Map icon name strings to actual Lucide components
const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  Briefcase,
  TrendingUp,
  FileText,
  MessageSquare,
  Settings,
  ClipboardList,
  Megaphone,
  Compass,
  FileSpreadsheet,
};

// ---- Helper: get client name from localStorage ----

function getClientName(): string {
  try {
    const stored = localStorage.getItem("trustoms-client-user");
    if (stored) {
      const user = JSON.parse(stored);
      return user.name || user.email || "Client";
    }
  } catch {
    // ignore
  }
  return "Client";
}

// ---- Sidebar Navigation Links ----

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  let clientUser: { clientId?: string; token?: string } = {};
  try {
    const stored = localStorage.getItem("trustoms-client-user");
    if (stored) clientUser = JSON.parse(stored);
  } catch {
    // ignore malformed storage
  }
  const clientId = clientUser.clientId || "CLT-001";

  const { data: actionCountData } = useQuery({
    queryKey: ["sr-action-count", clientId],
    queryFn: () => fetch(`/api/v1/client-portal/service-requests/action-count/${clientId}`, {
      headers: { Authorization: `Bearer ${clientUser.token || ""}` },
    }).then(r => r.json()),
    refetchInterval: 60000,
  });
  const srActionCount = actionCountData?.data?.count || 0;

  const { data: unreadData } = useQuery<{ unread_count: number }>({
    queryKey: ["client-portal", "messages-unread", clientId],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/client-portal/messages/unread-count")),
    refetchInterval: 60000,
  });
  const messageUnreadCount = unreadData?.unread_count ?? 0;

  return (
    <nav className="flex flex-col gap-1 px-3 py-4" aria-label="Portal navigation">
      {clientNavItems.map((item) => {
        const Icon = iconMap[item.icon] ?? LayoutDashboard;

        return (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn(
                    "h-5 w-5 shrink-0",
                    isActive ? "text-white" : "text-muted-foreground",
                  )}
                />
                <span>{item.label}</span>
                {item.label === "Service Requests" && srActionCount > 0 && (
                  <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {srActionCount}
                  </span>
                )}
                {item.label === "Messages" && messageUnreadCount > 0 && (
                  <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-teal-500 text-[10px] font-bold text-white">
                    {messageUnreadCount > 99 ? "99+" : messageUnreadCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

// ---- Desktop Sidebar ----

function DesktopSidebar() {
  return (
    <aside className="hidden lg:flex lg:w-60 lg:flex-shrink-0 flex-col h-dvh border-r border-border bg-background dark:bg-gray-900 dark:border-gray-700">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-border dark:border-gray-700 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600">
          <span className="text-sm font-bold text-white">T</span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-foreground dark:text-gray-100">TrustOMS</span>
          <span className="text-[10px] text-muted-foreground dark:text-gray-400">Client Portal</span>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <SidebarNav />
      </ScrollArea>

      {/* Footer / branding */}
      <div className="border-t border-border dark:border-gray-700 px-5 py-3">
        <p className="text-[10px] text-muted-foreground dark:text-gray-400">TrustOMS Philippines v1.0</p>
      </div>
    </aside>
  );
}

// ---- Top Header ----

function TopHeader({
  onMenuOpen,
  unreadCount,
}: {
  onMenuOpen: () => void;
  unreadCount: number;
}) {
  const navigate = useNavigate();
  const clientName = getClientName();

  const handleLogout = () => {
    fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    localStorage.removeItem("trustoms-client-user");
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border dark:border-gray-700 bg-background/95 dark:bg-gray-900/95 backdrop-blur px-3 sm:px-4 lg:px-6">
      <div className="flex items-center gap-3">
        {/* Mobile hamburger */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 lg:hidden"
          onClick={onMenuOpen}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5 text-muted-foreground" />
        </Button>

        {/* Mobile logo */}
        <div className="flex items-center gap-2 lg:hidden">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-600">
            <span className="text-xs font-bold text-white">T</span>
          </div>
          <span className="text-sm font-semibold text-foreground">TrustOMS</span>
        </div>

        {/* Desktop welcome */}
        <div className="hidden lg:block">
          <p className="text-sm text-muted-foreground">
            Welcome, <span className="font-semibold text-foreground">{clientName}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Notification bell — dot only shown when there are unread messages */}
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label={unreadCount > 0 ? `Notifications — ${unreadCount} unread` : "Notifications"}
          onClick={() => navigate("/messages")}
        >
          <Bell className="h-5 w-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-teal-500" aria-hidden="true" />
          )}
        </Button>

        {/* Client name (desktop) */}
        <span className="hidden lg:inline-flex text-sm text-muted-foreground mr-1">{clientName}</span>

        {/* Logout */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          aria-label="Log out"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5 text-muted-foreground" />
        </Button>
      </div>
    </header>
  );
}

// ---- Mobile Sidebar (Sheet) ----

function MobileSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="left" className="w-72 p-0 bg-background dark:bg-gray-900">
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>

        <div className="flex h-16 items-center justify-between border-b border-border dark:border-gray-700 px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600">
              <span className="text-sm font-bold text-white">T</span>
            </div>
            <span className="text-sm font-semibold text-foreground">TrustOMS</span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close menu">
            <X className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>

        <ScrollArea className="flex-1 h-[calc(100dvh-4rem)]">
          <SidebarNav onNavigate={onClose} />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ---- Main Layout Export ----

export function ClientPortalLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const openMobile = useCallback(() => setMobileOpen(true), []);

  // Fetch unread count at layout level so TopHeader bell badge stays in sync.
  // SidebarNav uses the same query key — React Query deduplicates the request.
  let headerClientId = "CLT-001";
  try {
    const stored = localStorage.getItem("trustoms-client-user");
    if (stored) headerClientId = JSON.parse(stored).clientId || "CLT-001";
  } catch {
    // ignore malformed storage
  }

  const { data: layoutUnreadData } = useQuery<{ unread_count: number }>({
    queryKey: ["client-portal", "messages-unread", headerClientId],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/client-portal/messages/unread-count")),
    refetchInterval: 60000,
  });
  const headerUnreadCount = layoutUnreadData?.unread_count ?? 0;

  return (
    <div className="flex h-dvh overflow-hidden bg-muted dark:bg-gray-950">
      {/* Desktop sidebar */}
      <DesktopSidebar />

      {/* Mobile sidebar */}
      <MobileSidebar open={mobileOpen} onClose={closeMobile} />

      {/* Main content area */}
      <div className="flex flex-1 flex-col min-w-0">
        <TopHeader onMenuOpen={openMobile} unreadCount={headerUnreadCount} />

        <main
          className="flex-1 overflow-y-auto"
          id="main-content"
          tabIndex={-1}
        >
          <div className="mx-auto max-w-6xl p-2 sm:p-4 lg:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
