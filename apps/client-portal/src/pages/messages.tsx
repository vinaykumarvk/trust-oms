/**
 * Client Portal - Messages Page (Phase 3A)
 *
 * Features:
 * - Two-panel layout: message list on left, detail/compose on right
 * - Real data from GET /api/v1/client-portal/messages (React Query)
 * - Unread count from GET /api/v1/client-portal/messages/unread-count
 * - Send new message via POST /api/v1/client-portal/messages
 * - Mark read via PATCH /api/v1/client-portal/messages/:id/read
 * - Loading/error states for each operation
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ui/components/ui/card";
import { Button } from "@ui/components/ui/button";
import { Textarea } from "@ui/components/ui/textarea";
import { Badge } from "@ui/components/ui/badge";
import {
  MessageSquare,
  Send,
  User,
  Bot,
  Clock,
  Inbox,
  PenLine,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@ui/components/ui/toast";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";

// ---------------------------------------------------------------------------
// Types matching the API response shape
// ---------------------------------------------------------------------------

interface ApiMessage {
  id: number;
  thread_id: string | null;
  sender_id: number;
  sender_type: "RM" | "CLIENT" | "SYSTEM";
  recipient_client_id: string;
  subject: string | null;
  body: string;
  is_read: boolean;
  parent_message_id: number | null;
  related_sr_id: number | null;
  read_at: string | null;
  sent_at: string;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MessagesResponse {
  data: ApiMessage[];
  total: number;
  unread_count: number;
}

interface UnreadCountResponse {
  unread_count: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getClientUser() {
  try {
    const stored = localStorage.getItem("trustoms-client-user");
    if (stored) return JSON.parse(stored) as { clientId?: string; token?: string; id?: number };
  } catch {
    // ignore
  }
  return {};
}

function senderLabel(msg: ApiMessage): string {
  if (msg.sender_type === "CLIENT") return "You";
  if (msg.sender_type === "SYSTEM") return "TrustOMS System";
  return "Relationship Manager";
}

function fromType(msg: ApiMessage): "rm" | "system" | "client" {
  if (msg.sender_type === "CLIENT") return "client";
  if (msg.sender_type === "SYSTEM") return "system";
  return "rm";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MessagesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const clientUser = getClientUser();
  const clientId = clientUser.clientId || "CLT-001";

  const [selectedMessage, setSelectedMessage] = useState<ApiMessage | null>(null);
  const [composeMode, setComposeMode] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  // ---- Queries ----

  const {
    data: messagesData,
    isLoading: messagesLoading,
    isError: messagesError,
  } = useQuery<MessagesResponse>({
    queryKey: ["client-portal", "messages", clientId],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/client-portal/messages")),
    refetchInterval: 60000,
  });

  const { data: unreadData } = useQuery<UnreadCountResponse>({
    queryKey: ["client-portal", "messages-unread", clientId],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/client-portal/messages/unread-count")),
    refetchInterval: 60000,
  });

  const messages: ApiMessage[] = messagesData?.data ?? [];
  const unreadCount = unreadData?.unread_count ?? messagesData?.unread_count ?? 0;

  // ---- Mutations ----

  const sendMutation = useMutation({
    mutationFn: (payload: { subject?: string; body: string; thread_id?: string | null; parent_message_id?: number | null }) =>
      apiRequest("POST", apiUrl("/api/v1/client-portal/messages"), payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-portal", "messages", clientId] });
      qc.invalidateQueries({ queryKey: ["client-portal", "messages-unread", clientId] });
      setSubject("");
      setBody("");
      setComposeMode(false);
      setSelectedMessage(null);
      toast({
        title: "Message Sent",
        description:
          "Your message has been sent to your relationship manager. You will receive a response within 1-2 business days.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to Send",
        description: "Could not send your message. Please try again.",
        variant: "destructive",
      });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (messageId: number) =>
      apiRequest("PATCH", apiUrl(`/api/v1/client-portal/messages/${messageId}/read`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-portal", "messages", clientId] });
      qc.invalidateQueries({ queryKey: ["client-portal", "messages-unread", clientId] });
    },
  });

  // ---- Handlers ----

  const handleSelectMessage = (msg: ApiMessage) => {
    setSelectedMessage(msg);
    setComposeMode(false);
    setBody("");
    if (!msg.is_read) {
      markReadMutation.mutate(msg.id);
    }
  };

  const handleSend = () => {
    if (!body.trim()) {
      toast({
        title: "Error",
        description: "Please enter a message before sending.",
        variant: "destructive",
      });
      return;
    }

    const isNewThread = !selectedMessage;
    if (isNewThread && !subject.trim()) {
      toast({
        title: "Error",
        description: "Please enter a subject for new messages.",
        variant: "destructive",
      });
      return;
    }

    sendMutation.mutate({
      subject: isNewThread ? subject.trim() : undefined,
      body: body.trim(),
      thread_id: selectedMessage?.thread_id ?? null,
      parent_message_id: selectedMessage?.id ?? null,
    });
  };

  // ---- Render ----

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-white">Messages</h1>
          <p className="text-xs sm:text-sm text-muted-foreground dark:text-gray-400 mt-1">
            Communicate with your relationship manager
          </p>
        </div>
        <Button
          className="bg-teal-600 hover:bg-teal-700 text-white"
          onClick={() => {
            setComposeMode(true);
            setSelectedMessage(null);
            setBody("");
            setSubject("");
          }}
        >
          <PenLine className="h-4 w-4 mr-2" />
          New Message
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* ---- Left Panel: Message List ---- */}
        <Card className="border-border dark:border-gray-700 dark:bg-gray-800 lg:col-span-1">
          <CardHeader className="pb-3 px-3 sm:px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Inbox className="h-4 w-4 text-muted-foreground dark:text-gray-400" />
                <CardTitle className="text-sm sm:text-base text-foreground dark:text-gray-100">Inbox</CardTitle>
              </div>
              {unreadCount > 0 && (
                <Badge className="bg-teal-600 text-white text-xs">
                  {unreadCount} new
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {messagesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : messagesError ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-destructive">
                <AlertCircle className="h-6 w-6" />
                <p className="text-sm">Failed to load messages</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">No messages yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border dark:divide-gray-700 max-h-[500px] overflow-y-auto">
                {messages.map((msg) => {
                  const type = fromType(msg);
                  const isSelected = selectedMessage?.id === msg.id;
                  return (
                    <button
                      type="button"
                      key={msg.id}
                      onClick={() => handleSelectMessage(msg)}
                      className={`w-full text-left p-3 sm:p-4 transition-colors hover:bg-muted dark:hover:bg-gray-700 ${
                        isSelected ? "bg-teal-50 dark:bg-teal-900/20 border-l-2 border-l-teal-500" : ""
                      } ${!msg.is_read ? "bg-teal-50/50 dark:bg-teal-900/10" : ""}`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-full shrink-0 ${
                            type === "system"
                              ? "bg-purple-100 dark:bg-purple-900/30"
                              : type === "client"
                                ? "bg-teal-100 dark:bg-teal-900/30"
                                : "bg-blue-100 dark:bg-blue-900/30"
                          }`}
                        >
                          {type === "system" ? (
                            <Bot className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                          ) : type === "client" ? (
                            <User className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                          ) : (
                            <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm truncate ${
                                !msg.is_read
                                  ? "font-semibold text-foreground"
                                  : "font-medium text-foreground"
                              }`}
                            >
                              {msg.subject || "(No subject)"}
                            </span>
                            {!msg.is_read && (
                              <span className="h-2 w-2 rounded-full bg-teal-500 shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground dark:text-gray-400 truncate mt-0.5">
                            {senderLabel(msg)}
                          </p>
                          <p className="text-[10px] text-muted-foreground dark:text-gray-500 mt-0.5">
                            {new Date(msg.sent_at).toLocaleDateString("en-PH", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ---- Right Panel: Detail / Compose ---- */}
        <Card className="border-border dark:border-gray-700 dark:bg-gray-800 lg:col-span-2">
          {composeMode ? (
            <>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <PenLine className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base text-foreground">
                    New Message
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground dark:text-gray-200 mb-1 block">
                    To
                  </label>
                  <div className="px-3 py-2 rounded-md border border-border dark:border-gray-600 bg-muted dark:bg-gray-700 text-sm text-muted-foreground dark:text-gray-400">
                    Relationship Manager
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="subject"
                    className="text-sm font-medium text-foreground dark:text-gray-200 mb-1 block"
                  >
                    Subject <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="subject"
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Enter subject..."
                    className="w-full px-3 py-2 rounded-md border border-border dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder:text-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="body"
                    className="text-sm font-medium text-foreground dark:text-gray-200 mb-1 block"
                  >
                    Message <span className="text-red-500">*</span>
                  </label>
                  <Textarea
                    id="body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Type your message here..."
                    rows={8}
                    className="border-border dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder:text-gray-400 focus:ring-teal-500 focus:border-teal-500"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1 text-right">
                    {body.length} / 5000
                  </p>
                </div>
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setComposeMode(false)}
                    className="border-border"
                    disabled={sendMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="bg-teal-600 hover:bg-teal-700 text-white"
                    onClick={handleSend}
                    disabled={sendMutation.isPending}
                  >
                    {sendMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Send Message
                  </Button>
                </div>
              </CardContent>
            </>
          ) : selectedMessage ? (
            <>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base text-foreground">
                      {selectedMessage.subject || "(No subject)"}
                    </CardTitle>
                    <div className="flex items-center gap-2 mt-2">
                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded-full ${
                          fromType(selectedMessage) === "system"
                            ? "bg-purple-100"
                            : fromType(selectedMessage) === "client"
                              ? "bg-teal-100"
                              : "bg-blue-100"
                        }`}
                      >
                        {fromType(selectedMessage) === "system" ? (
                          <Bot className="h-3 w-3 text-purple-600" />
                        ) : (
                          <User className="h-3 w-3 text-blue-600" />
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {senderLabel(selectedMessage)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                    <Clock className="h-3 w-3" />
                    {new Date(selectedMessage.sent_at).toLocaleDateString("en-PH", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <p className="text-sm text-foreground dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                    {selectedMessage.body}
                  </p>
                </div>

                {/* Quick Reply — only for messages not sent by the client */}
                {fromType(selectedMessage) !== "client" && (
                  <div className="mt-6 pt-4 border-t border-border dark:border-gray-700">
                    <p
                      id="quick-reply-label"
                      className="text-sm font-medium text-foreground dark:text-gray-200 mb-2"
                    >
                      Quick Reply
                    </p>
                    <div className="flex gap-2">
                      <Textarea
                        id="quick-reply-body"
                        aria-labelledby="quick-reply-label"
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder="Type your reply..."
                        rows={3}
                        className="flex-1 border-border dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder:text-gray-400 focus:ring-teal-500 focus:border-teal-500"
                        disabled={sendMutation.isPending}
                      />
                    </div>
                    <div className="flex justify-end mt-2">
                      <Button
                        className="bg-teal-600 hover:bg-teal-700 text-white"
                        size="sm"
                        onClick={handleSend}
                        disabled={sendMutation.isPending || !body.trim()}
                      >
                        {sendMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Reply
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </>
          ) : (
            <CardContent className="flex items-center justify-center py-16">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Select a message or compose a new one
                </p>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
