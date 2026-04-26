/**
 * Dedupe Modal (CRM Phase 4)
 *
 * Reusable duplicate-check modal with two variants:
 *   - Hard stop: red border, "Duplicate Found - Hard Stop", only Cancel button
 *   - Soft stop: yellow border, "Possible Duplicate Found", override reason input,
 *                Proceed and Cancel buttons
 *
 * Used by lead and prospect forms when saving to check for duplicates.
 */

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@ui/components/ui/dialog';
import { Button } from '@ui/components/ui/button';
import { Badge } from '@ui/components/ui/badge';
import { Input } from '@ui/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@ui/components/ui/table';
import { AlertTriangle, XCircle, ShieldAlert } from 'lucide-react';

/* ---------- Interfaces ---------- */

export interface DedupeMatch {
  id: number;
  entity_type: string;
  name: string;
  email: string | null;
  phone: string | null;
  id_number: string | null;
  match_score: number;
  match_fields: string[];
}

export interface DedupeModalProps {
  isOpen: boolean;
  onClose: () => void;
  matches: DedupeMatch[];
  hasHardStop: boolean;
  onOverride: (reason: string) => void;
  onCancel: () => void;
}

/* ---------- Component ---------- */

export function DedupeModal({
  isOpen,
  onClose,
  matches,
  hasHardStop,
  onOverride,
  onCancel,
}: DedupeModalProps) {
  const [overrideReason, setOverrideReason] = useState('');

  function handleCancel() {
    setOverrideReason('');
    onCancel();
  }

  function handleOverride() {
    if (!overrideReason.trim()) return;
    onOverride(overrideReason.trim());
    setOverrideReason('');
  }

  function handleClose() {
    setOverrideReason('');
    onClose();
  }

  const borderClass = hasHardStop
    ? 'border-red-500 dark:border-red-600'
    : 'border-yellow-500 dark:border-yellow-600';

  const headerBgClass = hasHardStop
    ? 'bg-red-50 dark:bg-red-950'
    : 'bg-yellow-50 dark:bg-yellow-950';

  const headerTextClass = hasHardStop
    ? 'text-red-800 dark:text-red-300'
    : 'text-yellow-800 dark:text-yellow-300';

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className={`sm:max-w-[640px] border-2 ${borderClass}`}>
        <DialogHeader className={`rounded-t-md p-4 -m-6 mb-0 ${headerBgClass}`}>
          <DialogTitle className={`flex items-center gap-2 ${headerTextClass}`}>
            {hasHardStop ? (
              <>
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                Duplicate Found -- Hard Stop
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                Possible Duplicate Found
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-6">
          {/* Description */}
          <p className="text-sm text-muted-foreground">
            {hasHardStop
              ? 'An exact match was found in the system. This record cannot be created as it would result in a duplicate entry.'
              : 'A potential match was found in the system. You may proceed by providing a justification for overriding the duplicate check.'}
          </p>

          {/* Match count */}
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {matches.length} match{matches.length !== 1 ? 'es' : ''} found
            </span>
          </div>

          {/* Matched entities table */}
          {matches.length > 0 && (
            <div className="rounded-md border overflow-auto max-h-[240px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>ID Number</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Matched On</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matches.map((match: DedupeMatch) => (
                    <TableRow key={match.id}>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {match.entity_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-sm">{match.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {match.email ?? '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {match.phone ?? '-'}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {match.id_number ?? '-'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            match.match_score >= 90
                              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                              : match.match_score >= 70
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                              : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                          }
                        >
                          {match.match_score}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {match.match_fields.map((field: string) => (
                            <Badge key={field} variant="outline" className="text-xs">
                              {field}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Override reason (soft-stop only) */}
          {!hasHardStop && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Override Reason *
              </label>
              <Input
                placeholder="Provide justification for proceeding despite the potential duplicate..."
                value={overrideReason}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOverrideReason(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                This reason will be logged in the audit trail for compliance review.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="pt-4">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          {!hasHardStop && (
            <Button
              onClick={handleOverride}
              disabled={!overrideReason.trim()}
              className="bg-yellow-600 hover:bg-yellow-700 text-white"
            >
              Proceed with Override
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
