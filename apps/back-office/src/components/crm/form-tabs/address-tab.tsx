import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Button } from '@ui/components/ui/button';
import { Badge } from '@ui/components/ui/badge';
import { Input } from '@ui/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/components/ui/select';
import { Plus, Trash2, MapPin } from 'lucide-react';
import { ADDRESS_TYPES, COUNTRIES, type CrmAddress } from '@/lib/crm-constants';

interface AddressTabProps {
  addresses: CrmAddress[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, field: keyof CrmAddress, value: string | boolean) => void;
}

export function AddressTab({ addresses, onAdd, onRemove, onUpdate }: AddressTabProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Addresses</CardTitle>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="mr-1 h-3 w-3" /> Add Address
        </Button>
      </CardHeader>
      <CardContent>
        {addresses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <MapPin className="h-10 w-10 text-muted-foreground/50" />
            <p>No addresses added</p>
            <p className="text-sm">Click "Add Address" to include address information</p>
          </div>
        ) : (
          <div className="space-y-4">
            {addresses.map((addr, idx) => (
              <div key={idx} className="rounded-md border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{addr.address_type || 'Address'} {idx + 1}</Badge>
                    {addr.is_primary && (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" variant="secondary">Primary</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-sm cursor-pointer">
                      <input type="checkbox" checked={addr.is_primary} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(idx, 'is_primary', e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                      Primary
                    </label>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" aria-label="Remove item" onClick={() => onRemove(idx)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <label className="text-sm font-medium">Address Type</label>
                    <Select value={addr.address_type} onValueChange={(v: string) => onUpdate(idx, 'address_type', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ADDRESS_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium">Address Line 1</label>
                    <Input value={addr.address_line_1} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(idx, 'address_line_1', e.target.value)} placeholder="Street address" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Address Line 2</label>
                  <Input value={addr.address_line_2} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(idx, 'address_line_2', e.target.value)} placeholder="Barangay, building, floor" />
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div>
                    <label className="text-sm font-medium">City</label>
                    <Input value={addr.city} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(idx, 'city', e.target.value)} placeholder="Makati" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">State / Province</label>
                    <Input value={addr.state} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(idx, 'state', e.target.value)} placeholder="Metro Manila" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Postal Code</label>
                    <Input value={addr.postal_code} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(idx, 'postal_code', e.target.value)} placeholder="1200" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Country</label>
                    <Select value={addr.country} onValueChange={(v: string) => onUpdate(idx, 'country', v)}>
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
