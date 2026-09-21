import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { registerPwa } from "@/lib/pwa";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const storageKey = "cinebite-offer-preference-v1";
type Preference = { token: string; endpoint: string; expiresAt: string };
function saved(): Preference | null {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "null");
  } catch {
    return null;
  }
}
export default function OfferNotifications() {
  const config = trpc.offers.config.useQuery(undefined, { staleTime: 60000 });
  const subscribe = trpc.offers.subscribe.useMutation();
  const unsubscribe = trpc.offers.unsubscribe.useMutation();
  const [preference, setPreference] = useState<Preference | null>(saved);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState(
    "Notification" in window ? Notification.permission : "unsupported"
  );
  const appleMobile =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  // Respect the no-customer-install requirement: do not suggest installing on iOS.
  const supported =
    !appleMobile &&
    isSecureContext &&
    "PushManager" in window &&
    "Notification" in window &&
    "serviceWorker" in navigator;
  useEffect(() => {
    const refresh = () =>
      setPermission(
        "Notification" in window ? Notification.permission : "unsupported"
      );
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  async function enable() {
    if (!consent || !config.data?.publicKey) return;
    setBusy(true);
    let browserSubscription: PushSubscription | null = null;
    let ownedByThisAttempt = false;
    let serverSaved = false;
    try {
      const access = await Notification.requestPermission();
      setPermission(access);
      if (access !== "granted")
        throw new Error(
          "Permission was not granted. Ordering still works without offers."
        );
      const reg = await registerPwa();
      if (!reg)
        throw new Error("Notifications are unavailable in this browser.");
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Notification setup timed out. Retry.")),
            15000
          )
        ),
      ]);
      await reg.update();
      if (reg.waiting || reg.installing)
        throw new Error(
          "App update is pending. Close other CineBite tabs and reopen before enabling offers."
        );
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const token =
        preference?.token ??
        Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
      browserSubscription = await reg.pushManager.getSubscription();
      if (browserSubscription && !preference) {
        await browserSubscription.unsubscribe();
        browserSubscription = null;
      }
      if (!browserSubscription) {
        browserSubscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: config.data.publicKey,
        });
        ownedByThisAttempt = true;
      }
      const json = browserSubscription.toJSON();
      const record = {
        token,
        endpoint: browserSubscription.endpoint,
        expiresAt: "",
      };
      // Ensure withdrawal capability survives a lost response before saving on server.
      localStorage.setItem(storageKey, JSON.stringify(record));
      setPreference(record);
      const result = await subscribe.mutateAsync({
        endpoint: record.endpoint,
        keys: { auth: json.keys!.auth, p256dh: json.keys!.p256dh },
        manageToken: token,
        consent: true,
        consentVersion: config.data.consentVersion as "offers-2026-09-21-v1",
      });
      serverSaved = true;
      const complete = { ...record, expiresAt: result.expiresAt };
      localStorage.setItem(storageKey, JSON.stringify(complete));
      setPreference(complete);
      setConsent(false);
      toast.success("Optional offer notifications enabled");
    } catch (error) {
      if (ownedByThisAttempt && !serverSaved)
        await browserSubscription?.unsubscribe().catch(() => false);
      toast.error(
        error instanceof Error ? error.message : "Could not enable offers."
      );
    } finally {
      setBusy(false);
    }
  }
  async function disable() {
    if (!preference) return;
    setBusy(true);
    try {
      await unsubscribe.mutateAsync({
        endpoint: preference.endpoint,
        manageToken: preference.token,
      });
      const reg =
        "serviceWorker" in navigator
          ? await navigator.serviceWorker.getRegistration("/")
          : undefined;
      await (await reg?.pushManager.getSubscription())?.unsubscribe();
      localStorage.removeItem(storageKey);
      setPreference(null);
      toast.success("Offer notifications disabled");
    } catch {
      toast.error(
        "Could not finish removing the subscription. Retry when connected, or block notifications in browser settings."
      );
    } finally {
      setBusy(false);
    }
  }
  const active = Boolean(
    preference?.expiresAt &&
    new Date(preference.expiresAt).getTime() > Date.now()
  );
  return (
    <section
      id="offers"
      className="mx-auto my-6 max-w-3xl rounded-xl border border-orange-500/30 p-4 space-y-3 text-sm"
      aria-label="Optional cinema offers"
    >
      <h2 className="font-semibold text-base">Cinema discounts & offers</h2>
      <p>
        Optional promotional notifications on this browser. Not required to
        order. We store a push subscription and consent time, not your order
        details for targeting. Offer delivery stops after 90 days unless
        renewed. You can stop offers below or in browser settings.
      </p>
      {!supported ? (
        <p>
          This browser does not support offers without app installation.
          Customer installation is not offered; you can still view discounts in
          the menu.
        </p>
      ) : (
        <>
          {!config.data?.enabled && (
            <p>Offer notifications are not enabled by the cinema yet.</p>
          )}
          {permission === "denied" && (
            <p>
              Notifications are blocked in browser settings. Ordering is
              unaffected.
            </p>
          )}
          {active && (
            <p>
              Offer subscription saved until{" "}
              {new Date(preference!.expiresAt).toLocaleDateString()}. Browser
              permission: {permission}.
            </p>
          )}
          {!active && config.data?.enabled && (
            <>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={e => setConsent(e.target.checked)}
                  className="mt-1 h-5 w-5"
                />
                I want optional cinema discount and offer notifications.
              </label>
              <Button
                variant="outline"
                disabled={!consent || busy || permission === "denied"}
                onClick={() => void enable()}
              >
                Allow offer notifications
              </Button>
            </>
          )}
        </>
      )}
      {preference && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void disable()}
        >
          Stop offer notifications
        </Button>
      )}
      <p>
        <a href="/privacy" className="underline">
          Privacy information
        </a>{" "}
        · Currently supports Chrome/Firefox push providers. No customer app
        installation is required. iPhone/iPad customers can view offers in the
        menu instead.
      </p>
    </section>
  );
}
