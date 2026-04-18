/**
 * Client Portal - Messages Page (Phase 5C)
 *
 * Features:
 * - Simple messaging interface
 * - Message list (stub: hardcoded messages from RM and system)
 * - Compose new message textarea + send button
 * - Success toast on send
 */

import { useState } from "react";
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
} from "lucide-react";
import { useToast } from "@ui/components/ui/toast";

// ---- Stub Messages ----

interface Message {
  id: string;
  from: string;
  fromType: "rm" | "system" | "client";
  subject: string;
  body: string;
  date: string;
  read: boolean;
}

const initialMessages: Message[] = [
  {
    id: "msg-001",
    from: "Maria Santos (Relationship Manager)",
    fromType: "rm",
    subject: "Quarterly Portfolio Review",
    body: "Dear Client, I would like to schedule our quarterly portfolio review for next week. Please let me know your available times. We will discuss your portfolio performance and any adjustments to your investment strategy.",
    date: "2026-04-15T09:30:00Z",
    read: false,
  },
  {
    id: "msg-002",
    from: "TrustOMS System",
    fromType: "system",
    subject: "Monthly Statement Available",
    body: "Your monthly portfolio statement for March 2026 is now available for download. You can access it from the Statements section of your portal.",
    date: "2026-04-05T08:00:00Z",
    read: true,
  },
  {
    id: "msg-003",
    from: "Maria Santos (Relationship Manager)",
    fromType: "rm",
    subject: "New Investment Opportunity",
    body: "We have identified a new fixed income opportunity that aligns with your investment mandate. The BSP T-bonds issuance next week offers competitive yields. Would you like to discuss this further?",
    date: "2026-03-28T14:15:00Z",
    read: true,
  },
  {
    id: "msg-004",
    from: "TrustOMS System",
    fromType: "system",
    subject: "Contribution Received",
    body: "Your contribution request REQ-20260320-ABC123 has been processed successfully. PHP 500,000.00 has been credited to your portfolio. The new balance will reflect in your next statement.",
    date: "2026-03-20T11:45:00Z",
    read: true,
  },
  {
    id: "msg-005",
    from: "Juan Cruz (Investment Analyst)",
    fromType: "rm",
    subject: "Market Update - Q1 2026",
    body: "Please find attached our Q1 2026 market outlook. Key highlights include the BSP rate decision impact on fixed income, equity market trends, and our sector allocation recommendations for the quarter.",
    date: "2026-03-10T16:00:00Z",
    read: true,
  },
];

// ---- Component ----

