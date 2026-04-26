import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Button } from '@ui/components/ui/button';
import { Badge } from '@ui/components/ui/badge';
import { Input } from '@ui/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/components/ui/select';
import { Plus, Trash2, Upload } from 'lucide-react';
import type { CrmDocumentRecord } from '@/lib/crm-constants';

interface DocumentsTabProps {
  documents: CrmDocumentRecord[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, field: keyof CrmDocumentRecord, value: string) => void;
}

export function DocumentsTab({ documents, onAdd, onRemove, onUpdate }: DocumentsTabProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Documents</CardTitle>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="mr-1 h-3 w-3" /> Add Document
        </Button>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <Upload className="h-10 w-10 text-muted-foreground/50" />
            <p>No documents attached</p>
            <p className="text-sm">Click "Add Document" to attach files</p>
          </div>
        ) : (
          <div className="space-y-4">
            {documents.map((doc, idx) => (
              <div key={idx} className="rounded-md border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">Document {idx + 1}</Badge>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" aria-label="Remove item" onClick={() => onRemove(idx)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium">Document Type</label>
                    <Select value={doc.document_type} onValueChange={(v: string) => onUpdate(idx, 'document_type', v)}>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ID_COPY">ID Copy</SelectItem>
                        <SelectItem value="PROOF_OF_ADDRESS">Proof of Address</SelectItem>
                        <SelectItem value="INCOME_PROOF">Income Proof</SelectItem>
                        <SelectItem value="TAX_RETURN">Tax Return</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">File Name</label>
                    <div className="flex items-center gap-2">
                      <Input value={doc.file_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(idx, 'file_name', e.target.value)} placeholder="filename.pdf" />
                      <Button size="sm" variant="outline" disabled aria-label="Upload file"><Upload className="h-3 w-3" /></Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">File upload will be available in a future release</p>
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
