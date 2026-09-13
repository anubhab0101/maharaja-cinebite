import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense } from "react";
const Admin = lazy(() => import("@/pages/Admin"));
const History = lazy(() => import("@/pages/History"));
const Kitchen = lazy(() => import("@/pages/Kitchen"));
const Showtimes = lazy(() => import("@/pages/Showtimes"));
const Login = lazy(() => import("@/pages/Login"));
const ServiceInfo = lazy(() => import("@/pages/ServiceInfo"));
const SeatQrGenerator = lazy(() => import("@/pages/SeatQrGenerator"));
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
const Home = lazy(() => import("./pages/Home"));

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/track" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/rasoi" component={Kitchen} />
      <Route path="/history" component={History} />
      <Route path="/maharaja" component={Admin} />
      <Route path="/qr-generator" component={SeatQrGenerator} />
      <Route path="/showtimes" component={Showtimes} />
      {["/privacy", "/retention", "/terms", "/refunds", "/delivery", "/cookies", "/support", "/payment-failed"].map(path => <Route key={path} path={path} component={ServiceInfo} />)}
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <div className="route-shell"><Suspense fallback={<div className="route-loading" role="status">Loading page…</div>}><Router /></Suspense></div>
          <footer className="policy-footer bg-[#101010] px-5 py-6 text-sm text-white/80">
            <nav aria-label="Policies and support" className="flex flex-wrap justify-center gap-4">
              {[["Privacy", "/privacy"], ["Terms", "/terms"], ["Refunds & cancellation", "/refunds"], ["Delivery", "/delivery"], ["Browser storage", "/cookies"], ["Support", "/support"]].map(([label, href]) => <a className="underline" key={href} href={href}>{label}</a>)}
            </nav>
          </footer>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
