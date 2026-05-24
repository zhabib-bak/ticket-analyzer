import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Upload, MessageSquare, AlertTriangle, FileText, Ticket as TicketIcon } from "lucide-react";

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/uploads", label: "Uploads", icon: Upload },
    { href: "/ai", label: "AI Chat", icon: MessageSquare },
    { href: "/anomalies", label: "Anomalies", icon: AlertTriangle },
    { href: "/report", label: "Reports", icon: FileText },
    { href: "/tickets", label: "Tickets", icon: TicketIcon },
  ];

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden dark">
      {/* Sidebar */}
      <aside className="w-64 flex flex-col border-r border-border bg-card">
        <div className="p-4 flex flex-col justify-center border-b border-border h-16">
          <div className="flex items-center gap-2 text-primary font-bold text-lg tracking-tight">
            <TicketIcon className="w-5 h-5 text-primary" />
            <span>TICKET<span className="text-foreground">AI</span></span>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer ${
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
