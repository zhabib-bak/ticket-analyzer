import { AppLayout } from "@/components/layout";
import { useDetectAnomalies } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Info, AlertCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Anomalies() {
  const { data, isLoading, refetch } = useDetectAnomalies();

  return (
    <AppLayout>
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-primary" />
              Anomaly Detection
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">AI-driven insights into unusual ticketing patterns.</p>
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
            {isLoading ? "Scanning..." : "Re-scan Data"}
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-40 bg-muted animate-pulse rounded-xl"></div>)}
          </div>
        ) : !data || data.anomalies.length === 0 ? (
          <div className="text-center py-24 border border-dashed border-border rounded-xl">
            <div className="mx-auto w-12 h-12 bg-secondary rounded-full flex items-center justify-center mb-4">
              <ShieldAlert className="w-6 h-6 text-emerald-500" />
            </div>
            <h3 className="text-lg font-medium text-foreground">No anomalies detected</h3>
            <p className="text-muted-foreground text-sm mt-1">Your ticketing operations look perfectly normal.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <Card className="bg-card md:col-span-1 border-primary/20">
                <CardHeader>
                  <CardTitle className="text-sm text-muted-foreground">Overall Risk Score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-5xl font-black text-primary tracking-tighter">
                    {data.risk_score || 0}<span className="text-xl text-muted-foreground font-normal">/100</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{data.summary}</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.anomalies.map((anomaly, i) => (
                <Card key={i} className="border-border hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <Badge variant={anomaly.severity === 'high' ? 'destructive' : anomaly.severity === 'medium' ? 'outline' : 'secondary'} 
                             className={anomaly.severity === 'medium' ? 'border-amber-500 text-amber-500' : ''}>
                        {anomaly.severity.toUpperCase()}
                      </Badge>
                      {anomaly.severity === 'high' ? <AlertTriangle className="w-4 h-4 text-destructive" /> : <Info className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <CardTitle className="text-lg mt-2">{anomaly.type}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{anomaly.description}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {anomaly.affected_tickets && (
                        <Badge variant="secondary" className="bg-secondary/50">{anomaly.affected_tickets} tickets affected</Badge>
                      )}
                      {anomaly.affected_category && (
                        <Badge variant="secondary" className="bg-secondary/50">Category: {anomaly.affected_category}</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}