import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { registerPwa } from "@/lib/pwa";
type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const InstallContext = createContext<{
  prompt: InstallEvent | null; clearPrompt(): void; installed: boolean;
  waiting: ServiceWorker | null; problem: string;
} | null>(null);

export function StaffInstallProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    // This component is mounted only inside the authenticated staff gate.
    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "/api/staff-manifest";
    manifest.crossOrigin = "use-credentials";
    let cancelled = false;
    let registration: ServiceWorkerRegistration | null = null;
    const checkUpdate = () => {
      if (!cancelled) setWaiting(registration?.waiting ?? null);
    };
    void registerPwa()
      .then(async reg => {
        registration = reg;
        if (!reg) {
          if (!cancelled)
            setProblem(
              "App installation needs HTTPS and service worker support."
            );
          return;
        }
        reg.addEventListener("updatefound", () =>
          reg.installing?.addEventListener("statechange", checkUpdate)
        );
        await reg.update();
        checkUpdate();
      })
      .catch(() => {
        if (!cancelled)
          setProblem(
            "Could not check the app update. Check connection and retry."
          );
      });
    const available = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", done);
    document.head.appendChild(manifest);
    void fetch("/api/staff-manifest", {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(r => {
        if (!r.ok && !cancelled)
          setProblem(
            "Staff install access could not be verified. Sign in again, then reload."
          );
      })
      .catch(() => {
        if (!cancelled)
          setProblem("Unable to load install information. Check connection.");
      });
    return () => {
      manifest.remove();
      cancelled = true;
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  return <InstallContext.Provider value={{ prompt, clearPrompt: () => setPrompt(null), installed, waiting, problem }}>{children}</InstallContext.Provider>;
}

export default function PwaInstall() {
  const install = useContext(InstallContext);
  const [help, setHelp] = useState(false);
  if (!install) return null;
  const { prompt, clearPrompt, installed, waiting, problem } = install;
  return (
    <div className="pwa-install print:hidden">
      <Button
        variant="outline"
        onClick={async () => {
          if (!prompt || installed) {
            setHelp(!help);
            return;
          }
          try {
            await prompt.prompt();
            await prompt.userChoice;
          } catch {
            setHelp(true);
          } finally {
            clearPrompt();
          }
        }}
      >
        {installed ? "CineBite installed — help" : "Install CineBite app"}
      </Button>
      {waiting && (
        <Button
          variant="outline"
          onClick={() => {
            navigator.serviceWorker.addEventListener(
              "controllerchange",
              () => window.location.reload(),
              { once: true }
            );
            waiting.postMessage({ type: "ACTIVATE_UPDATE" });
          }}
        >
          Update app
        </Button>
      )}
      {problem && <p role="status">{problem}</p>}
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
        <DialogHeader><DialogTitle>Add CineBite to Home Screen</DialogTitle>
        <DialogDescription>
          On iPhone: Safari → Share → Add to Home Screen. On Android: browser
          menu → Install app / Add to Home screen. Installation needs HTTPS and
          browser support. If that option is missing, open this staff page directly
          in an updated Chrome browser (not an in-app or private browser), sign in,
          and try again. This website cannot force a browser to offer installation.
        </DialogDescription></DialogHeader>
        <p>{installed ? "This app is already installed." : "Your browser has not made its native install popup available yet."}</p>
        {prompt && !installed && <Button onClick={async () => {
          try { await prompt.prompt(); await prompt.userChoice; setHelp(false); }
          catch { setHelp(true); }
          finally { clearPrompt(); }
        }}>Install now</Button>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
