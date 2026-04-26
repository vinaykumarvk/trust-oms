/**
 * Content Pack Admin -- TrustFees Pro Phase 5 (GAP-A14/B04)
 *
 * Admin page for managing regulatory content packs:
 *   - Summary cards: Staged, Active, Archived
 *   - Data table with pack details, status badges, signature verification
 *   - Actions: Upload New, Activate, Rollback
 *   - Signature hash display with valid/invalid badge
 */
import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import { Separator } from "@ui/components/ui/separator";
import { Skeleton } from "@ui/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@ui/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import {
  Package,
  Upload,
  CheckCircle,
  RotateCcw,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Archive,
  Layers,
  FileUp,
} from "lucide-react";

/* ---------- Constants ---------- */

const STATUS_COLORS: Record<string, string> = {
  STAGED: "bg-yellow-100 text-yellow-800",
  ACTIVE: "bg-green-100 text-green-800",
  ARCHIVED: "bg-gray-100 text-gray-800",
};

/* ---------- Helpers ---------- */

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "--";
  try {
    return new Date(d).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
};

/* ---------- Component ---------- */

export default function ContentPackAdmin() {
  const queryClient = useQueryClient();

  // Dialog states
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [activateDialog, setActivateDialog] = useState<any>(null);
  const [rollbackDialog, setRollbackDialog] = useState<any>(null);

  // Upload form state
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // Fetch content packs
  const { data: packsData, isLoading } = useQuery({
    queryKey: ["content-packs"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/content-packs")),
    refetchInterval: 30_000,
  });

  const packs = packsData?.data ?? [];

  // Summary counts
  const summary = useMemo(() => {
    const staged = packs.filter((p: any) => p.status === "STAGED").length;
    const active = packs.filter((p: any) => p.status === "ACTIVE").length;
    const archived = packs.filter((p: any) => p.status === "ARCHIVED").length;
    return { staged, active, archived };
  }, [packs]);

  // Mutations
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(apiUrl("/api/v1/content-packs/upload"), {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-packs"] });
      setUploadDialogOpen(false);
      setUploadFile(null);
    },
  });

  const activateMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl(`/api/v1/content-packs/${id}/activate`), {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-packs"] });
      setActivateDialog(null);
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl(`/api/v1/content-packs/${id}/rollback`), {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-packs"] });
      setRollbackDialog(null);
    },
  });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Content Pack Admin
          </h1>
          <p className="text-sm text-muted-foreground">
            TrustFees Pro -- manage regulatory content pack lifecycle with signature verification
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ["content-packs"] })
            }
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setUploadDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Upload New
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Staged</CardTitle>
            <FileUp className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.staged}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting activation
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.active}</div>
            <p className="text-xs text-muted-foreground">
              Currently in production
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Archived</CardTitle>
            <Archive className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.archived}</div>
            <p className="text-xs text-muted-foreground">
              Previous versions
            </p>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Data Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pack Name</TableHead>
                <TableHead>Jurisdiction</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Activated At</TableHead>
                <TableHead>Signature</TableHead>
                <TableHead className="w-[160px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground py-8"
                  >
                    No content packs found
                  </TableCell>
                </TableRow>
              ) : (
                packs.map((pack: any) => (
                  <TableRow key={pack.id}>
                    <TableCell className="font-medium">
                      {pack.pack_name}
                    </TableCell>
                    <TableCell className="text-sm">
                      {pack.jurisdiction ?? "--"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {pack.category ?? "--"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`text-xs ${
                          STATUS_COLORS[pack.status] ?? "bg-muted text-foreground"
                        }`}
                      >
                        {pack.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {fmtDate(pack.activated_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground max-w-[120px] truncate">
                          {pack.signature_hash
                            ? pack.signature_hash.slice(0, 16) + "..."
                            : "N/A"}
                        </span>
                        {pack.signature_hash && (
                          <Badge
                            variant="outline"
                            className={
                              pack.signature_valid
                                ? "text-green-700 border-green-300"
                                : "text-red-700 border-red-300"
                            }
                          >
                            {pack.signature_valid ? (
                              <ShieldCheck className="mr-1 h-3 w-3" />
                            ) : (
                              <ShieldAlert className="mr-1 h-3 w-3" />
                            )}
                            {pack.signature_valid ? "Valid" : "Invalid"}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {pack.status === "STAGED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => setActivateDialog(pack)}
                          >
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Activate
                          </Button>
                        )}
                        {pack.status === "ACTIVE" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-amber-600 border-amber-300"
                            onClick={() => setRollbackDialog(pack)}
                          >
                            <RotateCcw className="mr-1 h-3 w-3" />
                            Rollback
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

      <div className="text-xs text-muted-foreground">
        Showing {packs.length} content pack(s) | Auto-refresh every 30 seconds
      </div>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Content Pack</DialogTitle>
            <DialogDescription>
              Upload a new regulatory content pack file. The signature will be
              verified automatically upon upload.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Content Pack File</Label>
              <Input
                type="file"
                accept=".json,.zip,.tar.gz"
                onChange={(e) =>
                  setUploadFile(e.target.files?.[0] ?? null)
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUploadDialogOpen(false);
                setUploadFile(null);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!uploadFile || uploadMutation.isPending}
              onClick={() => {
                if (uploadFile) {
                  uploadMutation.mutate(uploadFile);
                }
              }}
            >
              {uploadMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
          {uploadMutation.error && (
            <div className="rounded-md border border-destructive p-3 mt-2">
              <p className="text-sm text-destructive">
                {(uploadMutation.error as any)?.message ?? "Upload failed"}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Activate Dialog */}
      <Dialog
        open={!!activateDialog}
        onOpenChange={(open) => {
          if (!open) setActivateDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Activate Content Pack</DialogTitle>
            <DialogDescription>
              Are you sure you want to activate{" "}
              <span className="font-semibold">{activateDialog?.pack_name}</span>?
              This will make it the current active pack for its jurisdiction/category.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivateDialog(null)}>
              Cancel
            </Button>
            <Button
              disabled={activateMutation.isPending}
              onClick={() => {
                if (activateDialog) {
                  activateMutation.mutate(activateDialog.id);
                }
              }}
            >
              {activateMutation.isPending ? "Activating..." : "Activate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rollback Dialog */}
      <Dialog
        open={!!rollbackDialog}
        onOpenChange={(open) => {
          if (!open) setRollbackDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rollback Content Pack</DialogTitle>
            <DialogDescription>
              Are you sure you want to rollback{" "}
              <span className="font-semibold">{rollbackDialog?.pack_name}</span>?
              The previous version will be restored as active.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRollbackDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={rollbackMutation.isPending}
              onClick={() => {
                if (rollbackDialog) {
                  rollbackMutation.mutate(rollbackDialog.id);
                }
              }}
            >
              {rollbackMutation.isPending ? "Rolling back..." : "Rollback"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
