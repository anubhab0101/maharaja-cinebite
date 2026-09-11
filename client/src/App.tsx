import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Admin from "@/pages/Admin";
import History from "@/pages/History";
import Kitchen from "@/pages/Kitchen";
import Showtimes from "@/pages/Showtimes";
import Login from "@/pages/Login";
import SeatQrGenerator from "@/pages/SeatQrGenerator";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/track" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/kitchen" component={Kitchen} />
      <Route path="/history" component={History} />
      <Route path="/admin" component={Admin} />
      <Route path="/qr-generator" component={SeatQrGenerator} />
      <Route path="/showtimes" component={Showtimes} />
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
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
