import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface UploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const REQUIRED_FIELDS = [
  "ticket_id", "ticket_date", "category", "priority", 
  "status", "assignee", "description", "resolution"
];

export function UploadModal({ open, onOpenChange, onSuccess }: UploadModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [file, setFile] = useState<File | null>(null);
  const [weekLabel, setWeekLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  
  // Step 2 state
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const submitStep1 = async () => {
    if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (weekLabel) formData.append("week_label", weekLabel);
      if (notes) formData.append("notes", notes);

      const res = await fetch("/api/tickets/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      
      if (data.step === "map_headers") {
        setHeaders(data.headers);
        
        // Auto-detect mapping
        const autoMap: Record<string, string> = {};
        REQUIRED_FIELDS.forEach(req => {
          const matched = data.headers.find((h: string) => 
            h.toLowerCase().replace(/[^a-z]/g, "") === req.toLowerCase().replace(/[^a-z]/g, "")
          );
          if (matched) autoMap[req] = matched;
        });
        setMapping(autoMap);
        setStep(2);
      } else if (data.ok) {
        toast({ title: "Success", description: "File uploaded and processed." });
        onSuccess();
        onOpenChange(false);
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to upload file.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const submitStep2 = async () => {
    if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (weekLabel) formData.append("week_label", weekLabel);
      if (notes) formData.append("notes", notes);
      formData.append("mapping", JSON.stringify(mapping));

      const res = await fetch("/api/tickets/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      
      if (data.ok) {
        toast({ title: "Success", description: "File mapped and processed." });
        onSuccess();
        onOpenChange(false);
        setStep(1);
        setFile(null);
      } else {
        throw new Error("Upload failed");
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to map fields.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle>{step === 1 ? "Upload Ticket CSV" : "Map CSV Columns"}</DialogTitle>
          <DialogDescription>
            {step === 1 ? "Upload a fresh export from your ticketing system." : "Map your CSV headers to our standardized fields."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>CSV File</Label>
              <Input type="file" accept=".csv" onChange={handleFileChange} className="cursor-pointer" />
            </div>
            <div className="space-y-2">
              <Label>Week Label (Optional)</Label>
              <Input placeholder="e.g. W42-2023" value={weekLabel} onChange={e => setWeekLabel(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Input placeholder="Any context about this export" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            <div className="flex justify-end pt-4">
              <Button disabled={!file || isUploading} onClick={submitStep1}>
                {isUploading ? "Uploading..." : "Next: Map Columns"}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-2">
              {REQUIRED_FIELDS.map(req => (
                <div key={req} className="space-y-1">
                  <Label className="text-xs uppercase text-muted-foreground">{req.replace("_", " ")}</Label>
                  <Select 
                    value={mapping[req] || ""} 
                    onValueChange={(val) => setMapping(prev => ({...prev, [req]: val}))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      {headers.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(1)} disabled={isUploading}>Back</Button>
              <Button disabled={isUploading || Object.keys(mapping).length === 0} onClick={submitStep2}>
                {isUploading ? "Processing..." : "Complete Upload"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}