export default function MessagesPage() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [composeMode, setComposeMode] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const unreadCount = messages.filter((m) => !m.read).length;

  const handleSelectMessage = (msg: Message) => {
    // Mark as read
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, read: true } : m)),
    );
    setSelectedMessage(msg);
    setComposeMode(false);
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

    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      from: "You",
      fromType: "client",
      subject: subject.trim() || "General Inquiry",
      body: body.trim(),
      date: new Date().toISOString(),
      read: true,
    };

    setMessages((prev) => [newMessage, ...prev]);
    setSubject("");
    setBody("");
    setComposeMode(false);
    setSelectedMessage(newMessage);

    toast({
      title: "Message Sent",
      description:
        "Your message has been sent to your relationship manager. You will receive a response within 1-2 business days.",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Messages</h1>
          <p className="text-sm text-slate-500 mt-1">
            Communicate with your relationship manager
          </p>
        </div>
        <Button
          className="bg-teal-600 hover:bg-teal-700 text-white"
          onClick={() => {
            setComposeMode(true);
            setSelectedMessage(null);
          }}
        >
          <PenLine className="h-4 w-4 mr-2" />
          New Message
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Message List */}
        <Card className="border-slate-200 lg:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Inbox className="h-4 w-4 text-slate-400" />
                <CardTitle className="text-base text-slate-900">Inbox</CardTitle>
              </div>
              {unreadCount > 0 && (
                <Badge className="bg-teal-600 text-white text-xs">
                  {unreadCount} new
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {messages.map((msg) => (
                <button
                  key={msg.id}
                  onClick={() => handleSelectMessage(msg)}
                  className={`w-full text-left p-4 transition-colors hover:bg-slate-50 ${
                    selectedMessage?.id === msg.id ? "bg-teal-50 border-l-2 border-l-teal-500" : ""
                  } ${!msg.read ? "bg-teal-50/50" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full shrink-0 ${
                        msg.fromType === "system"
                          ? "bg-purple-100"
                          : msg.fromType === "client"
                            ? "bg-teal-100"
                            : "bg-blue-100"
                      }`}
                    >
                      {msg.fromType === "system" ? (
                        <Bot className="h-4 w-4 text-purple-600" />
                      ) : msg.fromType === "client" ? (
                        <User className="h-4 w-4 text-teal-600" />
                      ) : (
                        <User className="h-4 w-4 text-blue-600" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm truncate ${
                            !msg.read
                              ? "font-semibold text-slate-900"
                              : "font-medium text-slate-700"
                          }`}
                        >
                          {msg.subject}
                        </span>
                        {!msg.read && (
                          <span className="h-2 w-2 rounded-full bg-teal-500 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {msg.from}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {new Date(msg.date).toLocaleDateString("en-PH", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Message Detail / Compose */}
        <Card className="border-slate-200 lg:col-span-2">
          {composeMode ? (
            <>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <PenLine className="h-4 w-4 text-slate-400" />
                  <CardTitle className="text-base text-slate-900">
                    New Message
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">
                    To
                  </label>
                  <div className="px-3 py-2 rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-600">
                    Relationship Manager
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="subject"
                    className="text-sm font-medium text-slate-700 mb-1 block"
                  >
                    Subject
                  </label>
                  <input
                    id="subject"
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Enter subject..."
                    className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="body"
                    className="text-sm font-medium text-slate-700 mb-1 block"
                  >
                    Message
                  </label>
                  <Textarea
                    id="body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Type your message here..."
                    rows={8}
                    className="border-slate-300 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setComposeMode(false)}
                    className="border-slate-300"
                  >
                    Cancel
                  </Button>
                  <Button
                    className="bg-teal-600 hover:bg-teal-700 text-white"
                    onClick={handleSend}
                  >
                    <Send className="h-4 w-4 mr-2" />
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
                    <CardTitle className="text-base text-slate-900">
                      {selectedMessage.subject}
                    </CardTitle>
                    <div className="flex items-center gap-2 mt-2">
                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded-full ${
                          selectedMessage.fromType === "system"
                            ? "bg-purple-100"
                            : selectedMessage.fromType === "client"
                              ? "bg-teal-100"
                              : "bg-blue-100"
                        }`}
                      >
                        {selectedMessage.fromType === "system" ? (
                          <Bot className="h-3 w-3 text-purple-600" />
                        ) : (
                          <User className="h-3 w-3 text-blue-600" />
                        )}
                      </div>
                      <span className="text-sm text-slate-600">
                        {selectedMessage.from}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
                    <Clock className="h-3 w-3" />
                    {new Date(selectedMessage.date).toLocaleDateString(
                      "en-PH",
                      {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none">
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {selectedMessage.body}
                  </p>
                </div>

                {/* Quick Reply */}
                {selectedMessage.fromType !== "client" && (
                  <div className="mt-6 pt-4 border-t border-slate-100">
                    <p className="text-sm font-medium text-slate-700 mb-2">
                      Quick Reply
                    </p>
                    <div className="flex gap-2">
                      <Textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder="Type your reply..."
                        rows={3}
                        className="flex-1 border-slate-300 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <div className="flex justify-end mt-2">
                      <Button
                        className="bg-teal-600 hover:bg-teal-700 text-white"
                        size="sm"
                        onClick={() => {
                          if (body.trim()) {
                            setSubject(`Re: ${selectedMessage.subject}`);
                            handleSend();
                          }
                        }}
                      >
                        <Send className="h-3.5 w-3.5 mr-1.5" />
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
                <MessageSquare className="h-12 w-12 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-500">
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
