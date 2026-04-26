import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Button } from '@ui/components/ui/button';
import { Badge } from '@ui/components/ui/badge';
import { Input } from '@ui/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/components/ui/select';
import { Plus, Trash2, Users } from 'lucide-react';
import { RELATIONSHIPS, type CrmFamilyMember } from '@/lib/crm-constants';

interface FamilyTabProps {
  familyMembers: CrmFamilyMember[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, field: keyof CrmFamilyMember, value: string) => void;
}

export function FamilyTab({ familyMembers, onAdd, onRemove, onUpdate }: FamilyTabProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Family Members</CardTitle>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="mr-1 h-3 w-3" /> Add Member
        </Button>
      </CardHeader>
      <CardContent>
        {familyMembers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <Users className="h-10 w-10 text-muted-foreground/50" />
            <p>No family members added</p>
            <p className="text-sm">Click "Add Member" to include family information</p>
          </div>
        ) : (
          <div className="space-y-4">
            {familyMembers.map((member, idx) => (
              <div key={idx} className="rounded-md border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">Member {idx + 1}</Badge>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" aria-label="Remove item" onClick={() => onRemove(idx)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <label className="text-sm font-medium">Relationship</label>
                    <Select value={member.relationship} onValueChange={(v: string) => onUpdate(idx, 'relationship', v)}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {RELATIONSHIPS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">First Name</label>
                    <Input value={member.first_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(idx, 'first_name', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Last Name</label>
                    <Input value={member.last_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(idx, 'last_name', e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <label className="text-sm font-medium">Date of Birth</label>
                    <Input type="date" value={member.dob} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(idx, 'dob', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Occupation</label>
                    <Input value={member.occupation} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(idx, 'occupation', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Contact Number</label>
                    <Input value={member.contact_number} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(idx, 'contact_number', e.target.value)} />
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
