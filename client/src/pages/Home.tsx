import { useEffect, useMemo, useState, useRef } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  Clock3,
  Coffee,
  Cookie,
  Copy,
  Flame,
  Info,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Ticket,
  Utensils,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { loadRazorpay } from "@/lib/razorpay-loader";
import AnimatedButton from "@/components/ui/animated-button";
import AsciiGlitchRipple from "@/components/ui/ascii-glitch-ripple";
import { trpc } from "@/lib/trpc";
import {
  SavedOrder,
  getActiveOrder,
  saveActiveOrder,
  dismissOrderTracking,
  isOrderDismissed,
} from "@/lib/orderStorage";

type Category = "Popular" | "Combos" | "Popcorn" | "Snacks" | "Beverages";
type View = "menu" | "checkout" | "tracking";

type MenuItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  category: Exclude<Category, "Popular">;
  tag?: string;
  tone: string;
  icon: "combo" | "bites" | "drink" | "sweet";
  available?: boolean;
};

type CartItem = MenuItem & { quantity: number };

const defaultMenu: MenuItem[] = [
  // --- COMBOS (7 items) ---
  { id: "festival-combo", name: "Festival Combo", description: "Large Popcorn + Cold Drink 300ml", price: 11700, category: "Combos", tag: "10% off", tone: "bg-[#181310] text-[#d48753] border border-[#261c14]", icon: "combo", available: true },
  { id: "maharaja-combo", name: "Maharaja Combo", description: "Regular Popcorn + Wafers + Paneer Puff + Cold Drink 300ml", price: 16000, category: "Combos", tone: "bg-[#181310] text-[#d48753] border border-[#261c14]", icon: "combo", available: true },
  { id: "puff-combo", name: "Puff Combo", description: "Veg Puff + Cold Drink 300ml", price: 8000, category: "Combos", tone: "bg-[#181310] text-[#d48753] border border-[#261c14]", icon: "combo", available: true },
  { id: "regular-popcorn-combo", name: "Regular Popcorn Combo", description: "Regular Popcorn + Cold Drink 300ml", price: 8500, category: "Combos", tag: "5% off", tone: "bg-[#181310] text-[#d48753] border border-[#261c14]", icon: "combo", available: true },
  { id: "nachos-combo", name: "Nachos Combo", description: "Nachos with Salsa + Cold Drink 300ml", price: 10000, category: "Combos", tone: "bg-[#181310] text-[#d48753] border border-[#261c14]", icon: "combo", available: true },
  { id: "sweet-corn-coke", name: "Sweet corn + Coke 300ml", description: "Sweet corn + Coke 300ml", price: 9000, category: "Combos", tag: "10% off", tone: "bg-[#181310] text-[#d48753] border border-[#261c14]", icon: "combo", available: true },
  { id: "momos-combo", name: "Momos Combo", description: "Panner Momos 8N + Cold Drink 300ml", price: 14000, category: "Combos", tone: "bg-[#181310] text-[#d48753] border border-[#261c14]", icon: "combo", available: true },

  // --- POPCORN (5 items) ---
  { id: "regular-popcorn", name: "Regular Popcorn", description: "Fresh salted regular popcorn", price: 5000, category: "Popcorn", tone: "bg-[#161410] text-[#c7a462] border border-[#242016]", icon: "bites", available: true },
  { id: "large-popcorn", name: "Large Popcorn", description: "Large bucket fresh buttered popcorn", price: 9000, category: "Popcorn", tone: "bg-[#161410] text-[#c7a462] border border-[#242016]", icon: "bites", available: true },
  { id: "tub-cheese-popcorn", name: "Tub Cheese Popcorn", description: "Large tub savory cheese seasoned popcorn", price: 16000, category: "Popcorn", tone: "bg-[#161410] text-[#c7a462] border border-[#242016]", icon: "bites", available: true },
  { id: "tub-tomato-popcorn", name: "Tub Tomato Popcorn", description: "Large tub tangy tomato flavored popcorn", price: 16000, category: "Popcorn", tone: "bg-[#161410] text-[#c7a462] border border-[#242016]", icon: "bites", available: true },
  { id: "tub-chat-popcorn", name: "Tub Chat Popcorn", description: "Large tub spicy chat masala popcorn", price: 16000, category: "Popcorn", tone: "bg-[#161410] text-[#c7a462] border border-[#242016]", icon: "bites", available: true },

  // --- SNACKS (3 items) ---
  { id: "paneer-momos", name: "Panner Momos 8N", description: "Steamed paneer momos (8 pcs) with dipping sauces", price: 10000, category: "Snacks", tone: "bg-[#161410] text-[#c7a462] border border-[#242016]", icon: "bites", available: true },
  { id: "nachos-with-salsa", name: "Nachos with Salsa", description: "Crisp corn nachos served with salsa dip", price: 6000, category: "Snacks", tone: "bg-[#161410] text-[#c7a462] border border-[#242016]", icon: "bites", available: true },
  { id: "sweet-corn", name: "Sweet Corn", description: "Warm buttery sweet corn", price: 5000, category: "Snacks", tone: "bg-[#161410] text-[#c7a462] border border-[#242016]", icon: "bites", available: true },

  // --- BEVERAGES (10 items) ---
  { id: "cold-drink-300ml", name: "Cold Drink 300ml", description: "Chilled refreshing cold drink 300ml", price: 4000, category: "Beverages", tone: "bg-[#10171a] text-[#63aab8] border border-[#17252b]", icon: "drink", available: true },
  { id: "masala-tea", name: "Masala Tea 200ml", description: "Freshly brewed hot ginger masala tea 200ml", price: 4000, category: "Beverages", tone: "bg-[#10171a] text-[#63aab8] border border-[#17252b]", icon: "drink", available: true },
  { id: "cappuccino-200ml", name: "Cappuccino 200ml", description: "Hot freshly frothed cappuccino 200ml", price: 5000, category: "Beverages", tone: "bg-[#10171a] text-[#63aab8] border border-[#17252b]", icon: "drink", available: true },
  { id: "cold-coffee", name: "Cold Coffee", description: "One Cold Coffee 300ml", price: 6000, category: "Beverages", tone: "bg-[#10171a] text-[#63aab8] border border-[#17252b]", icon: "drink", available: true },
  { id: "badam-shake", name: "Badam Shake", description: "Rich badam almond thick milk shake", price: 6000, category: "Beverages", tone: "bg-[#171116] text-[#b5739c] border border-[#271824]", icon: "sweet", available: true },
  { id: "chocolate-shake", name: "Chocolate Shake", description: "Rich chocolate thick shake with fudge", price: 6000, category: "Beverages", tone: "bg-[#171116] text-[#b5739c] border border-[#271824]", icon: "sweet", available: true },
  { id: "strawberry-shake", name: "Strawberry Shake", description: "Classic strawberry thick milk shake", price: 6000, category: "Beverages", tone: "bg-[#171116] text-[#b5739c] border border-[#271824]", icon: "sweet", available: true },
  { id: "virgin-mojito-mocktail", name: "Virgin Mojito Mocktail", description: "Refreshing lime and mint cooler", price: 6000, category: "Beverages", tone: "bg-[#10171a] text-[#63aab8] border border-[#17252b]", icon: "drink", available: true },
  { id: "green-mint-mocktail", name: "Green mint Mocktail", description: "Refreshing iced mint cooler", price: 6000, category: "Beverages", tone: "bg-[#10171a] text-[#63aab8] border border-[#17252b]", icon: "drink", available: true },
  { id: "blue-curacao-mocktail", name: "Blue Curacao Mocktail", description: "Citrus tropical mocktail with soda", price: 6000, category: "Beverages", tone: "bg-[#10171a] text-[#63aab8] border border-[#17252b]", icon: "drink", available: true },
];

