/**
 * Back-Office Layout with Collapsible Sidebar Navigation
 *
 * Full sidebar layout for the TrustOMS back-office console.
 * Features:
 * - Collapsible sidebar (256px expanded / 64px collapsed icon-only mode)
 * - Mobile responsive via Sheet overlay
 * - Active route highlighting
 * - User info placeholder at bottom
 * - Collapsible navigation sections
 * - Skip-link for accessibility
 * - localStorage persistence for collapsed state
 */

import { useState, useCallback, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@ui/components/ui/button";
import { ScrollArea } from "@ui/components/ui/scroll-area";
import { Separator } from "@ui/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@ui/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@ui/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@ui/components/ui/collapsible";
import {
  LogOut,
  PanelLeftClose,
  PanelLeft,
  ChevronDown,
  Menu,
  User,
} from "lucide-react";
import { cn } from "@ui/lib/utils";
import {
  dashboardItem,
  navSections,
  type NavSection,
  type NavItem,
} from "@/config/navigation";

const SIDEBAR_COLLAPSED_KEY = "trustoms-sidebar-collapsed";

function getInitialCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return stored === "true";
  } catch {
    return false;
  }
}

// ---- Skip Link for Accessibility ----

function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
    >
      Skip to main content
    </a>
  );
}

// ---- Sidebar Internals ----

interface SidebarNavProps {
  collapsed: boolean;
  onNavigate?: () => void;
}

