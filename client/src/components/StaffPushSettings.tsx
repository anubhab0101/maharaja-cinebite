import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { registerPwa } from "@/lib/pwa";
import { Button } from "@/components/ui/button";

function keyBytes(key: string) {
  return Uint8Array.from(
    atob(
      key
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(key.length / 4) * 4, "=")
    ),
    c => c.charCodeAt(0)
  );
}
async function deviceHash(endpoint: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(endpoint)
  );
  return Array.from(new Uint8Array(digest), n =>
    n.toString(16).padStart(2, "0")
  ).join("");
}
export default function StaffPushSettings() {
  const config = trpc.staffPush.config.useQuery();
  const [subscription, setSubscription] = useState<PushSubscription | null>(
    null
  );
  const [deviceId, setDeviceId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const status = trpc.staffPush.status.useQuery(
    { deviceId },
    { enabled: Boolean(deviceId), refetchOnWindowFocus: true }
  );
  const subscribe = trpc.staffPush.subscribe.useMutation();
  const disable = trpc.staffPush.disable.useMutation();
  const test = trpc.staffPush.test.useMutation();
  useEffect(() => {
    let cancelled = false;
    void registerPwa()
      .then(async r => {
        const sub = await r?.pushManager?.getSubscription();
        if (sub && !cancelled) {
          setSubscription(sub);
          setDeviceId(await deviceHash(sub.endpoint));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const supported =
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window &&
    isSecureContext;
  return (
    <div className="staff-push-settings space-y-2 border rounded-xl p-3 mt-3">
      <strong>Background order notifications</strong>
      <p>
        {!config.data?.enabled
          ? "Server push setup is pending. The install option works separately."
          : status.data?.active
            ? `Enabled on this device until ${new Date(status.data.expiresAt!).toLocaleDateString()}. Renew each week.`
            : "Enable on each staff phone to receive new-order notifications when the app is closed."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || !config.data?.enabled}
          onClick={async () => {
            if (!supported) {
              setMessage(
                "Use an updated browser. On iPhone install the staff app on the Home Screen, then open it and enable notifications."
              );
              return;
            }
            setBusy(true);
            setMessage("");
            try {
              const permission = await Notification.requestPermission();
              if (permission !== "granted")
                throw new Error(
                  "Notifications are blocked. Allow them in browser/phone settings."
                );
              const r = await registerPwa();
              if (!r)
                throw new Error(
                  "Service worker unavailable. Reload and retry."
                );
              await Promise.race([
                navigator.serviceWorker.ready,
                new Promise((_, reject) =>
                  setTimeout(
                    () =>
                      reject(
                        new Error("App is still installing. Reopen and retry.")
                      ),
                    15000
                  )
                ),
              ]);
              await r.update();
              if (r.waiting || r.installing)
                throw new Error(
                  "An app update is pending. Use Update app, or close all CineBite tabs and reopen, then enable notifications."
                );
              const sub =
                (await r.pushManager.getSubscription()) ??
                (await r.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: keyBytes(config.data!.publicKey!),
                }));
              const json = sub.toJSON();
              await subscribe.mutateAsync({
                endpoint: sub.endpoint,
                keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
              });
              const nextId = await deviceHash(sub.endpoint);
              setSubscription(sub);
              setDeviceId(nextId);
              if (deviceId === nextId) await status.refetch();
              setMessage(
                "Enabled. Send a test notification, then verify on the lock screen."
              );
            } catch (e) {
              setMessage(
                e instanceof Error
                  ? e.message
                  : "Could not enable notifications."
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? "Working…"
            : status.data?.active
              ? "Renew background alerts"
              : "Enable background alerts"}
        </Button>
        {subscription && status.data?.active && (
          <>
            <Button
              variant="outline"
              disabled={test.isPending}
              onClick={async () => {
                try {
                  await test.mutateAsync({ endpoint: subscription.endpoint });
                  setMessage(
                    "Push provider accepted the test. Confirm it actually appeared on your phone."
                  );
                } catch {
                  setMessage(
                    "Test delivery failed. Check configuration and retry."
                  );
                }
              }}
            >
              Send test notification
            </Button>
            <Button
              variant="outline"
              disabled={disable.isPending}
              onClick={async () => {
                try {
                  await disable.mutateAsync({
                    endpoint: subscription.endpoint,
                  });
                  await status.refetch();
                  setMessage(
                    "Background order alerts stopped on this device. Offer subscriptions are unchanged."
                  );
                } catch {
                  setMessage("Could not disable. Retry when connected.");
                }
              }}
            >
              Stop background alerts
            </Button>
          </>
        )}
      </div>
      <p role="status">{message}</p>
      <p className="text-xs">
        Lock-screen sound follows system volume, Focus/DND and browser settings.
        Spoken announcements work only while the staff page is open. Requires an
        online server; not guaranteed emergency paging.
      </p>
    </div>
  );
}
