/**
 * useOpsCrud — Generic CRUD hook for TrustOMS back-office entities.
 *
 * Provides paginated list query + create/update/delete mutations
 * with maker-checker (202) and version-conflict (409) handling.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@ui/lib/queryClient';
import { useToast } from '@ui/components/ui/toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseOpsCrudOptions {
  entityKey: string;
  apiPath?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  enabled?: boolean;
}

export interface PaginatedResponse<T = Record<string, unknown>> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOpsCrud<T = Record<string, unknown>>(
  options: UseOpsCrudOptions,
) {
  const {
    entityKey,
    apiPath: customApiPath,
    page = 1,
    pageSize = 25,
    search = '',
    sortBy = '',
    sortOrder = 'asc',
    enabled = true,
  } = options;

  const apiPath = customApiPath ?? `/api/v1/${entityKey}`;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ---- helpers ----------------------------------------------------------

  const listQueryKey = [
    entityKey,
    'list',
    { page, pageSize, search, sortBy, sortOrder },
  ];

  function buildQueryString() {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    if (search) params.set('search', search);
    if (sortBy) {
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);
    }
    return params.toString();
  }

  /** Shared handler for 202 (maker-checker) responses */
  function handleMakerChecker(res: unknown) {
    // apiRequest already parsed the JSON; a 202 body typically contains
    // a pending-approval payload. We surface a toast and return the body.
    toast({
      title: 'Submitted for approval',
      description:
        'This change requires maker-checker approval before it takes effect.',
    });
    return res;
  }

  /** Shared mutation error handler */
  function handleMutationError(error: unknown) {
    const err = error as Error & { status?: number };
    if (err.status === 409) {
      toast({
        title: 'Conflict',
        description: 'Record was modified by another user. Please refresh and try again.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Error',
        description: err.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    }
  }

  // ---- list query -------------------------------------------------------

  const listQuery = useQuery<PaginatedResponse<T>>({
    queryKey: listQueryKey,
    queryFn: async () => {
      return apiRequest('GET', `${apiPath}?${buildQueryString()}`);
    },
    enabled,
  });

  // ---- create mutation --------------------------------------------------

  const createMutation = useMutation({
    mutationFn: async (data: Partial<T>) => {
      return apiRequest('POST', apiPath, data);
    },
    onSuccess: (res) => {
      // Check for 202 (maker-checker pending) — apiRequest resolves the JSON
      // but we detect 202 by a conventional `status` field in the body.
      if (res && (res as Record<string, unknown>).__httpStatus === 202) {
        handleMakerChecker(res);
      } else {
        toast({ title: 'Created', description: 'Record created successfully.' });
      }
      queryClient.invalidateQueries({ queryKey: [entityKey, 'list'] });
    },
    onError: handleMutationError,
  });

  // ---- update mutation --------------------------------------------------

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string | number; data: Partial<T> }) => {
      return apiRequest('PUT', `${apiPath}/${payload.id}`, payload.data);
    },
    onSuccess: (res, variables) => {
      if (res && (res as Record<string, unknown>).__httpStatus === 202) {
        handleMakerChecker(res);
      } else {
        toast({ title: 'Updated', description: 'Record updated successfully.' });
      }
      queryClient.invalidateQueries({ queryKey: [entityKey, 'list'] });
      queryClient.invalidateQueries({
        queryKey: [entityKey, 'detail', variables.id],
      });
    },
    onError: handleMutationError,
  });

  // ---- delete mutation --------------------------------------------------

  const deleteMutation = useMutation({
    mutationFn: async (id: string | number) => {
      return apiRequest('DELETE', `${apiPath}/${id}`);
    },
    onSuccess: (res) => {
      if (res && (res as Record<string, unknown>).__httpStatus === 202) {
        handleMakerChecker(res);
      } else {
        toast({ title: 'Deleted', description: 'Record deleted successfully.' });
      }
      queryClient.invalidateQueries({ queryKey: [entityKey, 'list'] });
    },
    onError: handleMutationError,
  });

  return {
    listQuery,
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
