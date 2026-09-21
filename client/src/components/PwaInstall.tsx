import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { registerPwa } from "@/lib/pwa";
type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export default function PwaInstall() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
  const [help, setHelp] = useState(false);
  useEffect(() => {
    // This component is mounted only inside the authenticated staff gate.
    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "/api/staff-manifest";
    manifest.crossOrigin = "use-credentials";
    document.head.appendChild(manifest);
    void registerPwa();
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
    return () => {
      manifest.remove();
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  if (installed) return null;
  return (
    <div className="pwa-install print:hidden">
      <Button
        variant="outline"
        onClick={async () => {
          if (!prompt) {
            setHelp(!help);
            return;
          }
          try {
            await prompt.prompt();
            await prompt.userChoice;
          } catch {
            setHelp(true);
          } finally {
            setPrompt(null);
          }
        }}
      >
        Install CineBite app
      </Button>
      {help && (
        <p>
          On iPhone: Safari → Share → Add to Home Screen. On Android: browser
          menu → Install app / Add to Home screen. Installation needs HTTPS and
          browser support.
        </p>
      )}
    </div>
  );
}
