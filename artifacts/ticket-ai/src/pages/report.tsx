import { AppLayout } from "@/components/layout";
import { useGetReport, useListUploads } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";

export default function Report() {
  const { data: uploads } = useListUploads();
  const [selectedUpload, setSelectedUpload] = useState<string>("");
  
  const uploadId = selectedUpload ? parseInt(selectedUpload) : undefined;
  const { data: report, isLoading } = useGetReport(uploadId as number, { query: { enabled: !!uploadId } });

  const handleDownload = () => {
    if (!report) return;
    const blob = new Blob([report.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${uploadId}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="p-8 space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Executive Reports
          </h1>
          
          <div className="flex gap-4">
            <Select value={selectedUpload} onValueChange={setSelectedUpload}>
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="Select an upload to report on" />
              </SelectTrigger>
              <SelectContent>
                {uploads?.map(u => (
                  <SelectItem key={u.id} value={u.id.toString()}>
                    {u.filename} ({u.week_label || "No week"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleDownload} disabled={!report} variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              Export .md
            </Button>
          </div>
        </div>

        {!selectedUpload ? (
          <div className="text-center py-24 border border-dashed border-border rounded-xl">
            <p className="text-muted-foreground">Select an upload to generate a report.</p>
          </div>
        ) : isLoading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-8 w-1/3 bg-muted rounded"></div>
            <div className="h-4 w-full bg-muted rounded"></div>
            <div className="h-4 w-full bg-muted rounded"></div>
            <div className="h-4 w-2/3 bg-muted rounded"></div>
          </div>
        ) : report ? (
          <Card className="bg-card">
            <CardContent className="p-8 prose prose-invert prose-amber max-w-none">
              <div dangerouslySetInnerHTML={{ __html: report.markdown.replace(/\n/g, "<br/>") }} />
              <div className="mt-8 text-xs text-muted-foreground border-t border-border pt-4">
                Generated at: {new Date(report.generated_at).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="text-center py-24 border border-dashed border-border rounded-xl">
            <p className="text-muted-foreground">Could not generate report.</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}