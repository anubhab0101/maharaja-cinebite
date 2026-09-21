import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { hasStaffRole } from "@shared/cinebites";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function OfferCampaigns() {
  const { user } = useAuth();
  const allowed = Boolean(
    user && hasStaffRole(user.role, ["OWNER_ADMIN", "ADMIN"])
  );
  const summary = trpc.offers.summary.useQuery(undefined, { enabled: allowed });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [id, setId] = useState(() => crypto.randomUUID());
  const [approved, setApproved] = useState(false);
  const create = trpc.offers.createCampaign.useMutation({
    onSuccess: () => {
      void summary.refetch();
      setId(crypto.randomUUID());
      setTitle("");
      setBody("");
      setApproved(false);
    },
    onError: e => toast.error(e.message),
  });
  const send = trpc.offers.sendBatch.useMutation({
    onSuccess: () => {
      void summary.refetch();
    },
    onError: e => {
      toast.error(e.message);
      void summary.refetch();
    },
  });
  if (!allowed)
    return (
      <section className="admin-panel p-4">
        Only owner/admin accounts can broadcast offers.
      </section>
    );
  return (
    <section className="admin-panel p-4 space-y-4">
      <h2 className="text-xl">Offer notifications</h2>
      {summary.isError ? (
        <p role="alert">
          Could not load offers.{" "}
          <button onClick={() => void summary.refetch()}>Retry</button>
        </p>
      ) : (
        <p>
          {summary.data?.subscribers ?? "…"} opted-in browsers.{" "}
          {summary.data?.enabled
            ? "Push configured."
            : "Sending disabled: configure push keys and approve the offer notice before enabling."}
        </p>
      )}
      <p>
        Discounts are set per item in Menu. Notifications do not change prices.
        Only opted-in browsers receive offers; staff order alerts are separate.
      </p>
      <form
        className="space-y-3"
        onSubmit={e => {
          e.preventDefault();
          if (approved) create.mutate({ id, title, body });
        }}
      >
        <label>
          Notification title
          <Input
            required
            minLength={3}
            maxLength={60}
            value={title}
            onChange={e => setTitle(e.target.value)}
            disabled={create.isPending}
          />
        </label>
        <label>
          Offer message
          <Input
            required
            minLength={5}
            maxLength={180}
            value={body}
            onChange={e => setBody(e.target.value)}
            disabled={create.isPending}
          />
        </label>
        <p>
          Preview: <strong>{title || "Your title"}</strong> —{" "}
          {body || "Your offer message"}. Opens the current menu.
        </p>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={approved}
            onChange={e => setApproved(e.target.checked)}
          />
          I verified the discount is active and this message is accurate.
        </label>
        <Button
          disabled={
            !approved ||
            !summary.data?.enabled ||
            create.isPending ||
            send.isPending
          }
        >
          Create campaign
        </Button>
      </form>
      <p className="text-sm">
        Send in batches of 10. “Accepted” means accepted by the push provider,
        not seen by the customer. Failed/uncertain sends are not automatically
        retried to avoid duplicate offers.
      </p>
      {summary.data?.campaigns.map(c => (
        <article key={c.id} className="border rounded p-3 space-y-2">
          <h3>{c.title}</h3>
          <p>{c.body}</p>
          <p>
            Accepted: {c.accepted} · Failed: {c.failed} · Skipped: {c.skipped} ·
            Attempted: {c.attempted}
          </p>
          {c.processing ? (
            <p role="status">
              Sending or interrupted/unknown. Refresh to check; contact
              technical support if it remains stuck.
            </p>
          ) : c.done ? (
            <p>Campaign finished</p>
          ) : (
            <Button
              variant="outline"
              disabled={send.isPending || !summary.data?.enabled}
              onClick={() => {
                if (
                  window.confirm(
                    "Send this offer to the next batch of opted-in customers?"
                  )
                )
                  send.mutate({ id: c.id });
              }}
            >
              Send next batch (up to 10)
            </Button>
          )}
        </article>
      ))}
      <Button variant="outline" onClick={() => void summary.refetch()}>
        Refresh campaign status
      </Button>
    </section>
  );
}
