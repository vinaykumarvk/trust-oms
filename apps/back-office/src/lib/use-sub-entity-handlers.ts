/**
 * useSubEntityHandlers — shared hook for lead-form & prospect-form
 *
 * Encapsulates the 15 identical handler functions for managing
 * sub-entity arrays (family members, addresses, identifications,
 * documents) and product interest toggles.
 */

import { type Dispatch, type SetStateAction, useCallback } from 'react';
import type {
  CrmFamilyMember,
  CrmAddress,
  CrmIdentification,
  CrmDocumentRecord,
  CrmSubEntities,
} from './crm-constants';

type FormWithSubEntities = CrmSubEntities & Record<string, unknown>;

export function useSubEntityHandlers<T extends FormWithSubEntities>(
  setForm: Dispatch<SetStateAction<T>>,
) {
  /* ---- Generic field updater ---- */

  const updateField = useCallback(
    (field: keyof T, value: unknown) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [setForm],
  );

  /* ---- Family Members ---- */

  const addFamilyMember = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      family_members: [
        ...prev.family_members,
        { relationship: '', first_name: '', last_name: '', dob: '', occupation: '', contact_number: '' },
      ],
    }));
  }, [setForm]);

  const removeFamilyMember = useCallback(
    (index: number) => {
      setForm((prev) => ({
        ...prev,
        family_members: prev.family_members.filter((_: CrmFamilyMember, i: number) => i !== index),
      }));
    },
    [setForm],
  );

  const updateFamilyMember = useCallback(
    (index: number, field: keyof CrmFamilyMember, value: string) => {
      setForm((prev) => ({
        ...prev,
        family_members: prev.family_members.map((m: CrmFamilyMember, i: number) =>
          i === index ? { ...m, [field]: value } : m,
        ),
      }));
    },
    [setForm],
  );

  /* ---- Addresses ---- */

  const addAddress = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      addresses: [
        ...prev.addresses,
        {
          address_type: 'HOME',
          address_line_1: '',
          address_line_2: '',
          city: '',
          state: '',
          postal_code: '',
          country: 'Philippines',
          is_primary: prev.addresses.length === 0,
        },
      ],
    }));
  }, [setForm]);

  const removeAddress = useCallback(
    (index: number) => {
      setForm((prev) => ({
        ...prev,
        addresses: prev.addresses.filter((_: CrmAddress, i: number) => i !== index),
      }));
    },
    [setForm],
  );

  const updateAddress = useCallback(
    (index: number, field: keyof CrmAddress, value: string | boolean) => {
      setForm((prev) => ({
        ...prev,
        addresses: prev.addresses.map((a: CrmAddress, i: number) =>
          i === index
            ? { ...a, [field]: value }
            : field === 'is_primary' && value === true
              ? { ...a, is_primary: false }
              : a,
        ),
      }));
    },
    [setForm],
  );

  /* ---- Identifications ---- */

  const addIdentification = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      identifications: [
        ...prev.identifications,
        { id_type: '', id_number: '', issue_date: '', expiry_date: '', issuing_authority: '', issuing_country: 'Philippines' },
      ],
    }));
  }, [setForm]);

  const removeIdentification = useCallback(
    (index: number) => {
      setForm((prev) => ({
        ...prev,
        identifications: prev.identifications.filter((_: CrmIdentification, i: number) => i !== index),
      }));
    },
    [setForm],
  );

  const updateIdentification = useCallback(
    (index: number, field: keyof CrmIdentification, value: string) => {
      setForm((prev) => ({
        ...prev,
        identifications: prev.identifications.map((id: CrmIdentification, i: number) =>
          i === index ? { ...id, [field]: value } : id,
        ),
      }));
    },
    [setForm],
  );

  /* ---- Documents ---- */

  const addDocument = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      documents: [...prev.documents, { document_type: '', file_name: '' }],
    }));
  }, [setForm]);

  const removeDocument = useCallback(
    (index: number) => {
      setForm((prev) => ({
        ...prev,
        documents: prev.documents.filter((_: CrmDocumentRecord, i: number) => i !== index),
      }));
    },
    [setForm],
  );

  const updateDocument = useCallback(
    (index: number, field: keyof CrmDocumentRecord, value: string) => {
      setForm((prev) => ({
        ...prev,
        documents: prev.documents.map((d: CrmDocumentRecord, i: number) =>
          i === index ? { ...d, [field]: value } : d,
        ),
      }));
    },
    [setForm],
  );

  /* ---- Product Interest Toggle ---- */

  const toggleProductInterest = useCallback(
    (product: string) => {
      setForm((prev) => ({
        ...prev,
        product_interests: prev.product_interests.includes(product)
          ? prev.product_interests.filter((p: string) => p !== product)
          : [...prev.product_interests, product],
      }));
    },
    [setForm],
  );

  return {
    updateField,
    addFamilyMember,
    removeFamilyMember,
    updateFamilyMember,
    addAddress,
    removeAddress,
    updateAddress,
    addIdentification,
    removeIdentification,
    updateIdentification,
    addDocument,
    removeDocument,
    updateDocument,
    toggleProductInterest,
  };
}
