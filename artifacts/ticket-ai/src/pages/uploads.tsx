import { AppLayout } from "@/components/layout";
import { UploadModal } from "@/components/upload-modal";
import { Button } from "@/components/ui/button";
import { useListUploads, useDeleteUpload, useAnalyzeUpload, getListUploadsQueryKey } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Download, Play, Trash2, FileText, BrainCircuit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

export default function Uploads() {
  const { data: uploads, isLoading } = useListUploads();
  const [modalOpen, setModalOpen] = useState(false);
  const deleteUpload = useDeleteUpload();
  const analyzeUpload = useAnalyzeUpload();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this upload and all its tickets?")) return;
    try {
      await deleteUpload.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListUploadsQueryKey() });
      toast({ title: "Deleted", description: "Upload removed." });
    } catch (err) {
      toast({ title: "Error", description: "Could not delete upload.", variant: "destructive" });
    }
  };

  const handleAnalyze = async (id: number) => {
    try {
      await analyzeUpload.mutateAsync({ uploadId: id });
      queryClient.invalidateQueries({ queryKey: getListUploadsQueryKey() });
      toast({ title: "Analysis complete", description: "AI has processed the tickets." });
    } catch (err) {
      toast({ title: "Error", description: "Analysis failed.", variant: "destructive" });
    }
  };

  return (
    <AppLayout>
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Uploads</h1>
          <Button onClick={() => setModalOpen(true)} className="gap-2">
            <Download className="w-4 h-4 rotate-180" />
            New Upload
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filename</TableHead>
                  <TableHead>Week</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : uploads?.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No uploads found.</TableCell></TableRow>
                ) : (
                  uploads?.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium text-foreground">{u.filename}</TableCell>
                      <TableCell>{u.week_label || "-"}</TableCell>
                      <TableCell>{u.row_count}</TableCell>
                      <TableCell>{format(new Date(u.uploaded_at), "MMM d, yyyy HH:mm")}</TableCell>
                      <TableCell>
                        {u.ai_summary ? (
                          <Badge className="bg-primary/20 text-primary hover:bg-primary/30">Analyzed</Badge>
                        ) : (
                          <Badge variant="secondary">Raw</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="icon" variant="ghost" title="Auto Analyze" onClick={() => handleAnalyze(u.id)} disabled={analyzeUpload.isPending}>
                            <BrainCircuit className="w-4 h-4 text-muted-foreground hover:text-primary" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Delete" onClick={() => handleDelete(u.id)} disabled={deleteUpload.isPending}>
                            <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <UploadModal 
        open={modalOpen} 
        onOpenChange={setModalOpen} 
        onSuccess={() => queryClient.invalidateQueries({ queryKey: getListUploadsQueryKey() })} 
      />
    </AppLayout>
  );
}