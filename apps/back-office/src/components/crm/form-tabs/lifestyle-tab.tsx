import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Input } from '@ui/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/components/ui/select';
import { COMMUNICATION_PREFS } from '@/lib/crm-constants';

interface LifestyleTabProps {
  hobbies: string;
  cuisine_preferences: string;
  sports: string;
  clubs: string;
  special_dates: string;
  communication_preference: string;
  onFieldChange: (field: string, value: unknown) => void;
}

export function LifestyleTab({
  hobbies, cuisine_preferences, sports, clubs, special_dates, communication_preference, onFieldChange,
}: LifestyleTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Lifestyle & Preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Hobbies</label>
            <Input value={hobbies} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onFieldChange('hobbies', e.target.value)} placeholder="e.g. Golf, Travel, Art Collection" />
          </div>
          <div>
            <label className="text-sm font-medium">Cuisine Preferences</label>
            <Input value={cuisine_preferences} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onFieldChange('cuisine_preferences', e.target.value)} placeholder="e.g. Japanese, Italian, Filipino" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Sports</label>
            <Input value={sports} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onFieldChange('sports', e.target.value)} placeholder="e.g. Tennis, Swimming" />
          </div>
          <div>
            <label className="text-sm font-medium">Clubs / Memberships</label>
            <Input value={clubs} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onFieldChange('clubs', e.target.value)} placeholder="e.g. Manila Golf Club, Rotary" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Special Dates</label>
            <Input value={special_dates} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onFieldChange('special_dates', e.target.value)} placeholder="e.g. Wedding Anniversary: June 15" />
          </div>
          <div>
            <label className="text-sm font-medium">Communication Preference</label>
            <Select value={communication_preference} onValueChange={(v: string) => onFieldChange('communication_preference', v)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {COMMUNICATION_PREFS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