function SidebarNav({ collapsed, onNavigate }: SidebarNavProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      navSections.map((s) => [s.label, s.defaultOpen ?? false])
    )
  );

  const toggleSection = (label: string) => {
    setOpenSections((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  const handleClick = (path: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    navigate(path);
    onNavigate?.();
  };

  const renderNavItem = (item: NavItem, index: number) => {
    const active = isActive(item.path);
    const key = `${item.path}-${index}`;

    if (collapsed) {
      return (
        <Tooltip key={key}>
          <TooltipTrigger asChild>
            <a
              href={item.path}
              onClick={handleClick(item.path)}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-md transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
              aria-current={active ? "page" : undefined}
            >
              <item.icon className="h-4 w-4" />
            </a>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            {item.label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <a
        key={key}
        href={item.path}
        onClick={handleClick(item.path)}
        className={cn(
          "flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        )}
        aria-current={active ? "page" : undefined}
      >
        <item.icon
          className={cn(
            "h-4 w-4 shrink-0",
            active ? "text-primary-foreground" : "text-muted-foreground"
          )}
        />
        <span className="truncate">{item.label}</span>
      </a>
    );
  };

  const renderSection = (section: NavSection, sectionIndex: number) => {
    const isOpen = openSections[section.label] ?? false;
    const hasSectionActive = section.items.some((i) => isActive(i.path));

    if (collapsed) {
      return (
        <div key={section.label} className="flex flex-col items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-md",
                  hasSectionActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <section.icon className="h-4 w-4" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {section.label}
            </TooltipContent>
          </Tooltip>
          {section.items.map((item, idx) => renderNavItem(item, sectionIndex * 100 + idx))}
        </div>
      );
    }

    return (
      <div key={section.label} className="bg-background/60 rounded-lg border border-border/50">
        <Collapsible open={isOpen} onOpenChange={() => toggleSection(section.label)}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition hover:bg-muted/60"
            >
              <div className="flex items-center gap-2">
                <section.icon
                  className={cn(
                    "h-4 w-4",
                    hasSectionActive ? "text-primary" : "text-muted-foreground"
                  )}
                />
                <span className="text-sm font-semibold text-foreground">
                  {section.label}
                </span>
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  isOpen ? "rotate-180" : "rotate-0"
                )}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex flex-col gap-0.5 px-1 pb-2">
              {section.items.map((item, idx) => renderNavItem(item, sectionIndex * 100 + idx))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  };

  // Dashboard item (standalone)
  const dashActive = isActive(dashboardItem.path) && location.pathname === "/";
  const dashboardElement = collapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={dashboardItem.path}
          onClick={handleClick(dashboardItem.path)}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-md transition-colors",
            dashActive
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          )}
          aria-current={dashActive ? "page" : undefined}
        >
          <dashboardItem.icon className="h-4 w-4" />
        </a>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        {dashboardItem.label}
      </TooltipContent>
    </Tooltip>
  ) : (
    <a
      href={dashboardItem.path}
      onClick={handleClick(dashboardItem.path)}
      className={cn(
        "flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors",
        dashActive
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
      aria-current={dashActive ? "page" : undefined}
    >
      <dashboardItem.icon
        className={cn(
          "h-4 w-4 shrink-0",
          dashActive ? "text-primary-foreground" : "text-muted-foreground"
        )}
      />
      <span>Dashboard</span>
    </a>
  );

  return (
    <nav
      className={cn("flex flex-col gap-3", collapsed ? "items-center px-2" : "px-3")}
      aria-label="Sidebar navigation"
    >
      {dashboardElement}
      <Separator className={collapsed ? "w-9" : ""} />
      {navSections.map((section, idx) => (
        <div key={section.label}>
          {renderSection(section, idx)}
          {idx < navSections.length - 1 && collapsed && (
            <Separator className="w-9 my-1" />
          )}
        </div>
      ))}
    </nav>
  );
}

// ---- Sidebar Header ----

function SidebarHeader({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return (
      <div className="flex h-14 items-center justify-center border-b border-border px-2">
        <span className="text-lg font-bold text-primary">T</span>
      </div>
    );
  }

  return (
    <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
        <span className="text-sm font-bold text-primary-foreground">T</span>
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold leading-tight text-foreground">
          TrustOMS
        </span>
        <span className="text-[10px] text-muted-foreground leading-tight">
          Back Office Console
        </span>
      </div>
    </div>
  );
}

// ---- Sidebar Footer (user placeholder) ----

function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("trustoms-user");
    navigate("/login");
  };

  // Read mock user from localStorage
  let displayName = "Operator";
  let email = "";
  try {
    const stored = localStorage.getItem("trustoms-user");
    if (stored) {
      const user = JSON.parse(stored);
      displayName = user.name || user.email || "Operator";
      email = user.email || "";
    }
  } catch {
    // ignore
  }

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 border-t border-border py-3 px-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            {displayName}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Log out"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            Log out
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="border-t border-border p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-sm font-medium truncate text-foreground">
            {displayName}
          </span>
          {email && (
            <span className="text-[10px] text-muted-foreground truncate">
              {email}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label="Log out"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ---- Desktop Sidebar ----

function DesktopSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      className={cn(
        "hidden lg:flex lg:flex-shrink-0 flex-col h-dvh border-r border-border bg-background transition-[width] duration-200 ease-in-out",
        collapsed ? "w-16" : "w-64"
      )}
      aria-label="Main navigation"
    >
      <SidebarHeader collapsed={collapsed} />

      {/* Collapse toggle */}
      <div
        className={cn(
          "flex px-2 py-2",
          collapsed ? "justify-center" : "justify-end"
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onToggle}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <PanelLeft className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            {collapsed ? "Expand sidebar" : "Collapse sidebar"}
          </TooltipContent>
        </Tooltip>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-2">
          <SidebarNav collapsed={collapsed} />
        </div>
      </ScrollArea>

      <SidebarFooter collapsed={collapsed} />
    </aside>
  );
}

// ---- Mobile Header + Sheet ----

function MobileHeader({ onOpen }: { onOpen: () => void }) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background/95 backdrop-blur px-4 lg:hidden">
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        onClick={onOpen}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
          <span className="text-xs font-bold text-primary-foreground">T</span>
        </div>
        <span className="text-sm font-semibold text-foreground">TrustOMS</span>
      </div>
    </header>
  );
}

function MobileSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="left" className="w-72 p-0">
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>
        <SidebarHeader collapsed={false} />
        <ScrollArea className="flex-1 h-[calc(100dvh-3.5rem-4.5rem)]">
          <div className="py-3">
            <SidebarNav collapsed={false} onNavigate={onClose} />
          </div>
        </ScrollArea>
        <SidebarFooter collapsed={false} />
      </SheetContent>
    </Sheet>
  );
}

// ---- Main Layout Export ----

export function BackOfficeLayout() {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Persist collapsed state
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    } catch {
      // ignore
    }
  }, [collapsed]);

  const toggleCollapsed = useCallback(() => setCollapsed((c) => !c), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const openMobile = useCallback(() => setMobileOpen(true), []);

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-dvh overflow-hidden">
        <SkipLink />

        {/* Desktop sidebar */}
        <DesktopSidebar collapsed={collapsed} onToggle={toggleCollapsed} />

        {/* Mobile sidebar */}
        <MobileSidebar open={mobileOpen} onClose={closeMobile} />

        {/* Main content area */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Mobile header */}
          <MobileHeader onOpen={openMobile} />

          <main
            className="flex-1 overflow-y-auto bg-background"
            id="main-content"
            tabIndex={-1}
          >
            <div className="mx-auto max-w-7xl p-6">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
