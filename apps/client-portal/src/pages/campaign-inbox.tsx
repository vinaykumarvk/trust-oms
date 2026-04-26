/**
 * Client Portal - Campaign Inbox (Campaign Management Phase 1)
 *
 * Features:
 * - View campaign invitations sent to the client
 * - RSVP to event invitations
 * - View campaign details and communications
 * - Manage campaign consent preferences
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@ui/components/ui/card";
import { Button } from "@ui/components/ui/button";
import { Badge } from "@ui/components/ui/badge";
import { Separator } from "@ui/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@ui/components/ui/dialog";
import { Textarea } from "@ui/components/ui/textarea";
import {
  Mail,
  Calendar,
  MapPin,
  Clock,
  CheckCircle,
  XCircle,
  HelpCircle,
  Inbox,
  Eye,
} from "lucide-react";
import { toast } from "sonner";

interface CampaignComm {
  id: number;
  campaign_id: number;
  campaign_name: string;
  campaign_type: string;
  channel: string;
  subject: string;
  body: string;
  dispatch_status: string;
  sent_at: string | null;
  event_name: string | null;
  event_date: string | null;
  event_venue: string | null;
  rsvp_status: string | null;
  created_at: string;
}

interface ListResult {
  data: CampaignComm[];
  total: number;
}

const campaignTypeLabels: Record<string, string> = {
  PRODUCT_LAUNCH: "Product Launch",
  EVENT_INVITATION: "Event Invitation",
  EDUCATIONAL: "Educational",
  REFERRAL: "Referral",
  CROSS_SELL: "Cross-sell",
  UP_SELL: "Up-sell",
  RETENTION: "Retention",
  RE_ENGAGEMENT: "Re-engagement",
};

const rsvpColors: Record<string, string> = {
  ACCEPTED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  DECLINED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  TENTATIVE: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  PENDING: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

export default function CampaignInbox() {
  const queryClient = useQueryClient();
  const [selectedComm, setSelectedComm] = useState<CampaignComm | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [rsvpNote, setRsvpNote] = useState("");

  const { data: commsResult, isPending } = useQuery<ListResult>({
    queryKey: ["client-campaign-inbox"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/client-portal/campaign-inbox")),
    refetchInterval: 60000,
  });

  const rsvpMutation = useMutation({
    mutationFn: ({
      commId,
      status,
      note,
    }: {
      commId: number;
      status: string;
      note: string;
    }) =>
      apiRequest("POST", apiUrl(`/api/v1/client-portal/campaign-inbox/${commId}/rsvp`), {
        rsvp_status: status,
        note,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-campaign-inbox"] });
      setDetailOpen(false);
      toast.success("RSVP submitted successfully");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const comms = commsResult?.data ?? [];
  const events = comms.filter((c: CampaignComm) => c.campaign_type === "EVENT_INVITATION");
  const other = comms.filter((c: CampaignComm) => c.campaign_type !== "EVENT_INVITATION");

  function renderCommCard(comm: CampaignComm) {
    const isEvent = comm.campaign_type === "EVENT_INVITATION";
    return (
      <Card
        key={comm.id}
        className="cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => {
          setSelectedComm(comm);
          setRsvpNote("");
          setDetailOpen(true);
        }}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              {isEvent ? (
                <Calendar className="h-5 w-5 text-blue-500" />
              ) : (
                <Mail className="h-5 w-5 text-gray-500" />
              )}
              <div>
                <CardTitle className="text-sm font-medium">{comm.subject || comm.campaign_name}</CardTitle>
                <CardDescription className="text-xs">
                  {campaignTypeLabels[comm.campaign_type] || comm.campaign_type}
                </CardDescription>
              </div>
            </div>
            {comm.rsvp_status && (
              <Badge className={rsvpColors[comm.rsvp_status] || ""} variant="secondary">
                {comm.rsvp_status}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isEvent && comm.event_date && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(comm.event_date).toLocaleDateString()}
              </span>
              {comm.event_venue && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {comm.event_venue}
                </span>
              )}
            </div>
          )}
          <p className="text-sm text-muted-foreground line-clamp-2">
            {comm.body?.substring(0, 150) || "No preview available"}
          </p>
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-muted-foreground">
              {comm.sent_at
                ? new Date(comm.sent_at).toLocaleDateString()
                : new Date(comm.created_at).toLocaleDateString()}
            </span>
            <Button variant="ghost" size="sm">
              <Eye className="h-3 w-3 mr-1" /> View
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Campaign Inbox</h1>
        <p className="text-muted-foreground">
          View campaign invitations and event RSVPs from your wealth manager
        </p>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">
            All ({comms.length})
          </TabsTrigger>
          <TabsTrigger value="events">
            Events ({events.length})
          </TabsTrigger>
          <TabsTrigger value="other">
            Other ({other.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          {isPending ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="pt-6 space-y-3">
                    <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-full animate-pulse rounded bg-muted" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : comms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Inbox className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-lg font-medium">No campaigns yet</p>
              <p className="text-sm">Campaign invitations from your wealth manager will appear here</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {comms.map((comm: CampaignComm) => renderCommCard(comm))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Calendar className="h-10 w-10 text-muted-foreground/50" />
              <p>No event invitations</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {events.map((comm: CampaignComm) => renderCommCard(comm))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="other" className="mt-4">
          {other.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Mail className="h-10 w-10 text-muted-foreground/50" />
              <p>No other campaigns</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {other.map((comm: CampaignComm) => renderCommCard(comm))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Detail / RSVP Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{selectedComm?.subject || selectedComm?.campaign_name}</DialogTitle>
          </DialogHeader>
          {selectedComm && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">
                  {campaignTypeLabels[selectedComm.campaign_type] || selectedComm.campaign_type}
                </Badge>
                {selectedComm.rsvp_status && (
                  <Badge className={rsvpColors[selectedComm.rsvp_status] || ""} variant="secondary">
                    RSVP: {selectedComm.rsvp_status}
                  </Badge>
                )}
              </div>

              {selectedComm.campaign_type === "EVENT_INVITATION" && (
                <Card>
                  <CardContent className="pt-4 space-y-2">
                    {selectedComm.event_name && (
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{selectedComm.event_name}</span>
                      </div>
                    )}
                    {selectedComm.event_date && (
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{new Date(selectedComm.event_date).toLocaleString()}</span>
                      </div>
                    )}
                    {selectedComm.event_venue && (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>{selectedComm.event_venue}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <Separator />

              <div className="text-sm whitespace-pre-wrap">{selectedComm.body}</div>

              {selectedComm.campaign_type === "EVENT_INVITATION" && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <p className="text-sm font-medium">RSVP to this event</p>
                    <Textarea
                      placeholder="Add a note (optional)"
                      value={rsvpNote}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRsvpNote(e.target.value)}
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        disabled={rsvpMutation.isPending}
                        onClick={() =>
                          rsvpMutation.mutate({
                            commId: selectedComm.id,
                            status: "ACCEPTED",
                            note: rsvpNote,
                          })
                        }
                      >
                        <CheckCircle className="h-4 w-4 mr-1" /> Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={rsvpMutation.isPending}
                        onClick={() =>
                          rsvpMutation.mutate({
                            commId: selectedComm.id,
                            status: "TENTATIVE",
                            note: rsvpNote,
                          })
                        }
                      >
                        <HelpCircle className="h-4 w-4 mr-1" /> Maybe
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={rsvpMutation.isPending}
                        onClick={() =>
                          rsvpMutation.mutate({
                            commId: selectedComm.id,
                            status: "DECLINED",
                            note: rsvpNote,
                          })
                        }
                      >
                        <XCircle className="h-4 w-4 mr-1" /> Decline
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
