import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
export default function AdminPushSilencer() {
  const { mutateAsync } = trpc.staffPush.disable.useMutation();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.getRegistration("/").then(async reg => {
      const sub = await reg?.pushManager?.getSubscription();
      if (sub) await mutateAsync({ endpoint: sub.endpoint });
    }).catch(() => toast.error("Could not stop background kitchen alerts on this device. Open kitchen notification settings and stop them when connected."));
  }, [mutateAsync]);
  return null;
}
