import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Button } from '@ui/components/ui/button';
import { Badge } from '@ui/components/ui/badge';
import { Input } from '@ui/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/components/ui/select';
import { Plus, Trash2, CreditCard } from 'lucide-react';
import { ID_TYPES, COUNTRIES, type CrmIdentification } from '@/lib/crm-constants';

interface IdentificationTabProps {
  identifications: CrmIdentification[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, field: keyof CrmIdentification, value: string) => void;
}

export function IdentificationTab({ identifications, onAdd, onRemove, onUpdate }: IdentificationTabProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Identification Documents</CardTitle>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="mr-1 h-3 w-3" /> Add ID
        </Button>
      </CardHeader>
      <CardContent>
        {identifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <CreditCard className="h-10 w-10 text-muted-foreground/50" />
            <p>No identification documents added</p>
            <p className="text-sm">Click "Add ID" to include identification details</p>
          </div>
        ) : (
          <div className="space-y-4">
            {identifications.map((idDoc, idx) => (
              <div key={idx} className="rounded-md border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">ID {idx + 1}</Badge>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" aria-label="Remove item" onClick={() => onRemove(idx)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <label className="text-sm font-medium">ID Type</label>
                    <Select value={idDoc.id_type} onValueChange={(v: string) => onUpdate(idx, 'id_type', v)}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {ID_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">ID Number</label>
                    <Input value={idDoc.id_number} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(idx, 'id_number', e.target.value)} placeholder="Document number" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Issuing Authority</label>
                    <Input value={idDoc.issuing_authority} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(idx, 'issuing_authority', e.target.value)} placeholder="e.g. DFA, LTO" />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <label className="text-sm font-medium">Issue Date</label>
                    <Input type="date" value={idDoc.issue_date} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(idx, 'issue_date', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Expiry Date</label>
                    <Input type="date" value={idDoc.expiry_date} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(idx, 'expiry_date', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Issuing Country</label>
                    <Select value={idDoc.issuing_country} onValueChange={(v: string) => onUpdate(idx, 'issuing_country', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
