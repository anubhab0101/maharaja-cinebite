import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { hasStaffRole } from "@shared/cinebites";
import { playKitchenChime, unlockKitchenAudio } from "@/lib/kitchenAudio";
import { newConfirmedOrders, speakNewOrder } from "@/lib/order-alerts";
import { registerPwa } from "@/lib/pwa";
import { Button } from "@/components/ui/button";
import StaffPushSettings from "./StaffPushSettings";

export default function StaffAlerts() {
  const { user } = useAuth();
  const allowed = Boolean(
    user &&
    hasStaffRole(user.role, [
      "OWNER_ADMIN",
      "ADMIN",
      "MANAGER",
      "KITCHEN",
      "CASHIER",
    ])
  );
  const [enabled, setEnabled] = useState(false);
  const [connected, setConnected] = useState(false);
  const [permission, setPermission] = useState(
    "Notification" in window ? Notification.permission : "unsupported"
  );
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const seen = useRef(new Set<string>());
  const initialized = useRef(false);
  const queue = trpc.kitchen.queue.useQuery(undefined, {
    enabled: allowed,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
  const utils = trpc.useUtils();
  useEffect(() => {
    initialized.current = false;
    seen.current.clear();
    setEnabled(false);
    setNotice("");
  }, [user?.id]);
  useEffect(() => {
    if (!allowed) return;
    const stream = new EventSource("/api/events");
    const refresh = () => {
      void utils.kitchen.queue.invalidate();
      void utils.admin.orders.invalidate();
      void utils.admin.stats.invalidate();
    };
    stream.addEventListener("ready", () => {
      setConnected(true);
      refresh();
    });
    stream.addEventListener("order.created", refresh);
    stream.addEventListener("order.statusChanged", refresh);
    stream.onerror = () => setConnected(false);
    return () => {
      stream.close();
      setConnected(false);
    };
  }, [allowed, user?.id, utils]);
  useEffect(() => {
    if (!allowed || !queue.data) return;
    const arrived = newConfirmedOrders(queue.data, seen.current);
    // Seed the baseline, don't announce historic orders as brand new on login.
    if (initialized.current && enabled && arrived.length) {
      playKitchenChime();
      speakNewOrder();
      const text = `${arrived.length} new order${arrived.length === 1 ? "" : "s"} received. Check the queue.`;
      setNotice(text);
      toast.info(text);
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      if ("Notification" in window && Notification.permission === "granted") {
        void registerPwa()
          .then(async reg => {
            if (!reg?.active) return;
            for (const order of arrived) {
              const orderNumber = queue.data?.find(candidate => candidate.id === order.id)?.orderNumber;
              if (!orderNumber) continue;
              const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(orderNumber));
              const id = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
              await reg.showNotification("CineBite: New order arrives", {
                  body: "Open the staff queue to view the order.",
                  icon: "/logo.png",
                  tag: `staff-${id}`,
                  data: { kind: "staff" },
                });
            }
          })
          .catch(() => setPermission("unavailable"));
      }
    }
    initialized.current = true;
    // Bound memory to the currently active queue plus a recent deduplication tail.
    for (const order of queue.data) seen.current.add(order.id);
    if (seen.current.size > 2000)
      seen.current = new Set(Array.from(seen.current).slice(-1000));
  }, [allowed, queue.data, enabled]);
  useEffect(
    () => () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    []
  );
  if (!allowed) return null;
  return (
    <details
      className="staff-alert-panel print:hidden"
      aria-label="Reception order alerts"
    >
      <summary className="cursor-pointer font-semibold">Kitchen notification settings {enabled ? "• Sound on" : "• Sound off"}{notice ? " • New order received" : ""}</summary>
      <div>
        <strong>Reception & kitchen alerts</strong>
        <p role="status">
          {queue.error
            ? "Queue unavailable — check connection and retry"
            : connected
              ? "Live connection • backup refresh every 15s"
              : "Reconnecting • backup refresh every 15s"}
        </p>
      </div>
      <div className="staff-alert-actions">
        <Button
          disabled={busy || queue.isLoading || Boolean(queue.error)}
          onClick={async () => {
            if (enabled) {
              setEnabled(false);
              window.speechSynthesis?.cancel();
              return;
            }
            setBusy(true);
            // Start both directly from the gesture; mobile permission prompts require it.
            const audioReady = unlockKitchenAudio();
            speakNewOrder();
            const access =
              "Notification" in window
                ? Notification.requestPermission().catch(
                    () => "denied" as const
                  )
                : Promise.resolve("unsupported");
            try {
              const audio = await audioReady;
              setEnabled(audio);
              setPermission(await access);
              if (audio) playKitchenChime();
              else
                toast.error(
                  "Sound could not start. Tap again and check media volume."
                );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? "Enabling…"
            : enabled
              ? "Mute order alerts"
              : "Enable sound & notifications"}
        </Button>
        <Button
          variant="outline"
          disabled={!enabled}
          onClick={() => {
            playKitchenChime();
            speakNewOrder();
          }}
        >
          Test sound & voice
        </Button>
      </div>
      <p>
        Keep this app open during service. Sound follows phone volume and
        silent/DND settings. Notification permission: {permission}. Background
        notifications need separate enablement below.
      </p>
      <StaffPushSettings />
      {notice && (
        <div className="staff-new-order" role="alert">
          <strong>{notice}</strong>
          <a href="/rasoi">Open queue</a>
          <Button variant="outline" onClick={() => setNotice("")}>
            Acknowledged
          </Button>
        </div>
      )}
    </details>
  );
}
