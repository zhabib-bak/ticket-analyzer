import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Uploads from "@/pages/uploads";
import AiChat from "@/pages/ai-chat";
import Anomalies from "@/pages/anomalies";
import Report from "@/pages/report";
import Tickets from "@/pages/tickets";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/uploads" component={Uploads} />
      <Route path="/ai" component={AiChat} />
      <Route path="/anomalies" component={Anomalies} />
      <Route path="/report" component={Report} />
      <Route path="/tickets" component={Tickets} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;