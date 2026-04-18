/**
 * NotificationBell — Phase 5D
 *
 * Reusable notification bell component for all app layout headers
 * (back-office, front-office, mid-office, client-portal).
 *
 * Props accept `apiUrl` and `apiRequest` so callers control routing
 * without import-path coupling.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { Skeleton } from './ui/skeleton';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Notification {
  id: number;
  event_type: string | null;
  channel: string | null;
  recipient_id: string | null;
  content_hash: string | null;
  notification_status: string | null;
  sent_at: string | null;
  delivered_at: string | null;
}

interface NotificationsResponse {
  data: Notification[];
  total: number;
  page: number;
  pageSize: number;
}

export interface NotificationBellProps {
  userId: string;
  /** Build an API URL from a relative path, e.g. `/notifications` */
  apiUrl: (path: string) => string;
  /** Execute an API request — must accept (url, options?) and return a Response-like */
  apiRequest: Function;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isUnread(n: Notification): boolean {
  return n.notification_status !== 'READ';
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

/** Decode base-64 content hash back to readable text (best-effort). */
function decodeContent(hash: string | null): string {
  if (!hash) return '';
  try {
    return atob(hash);
  } catch {
    return hash;
  }
}

function truncate(text: string, maxLen: number): string {
  return text.length <= maxLen ? text : text.slice(0, maxLen) + '...';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationBell({ userId, apiUrl, apiRequest }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  // -- Fetch last 10 notifications (poll every 30 s) -----------------------
  const {
    data: response,
    isLoading,
  } = useQuery<NotificationsResponse>({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      const url = apiUrl(`/notifications?recipientId=${encodeURIComponent(userId)}&pageSize=10&page=1`);
      const res = await apiRequest(url);
      if (typeof res.json === 'function') return res.json();
      return res;
    },
    refetchInterval: 30_000,
    enabled: !!userId,
  });

  const notifications = response?.data ?? [];
  const unreadCount = notifications.filter(isUnread).length;

  // -- Mark single notification as read ------------------------------------
  const markReadMutation = useMutation({
    mutationFn: async (id: number) => {
      const url = apiUrl(`/notifications/${id}/read`);
      return apiRequest(url, { method: 'PUT' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
    },
  });

  // -- Mark all as read ----------------------------------------------------
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const unread = notifications.filter(isUnread);
      await Promise.all(
        unread.map((n) => {
          const url = apiUrl(`/notifications/${n.id}/read`);
          return apiRequest(url, { method: 'PUT' });
        }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
    },
  });

  // -- Handler for clicking a notification row -----------------------------
  function handleNotificationClick(n: Notification) {
    if (isUnread(n)) {
      markReadMutation.mutate(n.id);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0 sm:w-96">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <h4 className="text-sm font-semibold">Notifications</h4>
          {unreadCount > 0 && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
            >
              <CheckCheck className="mr-1 inline-block h-3 w-3" />
              Mark all as read
            </button>
          )}
        </div>

        <Separator />

        {/* Content */}
        <ScrollArea className="max-h-[360px]">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="mb-2 h-8 w-8 opacity-40" />
              <p className="text-sm">No notifications</p>
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => {
                const unread = isUnread(n);
                const content = decodeContent(n.content_hash);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={cn(
                        'flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-muted/50',
                        unread && 'bg-muted/30',
                      )}
                      onClick={() => handleNotificationClick(n)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {unread && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                          )}
                          <Badge variant="secondary" className="text-[10px] uppercase">
                            {n.event_type ?? 'notification'}
                          </Badge>
                          {n.channel && (
                            <Badge variant="outline" className="text-[10px] uppercase">
                              {n.channel}
                            </Badge>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                          {formatTimestamp(n.sent_at)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-snug">
                        {truncate(content, 120)}
                      </p>
                      {!unread && (
                        <span className="mt-0.5 flex items-center text-[10px] text-muted-foreground/60">
                          <Check className="mr-0.5 h-3 w-3" /> Read
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