import { CHECKOUT_POLICIES, POLICY_VERSION, CUTOFF_NOTICE, checkoutConsentSchema } from "@shared/consent";
const policies = CHECKOUT_POLICIES;

function money(paise: number) {
  return `₹${(paise / 100).toFixed(0)}`;
}

function ItemIllustration({ item, small = false }: { item: MenuItem; small?: boolean }) {
  const size = small ? "h-12 w-12" : "h-16 w-16";
  return (
    <div className={`relative ${size} shrink-0 overflow-hidden rounded-[1.2rem] ${item.tone} shadow-none`}>
      {item.icon === "combo" && (
        <>
          <div className="absolute bottom-2 left-3 h-6 w-7 -rotate-6 rounded-b-lg rounded-t-[45%] border-[2px] border-amber-600/40 bg-amber-600/20" />
          <div className="absolute right-2 top-2 h-8 w-6 rotate-6 rounded-b-md rounded-t-[40%] border-[2px] border-amber-600/40 bg-amber-500/15" />
          <div className="absolute left-2 top-2 h-1.5 w-1.5 rounded-full bg-amber-400/30" />
          <div className="absolute right-3 bottom-2 h-1.5 w-1.5 rounded-full bg-amber-400/30" />
        </>
      )}
      {item.icon === "bites" && (
        <>
          <div className="absolute bottom-2 left-3 h-7 w-10 -skew-x-6 rounded-t-lg border border-current/30 bg-current/15" />
          <div className="absolute left-4 top-3 h-2.5 w-2.5 rounded-full bg-current/30" />
          <div className="absolute right-2 top-5 h-2 w-2 rounded-full bg-current/20" />
          <div className="absolute right-4 bottom-4 h-2 w-2 rounded-full bg-current/20" />
        </>
      )}
      {item.icon === "drink" && (
        <>
          <div className="absolute bottom-2 left-4 h-9 w-7 rounded-b-lg rounded-t-md border border-current/30 bg-current/15" />
          <div className="absolute left-5 top-1 h-5 w-1 rotate-12 rounded-full bg-current/35" />
          <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-current/25" />
        </>
      )}
      {item.icon === "sweet" && (
        <>
          <div className="absolute bottom-3 left-3 h-7 w-10 rotate-3 rounded-md border border-current/30 bg-current/15" />
          <div className="absolute left-5 top-2 h-2 w-2 rounded-full bg-current/35" />
          <div className="absolute right-2 bottom-2 h-2 w-2 rounded-full bg-current/20" />
        </>
      )}
    </div>
  );
}

function BrandMark() {
  return (
    <div className="brand-mark" aria-label="CineBites logo">
      <img
        src="/logo.png"
        alt="CineBites Maharaja Logo"
        className="brand-logo-img"
      />
      <span className="brand-mark-text">cine<span>bites</span></span>
    </div>
  );
}

