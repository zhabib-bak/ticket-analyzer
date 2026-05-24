import { AppLayout } from "@/components/layout";
import { useListTickets, useListUploads } from "@workspace/api-client-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { format } from "date-fns";

export default function Tickets() {
  const [selectedUpload, setSelectedUpload] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  
  const { data: uploads } = useListUploads();
  
  const params: any = {};
  if (selectedUpload !== "all") params.upload_id = parseInt(selectedUpload);
  if (statusFilter !== "all") params.status = statusFilter;
  if (priorityFilter !== "all") params.priority = priorityFilter;
  params.limit = 100; // Limit for performance

  const { data: tickets, isLoading } = useListTickets(params);

  const getPriorityColor = (p: string | null | undefined) => {
    if (!p) return "secondary";
    const lower = p.toLowerCase();
    if (lower.includes("1") || lower.includes("high")) return "destructive";
    if (lower.includes("2") || lower.includes("medium")) return "outline";
    return "secondary";
  };

  const getStatusColor = (s: string | null | undefined) => {
    if (!s) return "secondary";
    const lower = s.toLowerCase();
    if (lower.includes("close") || lower.includes("resolve")) return "success";
    if (lower.includes("block") || lower.includes("fail")) return "destructive";
    if (lower.includes("progress")) return "warning";
    return "default"; // open
  };

  return (
    <AppLayout>
      <div className="p-8 space-y-6 flex flex-col h-full overflow-hidden">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between shrink-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Tickets Log</h1>
          
          <div className="flex flex-wrap gap-3">
            <Select value={selectedUpload} onValueChange={setSelectedUpload}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Uploads" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Uploads</SelectItem>
                {uploads?.map(u => (
                  <SelectItem key={u.id} value={u.id.toString()}>{u.filename}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Any Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Status</SelectItem>
                <SelectItem value="Open">Open</SelectItem>
                <SelectItem value="In Progress">In Progress</SelectItem>
                <SelectItem value="Closed">Closed</SelectItem>
                <SelectItem value="Blocked">Blocked</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Any Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Priority</SelectItem>
                <SelectItem value="P1">P1 / High</SelectItem>
                <SelectItem value="P2">P2 / Medium</SelectItem>
                <SelectItem value="P3">P3 / Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="flex-1 overflow-hidden flex flex-col min-h-0 border-border">
          <div className="overflow-auto flex-1 relative">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10 border-b border-border">
                <TableRow>
                  <TableHead>Ticket ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assignee</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : tickets?.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">No tickets match criteria.</TableCell></TableRow>
                ) : (
                  tickets?.map(t => (
                    <TableRow key={t.id} className="hover:bg-muted/50 cursor-pointer">
                      <TableCell className="font-mono text-xs">{t.ticket_id || `INT-${t.id}`}</TableCell>
                      <TableCell className="text-sm">{t.ticket_date ? format(new Date(t.ticket_date), "MMM d, yyyy") : "-"}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">{t.category || "Uncategorized"}</span>
                          {t.ai_category && <span className="text-[10px] text-primary">AI: {t.ai_category}</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getPriorityColor(t.priority)} className={t.priority?.includes("2") ? "border-amber-500/50 text-amber-500" : ""}>
                          {t.priority || "Unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          getStatusColor(t.status) === 'success' ? 'border-emerald-500/50 text-emerald-500' :
                          getStatusColor(t.status) === 'destructive' ? 'border-red-500/50 text-red-500' :
                          getStatusColor(t.status) === 'warning' ? 'border-amber-500/50 text-amber-500' :
                          'border-blue-500/50 text-blue-500'
                        }>
                          {t.status || "Unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{t.assignee || "Unassigned"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="p-4 border-t border-border bg-muted/20 text-xs text-muted-foreground text-right shrink-0">
            Showing up to 100 rows.
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}