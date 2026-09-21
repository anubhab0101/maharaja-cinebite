import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { menuPrice } from '@shared/menu-pricing';

type Item = { id: string; name: string; category: string; description: string; pricePaise: number; discountPercent?: number; available: boolean; options: string[] };
const blank: Item = { id: "", name: "", category: "Snacks", description: "", pricePaise: 100, available: false, options: [] };
const categories = ["Combos", "Popcorn", "Snacks", "Beverages"] as const;

export default function MenuCatalog() {
  const menu = trpc.admin.menu.useQuery();
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<Item | null>(null);
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState("");
  const [search, setSearch] = useState("");
  async function refresh() {
    await Promise.all([utils.admin.menu.invalidate(), utils.catalog.menu.invalidate(), utils.kitchen.menu.invalidate()]);
  }
  const seed = trpc.admin.seedMenu.useMutation({ onSuccess: async () => { await refresh(); toast.success("Starter menu loaded. Review prices and availability."); }, onError: e => toast.error(e.message) });
  const save = trpc.admin.saveMenuItem.useMutation({ onSuccess: async () => { setDraft(null); await refresh(); toast.success("Menu item saved"); }, onError: e => toast.error(e.message) });
  const toggle = trpc.admin.setAvailability.useMutation({ onSuccess: refresh, onError: e => toast.error(e.message) });
  const busy = save.isPending || toggle.isPending || seed.isPending;
  function edit(item?: Item) { setEditing(Boolean(item)); setDraft(item ? { ...item, options: [...item.options] } : { ...blank }); setPrice(item ? String(item.pricePaise / 100) : ""); }
  if (menu.isPending) return <section className="admin-panel p-6" role="status">Loading saved menu…</section>;
  if (menu.isError) return <section className="admin-panel p-6" role="alert"><p>Menu could not load: {menu.error.message}</p><button className="primary-small" onClick={() => void menu.refetch()}>Retry menu</button></section>;
  const items = menu.data ?? [];
  return <section className="admin-panel p-6 space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><h2>Menu catalog ({items.length} saved items)</h2><button className="primary-small" disabled={busy} onClick={() => edit()}>Add menu item</button></header>
    {!items.length && <div className="border border-amber-400/40 rounded p-4 space-y-3"><p>No menu items have been saved yet. Customers may see the built-in preview menu; it is not your saved catalog.</p><p>Load the starter catalog to manage those items, or add your own. Review every price before accepting orders.</p><button className="primary-small" disabled={busy} onClick={() => { if (window.confirm("Load the starter menu with its current prices and availability? Review it before accepting orders.")) seed.mutate(); }}>{seed.isPending ? "Loading…" : "Load starter menu"}</button></div>}
    {draft && <form className="grid gap-4 border border-white/20 rounded p-4" onSubmit={e => {
      e.preventDefault();
      const pricePaise = Math.round(Number(price) * 100);
      if (!Number.isFinite(pricePaise) || pricePaise < 100 || pricePaise > 1000000) { toast.error("Enter a price between ₹1 and ₹10,000"); return; }
      if (!editing && items.some(item => item.id === draft.id)) { toast.error("This ID already exists. Use its Edit button."); return; }
      save.mutate({ ...draft, pricePaise, category: draft.category as typeof categories[number] });
    }}>
      <h3>{editing ? `Edit ${draft.name}` : "New menu item"}</h3>
      <label>Item ID <input className="block w-full border rounded p-2" required disabled={editing || busy} pattern="[a-z0-9-]{1,100}" value={draft.id} onChange={e => setDraft({ ...draft, id: e.target.value })} /></label>
      <label>Name <input className="block w-full border rounded p-2" required minLength={2} maxLength={120} disabled={busy} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
      <label>Price (₹) <input className="block w-full border rounded p-2" required type="number" min="1" max="10000" step="0.01" disabled={busy} value={price} onChange={e => setPrice(e.target.value)} /></label>
      <label>Discount (%) — 0 disables it<input className="block w-full border rounded p-2" type="number" required min="0" max="90" step="1" disabled={busy} value={draft.discountPercent ?? 0} onChange={e => setDraft({ ...draft, discountPercent: Number(e.target.value) })} /></label>
      <p className="text-sm">Discount applies to new orders only, not the platform fee. Existing order prices remain unchanged.</p>
      <label>Category <select className="block w-full border rounded p-2" value={draft.category} disabled={busy} onChange={e => setDraft({ ...draft, category: e.target.value })}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Description <textarea className="block w-full border rounded p-2" maxLength={500} disabled={busy} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
      <label className="flex gap-2"><input type="checkbox" disabled={busy} checked={draft.available} onChange={e => setDraft({ ...draft, available: e.target.checked })} />Available for ordering</label>
      <p className="text-sm">Existing item options are preserved. New items start unavailable until you enable them.</p>
      <div className="flex gap-4"><button className="primary-small" disabled={busy}>{save.isPending ? "Saving…" : "Save item"}</button><button type="button" disabled={busy} onClick={() => setDraft(null)}>Cancel</button></div>
    </form>}
    <label className="block">Search menu <input className="block w-full border rounded p-2" value={search} onChange={e => setSearch(e.target.value)} /></label>
    {items.filter(item => `${item.name} ${item.category}`.toLowerCase().includes(search.toLowerCase())).map(item => <article className="flex flex-wrap items-center justify-between gap-4 border-b border-white/15 py-3" key={item.id}>
      <div><h3>{item.name}</h3><p className="text-sm text-white/80">{item.category} · {Boolean(item.discountPercent) && <><s>₹{(item.pricePaise / 100).toFixed(2)}</s> → </>}₹{(menuPrice(item) / 100).toFixed(2)} {Boolean(item.discountPercent) && `(${item.discountPercent}% off)`} · {item.available ? "Available" : "Unavailable"}</p></div>
      <div className="flex items-center gap-4"><button className="primary-small" disabled={busy} onClick={() => edit(item)}>Edit {item.name}</button><label className="flex gap-2"><input type="checkbox" aria-label={`Availability of ${item.name}`} checked={item.available} disabled={busy || Boolean(draft)} onChange={e => toggle.mutate({ id: item.id, available: e.target.checked })} />In stock</label></div>
    </article>)}
    {items.length > 0 && !items.some(item => `${item.name} ${item.category}`.toLowerCase().includes(search.toLowerCase())) && <p>No matching items. Clear the search to see all items.</p>}
  </section>;
}