function Header({
  view,
  onBack,
  cartCount,
  onCart,
  activeOrder,
  onOpenTracking,
  onOpenLookup,
}: {
  view: View;
  onBack: () => void;
  cartCount: number;
  onCart: () => void;
  activeOrder?: SavedOrder | null;
  onOpenTracking?: () => void;
  onOpenLookup?: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.05] bg-[#080808]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-4 sm:px-8">
        {view === "menu" ? <BrandMark /> : <button onClick={onBack} className="icon-button" aria-label="Back to menu"><ChevronLeft size={21} /></button>}
        {view === "menu" && (
          <nav className="hidden items-center gap-7 md:flex">
            <a href="#menu" className="nav-link active">Menu</a>
            <a href="#how-it-works" className="nav-link">How it works</a>
            <a href="/support" className="nav-link">Support</a>
          </nav>
        )}
        <div className="flex items-center gap-2 sm:gap-3">
          {activeOrder ? (
            <button
              onClick={onOpenTracking}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs font-semibold hover:bg-amber-500/25 transition-all cursor-pointer"
              title="Track your active cinema order"
            >
              <span className="live-pulse-dot" />
              <span>Track #{activeOrder.orderNumber}</span>
            </button>
          ) : (
            <button
              onClick={onOpenLookup}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-white/70 text-xs font-medium hover:text-white hover:bg-white/[0.1] transition-all cursor-pointer"
              title="Find an existing cinema order"
            >
              <Search size={13} />
              <span className="hidden sm:inline">Track Order</span>
            </button>
          )}
          <button onClick={onCart} className="cart-button" aria-label="Open cart">
            <span className="cart-count">{cartCount}</span>
            <span>Cart</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function CinemaContext({ screen, seat, showTitle }: { screen?: string; seat?: string; showTitle?: string }) {
  return (
    <section className="cinema-context">
      <div className="flex items-center gap-3">
        <div className="context-icon"><Ticket size={16} /></div>
        <div>
          <p className="eyebrow">Your cinema session</p>
          <p className="context-title">{showTitle ? `${showTitle} • ${screen || "Main Screen"}${seat ? ` • Seat ${seat}` : ""}` : `Maharaja Cinema • ${screen || "Bhubaneswar"}${seat ? ` • Seat ${seat}` : ""}`}</p>
        </div>
      </div>
      <div className="context-divider" />
      <div className="flex items-center gap-2 text-[#a8a6a0]">
        <Clock3 size={15} />
        <span className="text-sm">{seat ? `${screen} • Seat ${seat}` : screen ? `Bound to ${screen}` : "Seat QR verified"}</span>
      </div>
      <div className="verified-chip"><ShieldCheck size={14} /> Ready to order</div>
    </section>
  );
}

function Hero() {
  return (
    <section className="hero-section">
      <div className="hero-glow" />
      <div className="relative z-10 max-w-3xl">
        <p className="eyebrow accent-eyebrow"><Sparkles size={13} /> Your movie. Your seat. Your snacks.</p>
        <h1>Good films deserve<br /><em><AsciiGlitchRipple>great food.</AsciiGlitchRipple></em></h1>
        <p className="hero-copy">Order from your seat and we&apos;ll bring it to you before the best part.</p>
      </div>
      <div className="hero-scribble" aria-hidden="true"><span>made for the</span><strong>big screen</strong><i /></div>
    </section>
  );
}

function CategoryTabs({ active, setActive }: { active: Category; setActive: (category: Category) => void }) {
  const categories: { label: Category; icon: typeof Flame }[] = [
    { label: "Popular", icon: Flame },
    { label: "Combos", icon: Ticket },
    { label: "Popcorn", icon: Sparkles },
    { label: "Snacks", icon: Utensils },
    { label: "Beverages", icon: Coffee },
  ];
  return <div className="category-scroller">{categories.map(({ label, icon: Icon }) => <button key={label} onClick={() => setActive(label)} className={`category-tab ${active === label ? "selected" : ""}`}><Icon size={15} />{label}</button>)}</div>;
}

function MenuCard({
  item,
  cart,
  onAdd,
  onChange,
  orderingOpen,
}: {
  item: MenuItem;
  cart: CartItem | undefined;
  onAdd: () => void;
  onChange: (delta: number) => void;
  orderingOpen: boolean;
}) {
  const isAvailable = item.available !== false;
  return (
    <article className={`menu-card ${!isAvailable ? "opacity-60" : ""}`}>
      <ItemIllustration item={item} />
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3>{item.name}</h3>
          {!isAvailable ? (
            <span className="tag bg-red-900/60 text-red-200">Sold out</span>
          ) : (
            item.tag && <span className="tag">{item.tag}</span>
          )}
        </div>
        <p className="item-description">{item.description}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="item-price">{money(item.price)}</span>
          {!isAvailable ? (
            <button disabled className="add-button opacity-50 cursor-not-allowed">
              Sold out
            </button>
          ) : cart ? (
            <div className="quantity-control">
              <button disabled={!orderingOpen} onClick={() => onChange(-1)} aria-label={`Remove one ${item.name}`}>
                <Minus size={13} />
              </button>
              <strong>{cart.quantity}</strong>
              <button disabled={!orderingOpen} onClick={() => onChange(1)} aria-label={`Add one ${item.name}`}>
                <Plus size={13} />
              </button>
            </div>
          ) : (
            <AnimatedButton disabled={!orderingOpen} className="add-button" onClick={onAdd}>
              <Plus size={15} /> {orderingOpen ? "Add" : "Closed"}
            </AnimatedButton>
          )}
        </div>
      </div>
    </article>
  );
}

function CartDrawer({ cart, total, onChange, onClose, onCheckout }: { cart: CartItem[]; total: number; onChange: (id: string, delta: number) => void; onClose: () => void; onCheckout: () => void }) {
  const finalTotal = total + 1000; // includes ₹10 platform fee
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="cart-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Your order</p>
            <h2>{cart.length} {cart.length === 1 ? "item" : "items"}</h2>
          </div>
          <button onClick={onClose} className="icon-button"><X size={19} /></button>
        </div>
        {cart.length === 0 ? (
          <div className="empty-cart">
            <div className="empty-cart-icon"><Utensils size={22} /></div>
            <p>Your cart is waiting for a plot twist.</p>
            <button onClick={onClose} className="text-link">Browse the menu <ArrowRight size={14} /></button>
          </div>
        ) : (
          <>
            <div className="drawer-items">
              {cart.map((item) => (
                <div key={item.id} className="drawer-item">
                  <ItemIllustration item={item} small />
                  <div className="min-w-0 flex-1">
                    <h4>{item.name}</h4>
                    <span>{money(item.price)} each</span>
                    <div className="quantity-control mt-2 w-fit">
                      <button onClick={() => onChange(item.id, -1)}><Minus size={12} /></button>
                      <strong>{item.quantity}</strong>
                      <button onClick={() => onChange(item.id, 1)}><Plus size={12} /></button>
                    </div>
                  </div>
                  <strong className="drawer-item-total">{money(item.price * item.quantity)}</strong>
                </div>
              ))}
            </div>
            <div className="drawer-footer">
              <div className="space-y-1.5 mb-3">
                <div className="flex items-center justify-between text-xs text-[#85827b]">
                  <span>Items subtotal</span>
                  <span className="font-mono text-[#dedad2]">{money(total)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-[#85827b]">
                  <span>Platform fee</span>
                  <span className="font-mono text-amber-400">₹10</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-white/10">
                  <span className="text-sm font-medium text-[#dedad2]">Total to pay</span>
                  <strong className="text-lg font-mono text-[#dedad2]">{money(finalTotal)}</strong>
                </div>
              </div>
              <AnimatedButton
                onClick={() => { toast.dismiss(); onCheckout(); }}
                className="primary-button w-full relative z-10 cursor-pointer"
              >
                Review & pay {money(finalTotal)} <ArrowRight size={17} />
              </AnimatedButton>
              <p className="secure-note"><ShieldCheck size={13} /> Payment is secured by Razorpay</p>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function ConsentBlock({ accepted, setAccepted }: { accepted: boolean[]; setAccepted: (next: boolean[]) => void }) {

  return (
    <div className="consent-block">
      <div role="note" className="mb-4 rounded-xl border-2 border-amber-400 bg-amber-400/15 p-4 text-amber-100"><strong className="block text-lg">Important: last 30 minutes — no new orders</strong><p>{CUTOFF_NOTICE}</p><p className="mt-2">No change-of-mind cancellations or refunds once an order is placed. This does not affect remedies for non-delivery, faulty food, duplicate charges or other rights required by law.</p></div>
      <div className="consent-heading flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="consent-icon"><ShieldCheck size={16} /></div>
          <div>
            <h3>Terms & Policies</h3>
            <p>Standard cinema in-seat delivery rules.</p>
          </div>
        </div>
      </div>
      <div className="consent-list">
        {policies.map((policy, index) => (
          <div key={policy.key} className="consent-row">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={accepted[index] ?? false} onChange={event => setAccepted(accepted.map((value, i) => i === index ? event.target.checked : value))} className="mt-1 accent-orange-400" />
              <span>{policy.text}</span>
            </label>
            <a href={policy.href} target="_blank" rel="noreferrer" className="underline text-orange-300">Read policy (new tab)</a>
          </div>
        ))}
      </div>
      <div className="consent-note">
        <Info size={14} /> Food preparation begins after payment confirmation. No change-of-mind refunds after ordering; statutory remedies remain available.
      </div>
    </div>
  );
}

function Checkout({
  cart,
  total,
  accepted,
  setAccepted,
  initialScreen,
  initialSeat,
  isSubmitting,
  onBack,
  onPaid,
}: {
  cart: CartItem[];
  total: number;
  accepted: boolean[];
  setAccepted: (next: boolean[]) => void;
  initialScreen: string;
  initialSeat?: string;
  isSubmitting: boolean;
  onBack: () => void;
  onPaid: (details: { name: string; phone: string; seat: string; screen: string }) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [seat, setSeat] = useState(initialSeat || "G12");
  const [screen] = useState(initialScreen || "Screen 01");

  const cleanDigits = phone.replace(/\D/g, "");
  const normalizedPhone = cleanDigits.length === 12 && cleanDigits.startsWith("91") ? cleanDigits.slice(2) : cleanDigits;
  const isPhoneValid = /^[6-9]\d{9}$/.test(normalizedPhone);
  const isNameValid = name.trim().length >= 2;
  const isSeatValid = seat.trim().length >= 1;
  const allAccepted = accepted.every(Boolean);
  const isFormComplete = isNameValid && isPhoneValid && isSeatValid && allAccepted;

  function handlePayClick() {
    if (!isNameValid) {
      toast.error("Please enter your name", {
        description: "Name must be at least 2 characters.",
      });
      return;
    }
    if (!isPhoneValid) {
      toast.error("Invalid mobile number", {
        description: "Please enter a valid 10-digit Indian mobile number (e.g. 98765 43210).",
      });
      return;
    }
    if (!isSeatValid) {
      toast.error("Please enter your seat number", {
        description: "Seat number is required so staff can deliver to your seat.",
      });
      return;
    }
    if (!allAccepted) {
      toast.error("Policies not accepted", {
        description: "Please accept the cinema terms and refund policy to proceed.",
      });
      return;
    }
    onPaid({
      name: name.trim(),
      phone: normalizedPhone,
      seat: seat.trim().toUpperCase(),
      screen: screen.trim(),
    });
  }

  return (
    <main className="checkout-page">
      <div className="checkout-intro">
        <p className="eyebrow accent-eyebrow"><Zap size={13} /> Almost there</p>
        <h1>Lock in the<br /><em>good stuff.</em></h1>
        <p>We&apos;ll deliver to {screen} • Seat {seat || "selected"}.</p>
      </div>
      <div className="checkout-grid">
        <section className="checkout-panel">
          <div className="section-kicker"><span>01</span><div><h2>Delivery details</h2><p>Used only to verify delivery at your seat.</p></div></div>
          <label className="field-label">Your name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rahul Sharma"
              maxLength={80}
              className={!isNameValid && name.length > 0 ? "border-amber-500/50" : ""}
            />
          </label>
          <label className="field-label">Indian mobile number
            <div className="phone-input">
              <span>+91</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98765 43210"
                inputMode="numeric"
                maxLength={14}
              />
            </div>
            {phone.length > 0 && !isPhoneValid && (
              <span className="text-[11px] text-amber-400/80 mt-1 block">
                Must be a valid 10-digit mobile number starting with 6-9
              </span>
            )}
          </label>
          <label className="field-label">Seat number
            <input
              value={seat}
              onChange={(e) => setSeat(e.target.value.toUpperCase())}
              placeholder="e.g. G12, F5"
              maxLength={10}
            />
          </label>
          <p className="field-hint"><Smartphone size={13} /> We&apos;ll ask for your name and last 4 digits at delivery.</p>
          <ConsentBlock accepted={accepted} setAccepted={setAccepted} />
        </section>
        <aside className="review-panel">
          <div className="section-kicker"><span>02</span><div><h2>Order summary</h2><p>Payment is online only.</p></div></div>
          <div className="review-items">
            {cart.map((item) => (
              <div key={item.id} className="review-item">
                <div className="flex min-w-0 items-center gap-3">
                  <ItemIllustration item={item} small />
                  <div className="min-w-0">
                    <strong>{item.name}</strong>
                    <span>{item.quantity} × {money(item.price)}</span>
                  </div>
                </div>
                <strong>{money(item.price * item.quantity)}</strong>
              </div>
            ))}
          </div>
          <div className="summary-line"><span>Items subtotal</span><span>{money(total)}</span></div>
          <div className="summary-line"><span>Platform fee</span><span className="text-amber-400 font-mono font-medium">₹10</span></div>
          <div className="summary-line"><span>Taxes</span><span className="text-[#85827b] text-xs">Included in item prices</span></div>
          <div className="summary-total"><span>Total to pay</span><strong>{money(total + 1000)}</strong></div>
          <div className="checkout-notice">
            <ShieldCheck size={16} />
            <span>Secure Razorpay checkout<br /><small>We only create your order after payment is confirmed.</small></span>
          </div>

          <button
            disabled={isSubmitting}
            onClick={handlePayClick}
            className={`primary-button w-full transition-all ${
              !isFormComplete ? "opacity-85 hover:opacity-100" : ""
            }`}
          >
            {isSubmitting ? "Placing order..." : `Pay ${money(total + 1000)} securely`} <ArrowRight size={17} />
          </button>

          {!isFormComplete && (
            <div className="mt-3 p-3 rounded-xl bg-white/[0.04] border border-white/10 text-xs space-y-1.5">
              <p className="text-amber-300 font-medium text-[11px] flex items-center gap-1.5">
                <Info size={12} /> Required before payment:
              </p>
              <div className="grid grid-cols-2 gap-1 text-[11px]">
                <span className={isNameValid ? "text-emerald-400" : "text-white/50"}>
                  {isNameValid ? "✓ Name ready" : "○ Enter your name"}
                </span>
                <span className={isPhoneValid ? "text-emerald-400" : "text-white/50"}>
                  {isPhoneValid ? "✓ Mobile ready" : "○ 10-digit mobile"}
                </span>
                <span className={isSeatValid ? "text-emerald-400" : "text-white/50"}>
                  {isSeatValid ? "✓ Seat ready" : "○ Seat number"}
                </span>
                <span className={allAccepted ? "text-emerald-400" : "text-white/50"}>
                  {allAccepted ? "✓ Policies ok" : "○ Accept policies"}
                </span>
              </div>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function Tracking({
  onBack,
  orderNumber,
  phoneLast4,
  screen,
  seat,
}: {
  onBack: () => void;
  orderNumber: string;
  phoneLast4: string;
  screen: string;
  seat: string;
}) {
  const trackQuery = trpc.order.track.useQuery(
    { orderNumber, phoneLast4 },
    { refetchInterval: 4000 }
  );

  const orderData = trackQuery.data;
  const currentStatus = orderData?.status || "NEW";
  const isPaid = orderData?.paymentStatus === "CONFIRMED";

  const isPreparing = currentStatus === "PREPARING" || currentStatus === "READY" || currentStatus === "DELIVERED";
  const isReady = currentStatus === "READY" || currentStatus === "DELIVERED";
  const isDelivered = currentStatus === "DELIVERED";

  const steps = [
    { title: isPaid ? "Payment confirmed" : "Awaiting payment confirmation", detail: isPaid ? "Your order is safely in the queue" : "If money was deducted, do not pay again. Keep this order number and ask cinema staff for help.", done: isPaid },
    { title: "Preparing your order", detail: "The kitchen is on it", done: isPreparing },
    { title: `On its way to ${orderData?.screen || screen} • Seat ${orderData?.seat || seat}`, detail: "A crew member will verify your name + last 4 digits", done: isReady },
    { title: "Delivered", detail: "Enjoy the show!", done: isDelivered },
  ];

  const estimatedMinutes = isDelivered ? 0 : isReady ? 2 : isPreparing ? 8 : 14;

  return (
    <main className="tracking-page">
      <div className="tracking-hero">
        <div className="success-orbit"><div className="success-core"><Check size={28} strokeWidth={2.5} /></div></div>
        <p className="eyebrow accent-eyebrow">{isPaid ? "Order confirmed" : "Payment confirmation pending"}</p>
        <h1>{isPaid ? "Your snacks are on their way." : "Checking your payment."}</h1>
        <p>Order <strong>#{orderNumber}</strong> • <strong>{orderData?.screen || screen} • Seat {orderData?.seat || seat}</strong>.</p>
        {trackQuery.isError && <p role="alert">Cannot refresh status. Please retry or <a href="/support">view support information</a>.</p>}
      </div>

      <section className="tracking-card">
        <div className="tracking-card-header">
          <div>
            <p className="eyebrow">Live order status</p>
            <h2>{!isPaid ? "Not yet sent to kitchen" : isDelivered ? "Delivered to your seat!" : "Kitchen status (delivery time may vary)"}</h2>
          </div>
          <div className="pulse-dot" />
        </div>

        <div className="timeline">
          {steps.map((step, index) => (
            <div className={`timeline-step ${step.done ? "done" : ""}`} key={step.title}>
              <div className="timeline-marker">
                {step.done ? <Check size={13} strokeWidth={3} /> : <span>{index + 1}</span>}
              </div>
              <div>
                <strong>{step.title}</strong>
                <p>{step.detail}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Itemized Order Breakdown */}
        {orderData?.items && orderData.items.length > 0 && (
          <div className="mt-3 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between text-xs text-white/70 mb-2">
              <span className="font-semibold uppercase tracking-wider text-[11px] text-[#dedad2]">Order Summary</span>
              <span className="font-mono text-amber-400 font-bold text-sm">
                ₹{((orderData.totalPaise ?? 0) / 100).toFixed(0)}
              </span>
            </div>
            <div className="space-y-1.5 text-xs">
              {orderData.items.map((line) => (
                <div key={line.id} className="flex justify-between items-center text-[#dedad2]">
                  <span>
                    <strong className="text-amber-400/90">{line.quantity}×</strong> {line.name}
                  </span>
                  <span className="text-white/60 font-mono">
                    ₹{((line.pricePaise * line.quantity) / 100).toFixed(0)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between items-center text-xs text-[#85827b] pt-2 mt-2 border-t border-white/5">
                <span>Platform fee</span>
                <span className="font-mono text-amber-400">₹10</span>
              </div>
            </div>
          </div>
        )}

        <div className="delivery-note mt-4">
          <ShieldCheck size={16} />
          <div>
            <strong>Privacy-safe delivery</strong>
            <p>Staff will verify your name ({orderData?.customerName || "Customer"}) and last 4 digits (•••• {phoneLast4}) at your seat.</p>
          </div>
        </div>

        {/* Reassurance Notice */}
        <div className="mt-4 p-3.5 rounded-xl bg-amber-500/[0.07] border border-amber-500/20 text-left text-xs space-y-1">
          <p className="text-amber-300 font-semibold flex items-center gap-1.5">
            <Info size={14} /> Feel free to return to the menu
          </p>
          <p className="text-white/70 text-[11px] leading-relaxed">
            If you leave this screen or accidentally close the tab, your snacks are still being prepared! A floating banner stays active at the bottom of your screen, or you can tap <strong>&ldquo;Track #{orderNumber}&rdquo;</strong> in the top bar anytime.
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
        <button onClick={onBack} className="secondary-button !mt-0">
          <Utensils size={14} /> Back to menu
        </button>
        <button
          onClick={() => {
            const shareUrl = `${window.location.origin}/?track=${orderNumber}&phone=${phoneLast4}`;
            void navigator.clipboard.writeText(shareUrl);
            toast.success("Order link copied!", {
              description: "Share with your cinema seat companion or save to your notes.",
            });
          }}
          className="secondary-button !mt-0 text-white/70"
        >
          <Copy size={14} /> Copy tracking link
        </button>
      </div>
    </main>
  );
}

function ActiveOrderBanner({
  order,
  onOpenTracking,
  onDismiss,
}: {
  order: SavedOrder;
  onOpenTracking: () => void;
  onDismiss: () => void;
}) {
  const trackQuery = trpc.order.track.useQuery(
    { orderNumber: order.orderNumber, phoneLast4: order.phoneLast4 },
    { refetchInterval: 5000 }
  );

  const status = trackQuery.data?.status || "NEW";
  const isDelivered = status === "DELIVERED";
  const isReady = status === "READY";
  const isPreparing = status === "PREPARING";

  const statusLabel = trackQuery.data?.paymentStatus !== "CONFIRMED" ? "Payment confirmation pending" : isDelivered
    ? "Delivered to your seat!"
    : isReady
    ? "On its way to your seat!"
    : isPreparing
    ? "Kitchen is preparing your snacks"
    : "Order received • In queue";

  return (
    <div className="active-order-banner-wrapper">
      <div className="active-order-banner">
        <div
          className="flex items-center gap-3 min-w-0 cursor-pointer flex-1"
          onClick={onOpenTracking}
        >
          <span className={`live-pulse-dot ${isDelivered ? "delivered" : ""}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <strong className="text-xs font-semibold text-[#dedad2]">
                Order #{order.orderNumber}
              </strong>
              <span className="text-[10px] text-white/60 font-mono">
                {order.screen} • Seat {order.seat}
              </span>
            </div>
            <p className="text-[11px] text-amber-300/90 truncate mt-0.5">
              {statusLabel}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onOpenTracking}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[#dedad2] text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <span>Live status</span>
            <ArrowRight size={13} />
          </button>
          {(
            <button
              onClick={onDismiss}
              className="p-1 text-white/40 hover:text-white cursor-pointer"
              title="Hide order tracking"
              aria-label="Hide order tracking reminders"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FindOrderModal({
  isOpen,
  onClose,
  onSelectOrder,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectOrder: (order: SavedOrder) => void;
}) {
  const [phone, setPhone] = useState("");
  const [lookupOrderNumber, setLookupOrderNumber] = useState("");

  const cleanDigits = phone.replace(/\D/g, "");
  const normalizedPhone = cleanDigits.length === 12 && cleanDigits.startsWith("91") ? cleanDigits.slice(2) : cleanDigits;
  const isSearchable = normalizedPhone.length === 10 && lookupOrderNumber.trim().length >= 3;

  const lookupQuery = trpc.order.lookupByPhone.useQuery(
    { phone: normalizedPhone, orderNumber: lookupOrderNumber.trim() },
    { enabled: isOpen && isSearchable, retry: false }
  );

  if (!isOpen) return null;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div
        className="w-full max-w-md m-4 bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 shadow-2xl text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-[#dedad2]">Track Your Cinema Order</h3>
            <p className="text-xs text-[#85827b] mt-0.5">
              Enter your order number and mobile number to check its status.
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-white/50 hover:text-white cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="mb-4">
          <label className="text-xs text-white/70 block mb-1.5" htmlFor="lookup-order-number">Order number</label>
          <input id="lookup-order-number" className="mb-3 w-full rounded-lg border border-white/20 bg-transparent p-2 text-white" value={lookupOrderNumber} onChange={e => setLookupOrderNumber(e.target.value.toUpperCase())} placeholder="CB-..." maxLength={32} />
          <label className="text-xs text-white/70 block mb-1.5">Indian Mobile Number</label>
          <div className="phone-input">
            <span>+91</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98765 43210"
              inputMode="numeric"
              maxLength={14}
              autoFocus
            />
          </div>
          {normalizedPhone.length > 0 && normalizedPhone.length < 10 && (
            <p className="text-[11px] text-amber-400/80 mt-1.5 flex items-center gap-1">
              Enter all 10 digits ({normalizedPhone.length}/10 digits)
            </p>
          )}
        </div>

        {lookupQuery.isLoading && (
          <div className="py-6 text-center text-xs text-white/50">
            <span className="button-spinner mr-2" /> Searching orders...
          </div>
        )}

        {lookupQuery.data && lookupQuery.data.length > 0 && (
          <div className="space-y-2 mb-4">
            <p className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
              Found Active Orders
            </p>
            {lookupQuery.data.map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  onSelectOrder({
                    orderNumber: item.orderNumber,
                    phoneLast4: item.phoneLast4,
                    screen: item.screen,
                    seat: item.seat,
                    customerName: item.customerName,
                    totalPaise: item.totalPaise,
                    createdAt: item.createdAt,
                  });
                  onClose();
                }}
                className="p-3 rounded-xl bg-white/[0.04] border border-white/10 hover:border-amber-500/50 hover:bg-white/[0.07] transition-all cursor-pointer flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <strong className="text-sm text-[#dedad2]">#{item.orderNumber}</strong>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono">
                      {item.status}
                    </span>
                  </div>
                  <p className="text-xs text-[#85827b] mt-0.5">
                    {item.screen} • Seat {item.seat} • ₹{(item.totalPaise / 100).toFixed(0)}
                  </p>
                </div>
                <span className="text-xs text-amber-400 flex items-center gap-1 font-medium">
                  Track <ArrowRight size={13} />
                </span>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("menu");
  const [active, setActive] = useState<Category>("Popular");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accepted, setAccepted] = useState(policies.map(() => false));
  const [activeOrder, setActiveOrder] = useState<SavedOrder | null>(null);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const checkoutBusy = useRef(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const checkoutRequest = useRef<{ fingerprint: string; key: string } | null>(null);

  const params = new URLSearchParams(window.location.search);
  const sessionToken = params.get("session") || "";
  const seatToken = params.get("seatToken") || "";
  const seatSession = trpc.catalog.seatSession.useQuery({ token: seatToken || "invalid-seat-token-value" }, { enabled: Boolean(seatToken), refetchInterval: 15000 });
  const paramSeat = seatToken ? seatSession.data?.seat || "" : params.get("seat")?.trim().toUpperCase() || "";
  const paramScreen = params.get("screen")?.trim() || "";

  useEffect(() => {
    // 1. Direct query param tracking: ?track=CB-xxxx&phone=yyyy
    const trackParam = params.get("track");
    const phoneParam = params.get("phone");
    if (trackParam) {
      const orderData: SavedOrder = {
        orderNumber: trackParam,
        phoneLast4: phoneParam ? phoneParam.slice(-4) : "",
        screen: paramScreen || "Auditorium",
        seat: paramSeat || "Seat",
        createdAt: new Date().toISOString(),
      };
      setActiveOrder(orderData);
      setBannerDismissed(isOrderDismissed(orderData.orderNumber));
      saveActiveOrder(orderData);
      setView("tracking");
      return;
    }

    // 2. Restore active order from localStorage
    const saved = getActiveOrder();
    if (saved) {
      setActiveOrder(saved);
      if (window.location.pathname === "/track") {
        setView("tracking");
      }
    } else if (window.location.pathname === "/track") {
      setLookupOpen(true);
    }
  }, []);
  const session = trpc.catalog.session.useQuery({ token: sessionToken || "invalid-session-token" }, { enabled: sessionToken.length > 0 });
  const showtimeId = seatToken ? seatSession.data?.show?.id ?? 0 : session.data?.show.id ?? (Number(params.get("showtimeId")) || 0);
  const orderingWindow = trpc.catalog.orderingWindow.useQuery({ showtimeId }, { enabled: showtimeId > 0, refetchInterval: 15000 });
  const orderingOpen = (!seatToken || Boolean(seatSession.data?.show)) && (!sessionToken || Boolean(session.data)) && (showtimeId > 0
    ? orderingWindow.data?.orderingEnabled === true
    : import.meta.env.DEV);

  // Real backend menu catalog sync
  const catalogQuery = trpc.catalog.menu.useQuery();
  const createOrderMutation = trpc.order.create.useMutation();
  const confirmPaymentMutation = trpc.order.confirmPayment.useMutation();

  const menuList: MenuItem[] = useMemo(() => {
    if (!catalogQuery.data || catalogQuery.data.length === 0) {
      return defaultMenu;
    }
    return catalogQuery.data.map((item) => {
      const match = defaultMenu.find((dm) => dm.id === item.id);
      return {
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.pricePaise,
        category: (item.category as any) || "Combos",
        tag: match?.tag,
        tone: match?.tone || "bg-[#181310] text-[#d48753] border border-[#261c14]",
        icon: match?.icon || "combo",
        available: item.available,
      };
    });
  }, [catalogQuery.data]);

  const visibleItems = useMemo(
    () => (active === "Popular" ? menuList.slice(0, 4) : menuList.filter((item) => item.category === active)),
    [active, menuList]
  );

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  function addItem(item: MenuItem) {
    if (item.available === false) {
      toast.error(`${item.name} is currently sold out`);
      return;
    }
    setCart((current) =>
      current.some((cartItem) => cartItem.id === item.id)
        ? current.map((cartItem) => (cartItem.id === item.id ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem))
        : [...current, { ...item, quantity: 1 }]
    );
    toast.success(`${item.name} added`, { duration: 1500 });
  }

  function changeItem(id: string, delta: number) {
    setCart((current) =>
      current.flatMap((item) => (item.id === id ? (item.quantity + delta > 0 ? [{ ...item, quantity: item.quantity + delta }] : []) : [item]))
    );
  }

  function startCheckout() {
    toast.dismiss();
    if (!orderingOpen) {
      toast.error("Ordering is currently closed", {
        description: "Ordering opens 15 minutes after the show starts and closes 30 minutes before it ends.",
      });
      return;
    }
    setDrawerOpen(false);
    setView("checkout");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function finalizeOrderSuccess(order: { id: string; orderNumber: string; totalPaise: number; screen: string; seat: string }, customerName: string, phone: string) {
    const phoneClean = phone.replace(/\D/g, "");
    const phoneLast4 = phoneClean.slice(-4);

    const newActiveOrder: SavedOrder = {
      orderNumber: order.orderNumber,
      phoneLast4,
      screen: order.screen,
      seat: order.seat,
      customerName,
      totalPaise: order.totalPaise,
      createdAt: new Date().toISOString(),
    };

    saveActiveOrder(newActiveOrder);
    setActiveOrder(newActiveOrder);
    setBannerDismissed(false);

    setCart([]);
    setView("tracking");
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.success("Order confirmed & sent to kitchen!", {
      description: `Order #${order.orderNumber} is now being prepared.`,
    });
  }

  async function handleCompletePayment(details: { name: string; phone: string; seat: string; screen: string }) {
    if (checkoutBusy.current) return;
    checkoutBusy.current = true;
    setPaymentBusy(true);
    const releaseCheckout = () => { checkoutBusy.current = false; setPaymentBusy(false); };
    try {
      const orderItems = cart.map((item) => ({
        itemId: item.id,
        quantity: item.quantity,
      }));
      const fingerprint = JSON.stringify({ details, orderItems, showtimeId, sessionToken, seatToken });
      if (checkoutRequest.current?.fingerprint !== fingerprint) {
        checkoutRequest.current = { fingerprint, key: crypto.randomUUID() };
      }

      // Contact the payment provider only after the user initiates checkout.
      await loadRazorpay();
      // 1. Create order in PENDING payment status on server
      const res = await createOrderMutation.mutateAsync({
        screen: details.screen,
        seat: details.seat,
        customerName: details.name,
        phone: details.phone,
        items: orderItems,
        showtimeId: showtimeId > 0 ? showtimeId : undefined,
        sessionToken: sessionToken || undefined,
        seatToken: seatToken || undefined,
        idempotencyKey: checkoutRequest.current.key,
        consent: checkoutConsentSchema.parse({ policyVersion: POLICY_VERSION, terms: accepted[0], privacy: accepted[1], refund: accepted[2], cutoff: accepted[3] }),
      });
      // Persist tracking before opening the gateway; the webhook can recover a
      // captured payment even if this browser closes or loses connectivity.
      saveActiveOrder({ orderNumber: res.order.orderNumber, phoneLast4: details.phone.slice(-4), screen: res.order.screen, seat: res.order.seat, customerName: details.name, totalPaise: res.order.totalPaise, createdAt: new Date().toISOString() });

      // 2. If Razorpay Live credentials are configured and Razorpay SDK is loaded, open popup
      if (res.order.paymentStatus === "CONFIRMED") {
        finalizeOrderSuccess(res.order, details.name, details.phone);
        checkoutRequest.current = null;
        releaseCheckout();
        return;
      }
      const hasRazorpay = typeof (window as any).Razorpay === "function";
      if (!res.isLiveGateway || !hasRazorpay || !res.paymentIntent?.providerOrderId) {
        throw new Error("Secure checkout could not load. Please reload and try again.");
      }
      if (res.isLiveGateway && hasRazorpay && res.paymentIntent?.providerOrderId) {
        const options = {
          key: res.paymentIntent.keyId,
          amount: res.paymentIntent.amountPaise,
          currency: "INR",
          name: "CineBites Cinema",
          description: `Order #${res.order.orderNumber} (${details.screen} Seat ${details.seat})`,
          order_id: res.paymentIntent.providerOrderId,
          prefill: {
            name: details.name,
            contact: details.phone,
          },
          theme: {
            color: "#d97706",
          },
          handler: async (response: any) => {
            try {
              // 3. Verify cryptographic HMAC signature on server
              await confirmPaymentMutation.mutateAsync({
                orderId: res.order.id,
                providerOrderId: response.razorpay_order_id || res.paymentIntent.providerOrderId,
                providerPaymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              });

              finalizeOrderSuccess(res.order, details.name, details.phone);
              checkoutRequest.current = null;
            } catch (verifErr: any) {
              toast.error("Payment verification failed", {
                description: verifErr.message || "Untrusted payment signature.",
              });
            } finally { releaseCheckout(); }
          },
          modal: {
            ondismiss: () => {
              releaseCheckout();
              toast.error("Payment window closed", {
                description: "Payment confirmation is pending. If money was deducted, keep your payment reference and contact support.",
                action: { label: "Payment help", onClick: () => window.open("/payment-failed", "_blank", "noopener,noreferrer") },
              });
            },
          },
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.open();
        return;
      }

    } catch (err: any) {
      releaseCheckout();
      let friendlyMessage = "An error occurred while creating your order.";
      try {
        const parsed = JSON.parse(err.message);
        if (Array.isArray(parsed) && parsed[0]?.message) {
          friendlyMessage = parsed[0].message;
        } else if (parsed && typeof parsed.message === "string") {
          friendlyMessage = parsed.message;
        } else {
          friendlyMessage = err.message;
        }
      } catch {
        friendlyMessage = err.message || friendlyMessage;
      }

      toast.error("Failed to place order", {
        description: friendlyMessage,
      });
    }
  }

  const detectedScreen = seatSession.data?.screenName || session.data?.screenName || orderingWindow.data?.screenName || paramScreen || "Maharaja Screen 01";
  const detectedMovie = seatSession.data?.show?.movieTitle || session.data?.show.movieTitle;

  return (
    <div className="app-shell">
      <Header
        view={view}
        onBack={() => setView("menu")}
        cartCount={cartCount}
        onCart={() => setDrawerOpen(true)}
        activeOrder={bannerDismissed ? null : activeOrder}
        onOpenTracking={() => {
          setView("tracking");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onOpenLookup={() => setLookupOpen(true)}
      />
      {view === "menu" && (
        <>
          <CinemaContext screen={detectedScreen} seat={paramSeat} showTitle={detectedMovie} />
          <Hero />
          <main className="menu-main" id="menu">
            <div className="menu-header">
              <div>
                <p className="eyebrow">The good part</p>
                <h2>Order for the show</h2>
              </div>
              <div className="availability">
                <span className="availability-dot" />{" "}
                {showtimeId && orderingWindow.data
                  ? orderingWindow.data.paused ? "New orders paused by cinema"
                    : !orderingWindow.data.sourceFresh ? "Schedule needs refresh"
                    : orderingWindow.data.state === "OPEN"
                    ? "Ordering open"
                    : orderingWindow.data.state === "COOL_DOWN"
                    ? "15 min kitchen break"
                    : orderingWindow.data.state === "CUTOFF"
                    ? "Ordering closed"
                    : orderingWindow.data.state === "FINISHED"
                    ? "This show has finished"
                    : "Ordering starts 15 min after showtime"
                  : orderingOpen ? "Ordering open" : seatToken ? seatSession.isError ? "Could not load the cinema schedule. Please retry." : seatSession.isLoading ? "Checking current show…" : !seatSession.data ? "Seat QR is invalid or inactive" : "No current confirmed show. Ordering is unavailable." : "Scan your seat QR to order"}
              </div>
            </div>
            <CategoryTabs active={active} setActive={setActive} />
            <div className="menu-grid">
              {visibleItems.map((item) => (
                <MenuCard
                  key={item.id}
                  item={item}
                  cart={cart.find((cartItem) => cartItem.id === item.id)}
                  onAdd={() => addItem(item)}
                  onChange={(delta) => changeItem(item.id, delta)}
                  orderingOpen={orderingOpen}
                />
              ))}
            </div>
            <section className="service-strip" id="how-it-works">
              <div className="service-icon">
                <Utensils size={18} />
              </div>
              <div>
                <strong>Made fresh. Delivered quietly.</strong>
                <p>Order online, keep your eyes on the film. We&apos;ll take care of the rest.</p>
              </div>
              <ArrowRight className="hidden text-[#8f8d87] sm:block" size={18} />
            </section>
          </main>
          <footer className="site-footer">
            <BrandMark />
            <div className="footer-copy">
              <span>CineBites Maharaja Cinema • Instant In-Seat Cinema Service</span>
              <a href="/support">Need help? Cinema support information</a>
            </div>
            <span className="footer-safe">
              <ShieldCheck size={13} /> Privacy-safe by design
            </span>
          </footer>
        </>
      )}
      {view === "checkout" && (
        <>
        <CinemaContext screen={detectedScreen} seat={paramSeat} showTitle={detectedMovie} />
        <Checkout
          key={`${detectedScreen}:${paramSeat}:${showtimeId}`}
          cart={cart}
          total={total}
          accepted={accepted}
          setAccepted={setAccepted}
          initialScreen={detectedScreen}
          initialSeat={paramSeat}
          isSubmitting={paymentBusy || createOrderMutation.isPending}
          onBack={() => setView("menu")}
          onPaid={handleCompletePayment}
        />
        </>
      )}
      {view === "tracking" && activeOrder && (
        <Tracking
          onBack={() => setView("menu")}
          orderNumber={activeOrder.orderNumber}
          phoneLast4={activeOrder.phoneLast4}
          screen={activeOrder.screen}
          seat={activeOrder.seat}
        />
      )}
      {drawerOpen && (
        <CartDrawer
          cart={cart}
          total={total}
          onChange={changeItem}
          onClose={() => setDrawerOpen(false)}
          onCheckout={startCheckout}
        />
      )}
      {view === "menu" && activeOrder && !bannerDismissed && (
        <ActiveOrderBanner
          order={activeOrder}
          onOpenTracking={() => {
            setView("tracking");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onDismiss={() => {
            dismissOrderTracking(activeOrder.orderNumber);
            setBannerDismissed(true);
            setActiveOrder(null);
          }}
        />
      )}
      <FindOrderModal
        isOpen={lookupOpen}
        onClose={() => setLookupOpen(false)}
        onSelectOrder={(selected) => {
          setActiveOrder(selected);
          // A manual lookup opens this view only, without restoring reminders.
          setBannerDismissed(true);
          setView("tracking");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
    </div>
  );
}
