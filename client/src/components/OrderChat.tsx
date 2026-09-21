import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

type Message = { id: string; text: string; sender: string; sentAt: string };
function Messages({ messages }: { messages: Message[] }) {
  return (
    <div
      className="order-chat-messages"
      role="log"
      aria-label="Order conversation"
      aria-live="polite"
    >
      {messages.length ? (
        messages.map(m => (
          <p key={m.id}>
            <strong>
              {m.sender === "staff" ? "Cinema staff" : "Customer"}
            </strong>
            <br />
            {m.text}
          </p>
        ))
      ) : (
        <p>No messages yet. Ask the counter for an update.</p>
      )}
    </div>
  );
}
const notice =
  "For order updates only. Do not share OTPs, card details or sensitive information. Messages are deleted from the main database on delivery; backups may expire later. Staff replies are not guaranteed immediately.";

export function CustomerOrderChat({ orderNumber }: { orderNumber: string }) {
  const [phone, setPhone] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState("");
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(true);
  const pendingMessage = useRef<{ id: string; text: string } | null>(null);
  const call = trpc.chat.customer.useMutation();
  const mutate = call.mutateAsync;
  useEffect(() => {
    if (!verifiedPhone || !open) return;
    let cancelled = false;
    let busy = false;
    const poll = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const result = await mutate({ orderNumber, phone: verifiedPhone });
        if (!cancelled) {
          setMessages(result.messages);
          setOpen(result.open);
          setError("");
        }
      } catch {
        if (!cancelled) setError("Connection interrupted. Reconnecting…");
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [verifiedPhone, open, orderNumber, mutate]);
  if (!open) return null;
  return (
    <section className="order-chat" aria-label="Delayed order chat">
      <h2>Waiting over 20 minutes? Chat with the counter</h2>
      <p>{notice}</p>
      {!verifiedPhone ? (
        <form
          onSubmit={async e => {
            e.preventDefault();
            try {
              const r = await mutate({ orderNumber, phone });
              setVerifiedPhone(phone);
              setMessages(r.messages);
              setOpen(r.open);
              setError("");
            } catch {
              setError(
                "Could not verify this order and phone number. Please check your details or try again later."
              );
            }
          }}
        >
          <label>
            Phone used for this order
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              value={phone}
              pattern="[6-9][0-9]{9}"
              maxLength={10}
              required
              onChange={e => setPhone(e.target.value)}
            />
          </label>
          <button disabled={call.isPending}>Open chat</button>
        </form>
      ) : (
        <>
          <Messages messages={messages} />
          <form
            onSubmit={async e => {
              e.preventDefault();
              if (!text.trim() || call.isPending) return;
              const message =
                pendingMessage.current?.text === text.trim()
                  ? pendingMessage.current
                  : { id: crypto.randomUUID(), text: text.trim() };
              pendingMessage.current = message;
              try {
                const r = await mutate({
                  orderNumber,
                  phone: verifiedPhone,
                  message,
                });
                setMessages(r.messages);
                setOpen(r.open);
                setText("");
                pendingMessage.current = null;
                setError("");
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Not sent. Retry when connected."
                );
              }
            }}
          >
            <label>
              Message
              <textarea
                value={text}
                required
                maxLength={500}
                onChange={e => setText(e.target.value)}
              />
            </label>
            <button disabled={call.isPending || !text.trim()}>
              Send message
            </button>
          </form>
        </>
      )}
      {error && <p role="status">{error}</p>}
    </section>
  );
}

export function StaffOrderChat() {
  const [selected, setSelected] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const pending = useRef<{ id: string; text: string } | null>(null);
  const inbox = trpc.chat.inbox.useQuery(undefined, { refetchInterval: 5000 });
  const thread = trpc.chat.staffRead.useQuery(
    { orderNumber: selected },
    { enabled: Boolean(selected), refetchInterval: 5000 }
  );
  const send = trpc.chat.staffSend.useMutation();
  const waiting = inbox.data?.filter(t => t.waiting).length ?? 0;
  return (
    <details className="order-chat">
      <summary>
        Customer chats {waiting > 0 ? `— ${waiting} awaiting reply` : ""}
      </summary>
      <p>
        Delayed orders only. Messages disappear after delivery. Keep this page
        open and check waiting conversations.
      </p>
      {inbox.isError && (
        <p role="alert">Chat inbox unavailable. Retry when connected.</p>
      )}
      {!inbox.data?.length && <p>No open conversations.</p>}
      <div className="flex flex-wrap gap-2">
        {inbox.data?.map(t => (
          <button
            key={t.orderNumber}
            onClick={() => {
              setSelected(t.orderNumber);
              setText("");
              pending.current = null;
              setError("");
            }}
          >
            …{t.orderNumber.slice(-6)}{" "}
            {t.waiting ? "• Reply needed" : "• Replied"}
          </button>
        ))}
      </div>
      {selected && (
        <>
          <p>Order {selected}</p>
          {thread.isError && <p role="alert">Unable to load conversation.</p>}
          {thread.data?.open === false ? (
            <p>Chat is closed.</p>
          ) : (
            <>
              <Messages messages={thread.data?.messages ?? []} />
              <form
                onSubmit={async e => {
                  e.preventDefault();
                  if (!text.trim() || send.isPending) return;
                  const message =
                    pending.current?.text === text.trim()
                      ? pending.current
                      : { id: crypto.randomUUID(), text: text.trim() };
                  pending.current = message;
                  try {
                    await send.mutateAsync({ orderNumber: selected, message });
                    setText("");
                    pending.current = null;
                    setError("");
                    await thread.refetch();
                    await inbox.refetch();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Reply failed");
                  }
                }}
              >
                <label>
                  Reply
                  <textarea
                    required
                    maxLength={500}
                    value={text}
                    onChange={e => setText(e.target.value)}
                  />
                </label>
                <button
                  disabled={
                    send.isPending || !thread.data?.open || !text.trim()
                  }
                >
                  Send reply
                </button>
              </form>
            </>
          )}
          {error && <p role="alert">{error}</p>}
        </>
      )}
    </details>
  );
}
