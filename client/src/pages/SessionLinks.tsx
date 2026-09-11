import { useState } from "react";
import { Clipboard, QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { rupees } from "@shared/cinebites";

export default function SessionLinks() {
  const baseUrl = window.location.origin;
  const links = trpc.admin.sessionLinks.useQuery({ baseUrl });
  const generate = trpc.admin.generateSessionLinks.useMutation({ onSuccess: () => { links.refetch(); toast.success("QR session links generated"); }, onError: (error) => toast.error(error.message) });
  const [copied, setCopied] = useState<number | null>(null);
  async function copy(id: number, url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(id);
    toast("Session link copied");
    window.setTimeout(() => setCopied(null), 1600);
  }
  return <section className="admin-panel table-panel"><div className="table-toolbar"><div><p className="admin-kicker">Secure customer access</p><h2>Screen & showtime QR links</h2><p className="mt-2 max-w-2xl text-sm text-white/55">Print one QR per screen and showtime. Scanning it binds the customer session to the selected show and activates the runtime-based ordering window.</p></div><button className="primary-small" onClick={() => generate.mutate({ baseUrl })} disabled={generate.isPending}><RefreshCw size={14} className={generate.isPending ? "animate-spin" : ""} /> {generate.isPending ? "Generating…" : "Generate / refresh"}</button></div>{!links.data?.length ? <div className="empty-admin-panel"><QrCode size={25} /><h3>No session links yet</h3><p>Generate links after showtimes and screens have been imported.</p></div> : <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">{links.data.map((item) => <article key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="mb-3 flex items-start justify-between gap-3"><div><p className="admin-kicker">{item.screenName}</p><h3 className="mt-1 text-base font-semibold">{item.show.movieTitle}</h3><p className="mt-1 text-sm text-white/55">{item.show.showDate} · {item.show.startTime} · {item.show.durationMinutes} min</p></div><QrCode size={18} className="text-orange-300" /></div><div className="mx-auto my-4 flex w-fit rounded-xl bg-white p-2"><img src={item.qrDataUrl} alt={`QR for ${item.show.movieTitle} ${item.show.showDate} ${item.show.startTime}`} className="h-44 w-44" /></div><button className="secondary-admin-button w-full" onClick={() => copy(item.id, item.url)}><Clipboard size={14} /> {copied === item.id ? "Copied" : "Copy session link"}</button><p className="mt-3 break-all text-xs text-white/35">{item.url}</p></article>)}</div>}</section>;
}
