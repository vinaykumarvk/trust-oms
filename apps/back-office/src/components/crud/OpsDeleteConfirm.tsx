/**
 * OpsDeleteConfirm — AlertDialog that confirms entity deletion.
 *
 * Optionally checks for blocking dependencies before allowing delete.
 */

import { useState, useEffect } from 'react';
import { apiRequest } from '@ui/lib/queryClient';
import { Button } from '@ui/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@ui/components/ui/alert-dialog';
import { Loader2, AlertTriangle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpsDeleteConfirmProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  entityName: string;
  recordIdentifier: string;
  isDeleting?: boolean;
  dependencyCheckUrl?: string;
}

interface DependencyResult {
  hasDependencies: boolean;
  dependencies: Array<{
    entityName: string;
    count: number;
  }>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OpsDeleteConfirm({
  isOpen,
  onClose,
  onConfirm,
  entityName,
  recordIdentifier,
  isDeleting = false,
  dependencyCheckUrl,
}: OpsDeleteConfirmProps) {
  const [depResult, setDepResult] = useState<DependencyResult | null>(null);
  const [depLoading, setDepLoading] = useState(false);
  const [depError, setDepError] = useState<string | null>(null);

  // Fetch dependency check when dialog opens
  useEffect(() => {
    if (!isOpen) {
      setDepResult(null);
      setDepError(null);
      setDepLoading(false);
      return;
    }

    if (!dependencyCheckUrl) return;

    let cancelled = false;
    setDepLoading(true);
    setDepError(null);

    apiRequest('GET', dependencyCheckUrl)
      .then((res) => {
        if (!cancelled) {
          setDepResult(res as DependencyResult);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setDepError(err.message || 'Failed to check dependencies.');
        }
      })
      .finally(() => {
        if (!cancelled) setDepLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, dependencyCheckUrl]);

  const hasBlockingDependencies = depResult?.hasDependencies === true;

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete {entityName}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete{' '}
            <span className="font-medium text-foreground">{recordIdentifier}</span>?
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Dependency check results */}
        {depLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking for dependencies...
          </div>
        )}

        {depError && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {depError}
          </div>
        )}

        {hasBlockingDependencies && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
            <p className="text-sm font-medium text-destructive">
              Cannot delete — this record has dependencies:
            </p>
            <ul className="mt-2 space-y-1">
              {depResult!.dependencies.map((dep) => (
                <li
                  key={dep.entityName}
                  className="text-sm text-muted-foreground"
                >
                  {dep.entityName}: {dep.count} record{dep.count !== 1 ? 's' : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          {hasBlockingDependencies ? (
            <Button variant="destructive" disabled>
              Delete
            </Button>
          ) : (
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onConfirm();
              }}
              disabled={isDeleting || depLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
