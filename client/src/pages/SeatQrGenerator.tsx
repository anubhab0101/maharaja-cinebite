import { useState, useMemo, useEffect } from "react";
import { Download, Printer, QrCode, Search, Copy, Check, RefreshCw, ExternalLink } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";

export interface SeatQrItem {
  id: string;
  screen: string;
  seat: string;
  url: string;
  qrDataUrl: string;
}

const AUDI_PRESETS = [
  "Audi 1 (Dolby Atmos)",
  "Audi 2 (4K Christie)",
  "Audi 3",
  "Audi 4",
  "Screen 01",
  "VIP Lounge",
];

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export default function SeatQrGenerator() {
  const [screen, setScreen] = useState("Audi 1 (Dolby Atmos)");
  const [customScreen, setCustomScreen] = useState("");
  const [activeScreenName, setActiveScreenName] = useState("Audi 1");

  const [mode, setMode] = useState<"grid" | "single" | "custom">("grid");
  const [startRow, setStartRow] = useState("A");
  const [endRow, setEndRow] = useState("N");
  const [startNum, setStartNum] = useState(1);
  const [endNum, setEndNum] = useState(24);
  const [skipI, setSkipI] = useState(true);

  const [singleRow, setSingleRow] = useState("F");
  const [customSeatsText, setCustomSeatsText] = useState("A1, A2, A3, B1, B2, B3, C1, C2, C3");

  const [cinemaName, setCinemaName] = useState("Maharaja Cinema");
  const [stickerDensity, setStickerDensity] = useState<"standard" | "compact" | "large">("standard");
  const [searchQuery, setSearchQuery] = useState("");
  const [generating, setGenerating] = useState(false);
  const [qrItems, setQrItems] = useState<SeatQrItem[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (customScreen.trim()) {
      setActiveScreenName(customScreen.trim());
    } else {
      setActiveScreenName(screen);
    }
  }, [screen, customScreen]);

  const computedSeats = useMemo(() => {
    const seats: string[] = [];

    if (mode === "grid") {
      const startIndex = Math.max(0, ALPHABET.indexOf(startRow.toUpperCase()));
      const endIndex = Math.max(startIndex, ALPHABET.indexOf(endRow.toUpperCase()));
      const rows = ALPHABET.slice(startIndex, endIndex + 1);

      for (const r of rows) {
        if (skipI && r === "I") continue;
        for (let num = startNum; num <= endNum; num++) {
          seats.push(`${r}${num}`);
        }
      }
    } else if (mode === "single") {
      const r = singleRow.toUpperCase() || "A";
      for (let num = startNum; num <= endNum; num++) {
        seats.push(`${r}${num}`);
      }
    } else {
      const parsed = customSeatsText
        .split(/[,\s\n]+/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0);
      seats.push(...Array.from(new Set(parsed)));
    }

    return seats;
  }, [mode, startRow, endRow, startNum, endNum, skipI, singleRow, customSeatsText]);

  async function generateQrs() {
    setGenerating(true);
    const origin = window.location.origin;
    const items: SeatQrItem[] = [];

    try {
      for (const seat of computedSeats) {
        const url = `${origin}/?screen=${encodeURIComponent(activeScreenName)}&seat=${encodeURIComponent(seat)}`;
        const qrDataUrl = await QRCode.toDataURL(url, {
          width: 320,
          margin: 1,
          errorCorrectionLevel: "M",
          color: {
            dark: "#000000",
            light: "#ffffff",
          },
        });
        items.push({
          id: `${activeScreenName}_${seat}`,
          screen: activeScreenName,
          seat,
          url,
          qrDataUrl,
        });
      }

      setQrItems(items);
      toast.success(`${items.length} seat QR stickers generated successfully!`);
    } catch (err: any) {
      toast.error("QR generation failed: " + (err?.message || "Unknown error"));
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    void generateQrs();
  }, [activeScreenName, computedSeats.length]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return qrItems;
    const q = searchQuery.trim().toLowerCase();
    return qrItems.filter(
      (item) => item.seat.toLowerCase().includes(q) || item.screen.toLowerCase().includes(q)
    );
  }, [qrItems, searchQuery]);

  async function handleCopy(item: SeatQrItem) {
    await navigator.clipboard.writeText(item.url);
    setCopiedId(item.id);
    toast.success(`Link for Seat ${item.seat} copied!`);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleDownloadPng(item: SeatQrItem) {
    const a = document.createElement("a");
    a.href = item.qrDataUrl;
    a.download = `${item.screen}_Seat_${item.seat}_QR.png`;
    a.click();
    toast.success(`Downloaded QR for Seat ${item.seat}`);
  }

  function handleDownloadCsv() {
    if (!qrItems.length) return;
    const header = "Screen,Seat,URL\n";
    const rows = qrItems.map((i) => `"${i.screen}","${i.seat}","${i.url}"`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${activeScreenName.replace(/\s+/g, "_")}_Seat_QRs.csv`;
    a.click();
    toast.success("Downloaded Seat QR list as CSV");
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-6">
      {/* Controls Card - Hidden during Print */}
      <div className="print:hidden rounded-2xl border border-white/10 bg-[#0d0d0c] p-6 shadow-xl space-y-6 text-[#dedad2]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[#d46b38]">
              <QrCode size={16} /> Bulk Armrest Stickers
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-[#dedad2] mt-1">
              Cinema Seat QR Code Generator
            </h2>
            <p className="text-sm text-[#85827b] mt-1">
              Generate instant scannable QR stickers per seat. Scanning instantly locks customer order to that exact Audi & Seat.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handlePrint}
              disabled={qrItems.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-[#d46b38] px-5 py-2.5 text-sm font-semibold text-[#160b06] shadow-lg shadow-[#d46b38]/20 transition hover:bg-[#e57e4c] active:scale-95 disabled:opacity-50"
            >
              <Printer size={16} /> Print Sticker Sheets ({qrItems.length})
            </button>
            <button
              onClick={handleDownloadCsv}
              disabled={qrItems.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#141414] px-4 py-2.5 text-sm font-medium text-[#dedad2] transition hover:bg-[#202020] disabled:opacity-50"
            >
              <Download size={15} /> Download CSV
            </button>
          </div>
        </div>

        {/* Configuration Grid */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Step 1: Screen */}
          <div className="space-y-3">
            <label className="block text-xs font-mono uppercase tracking-wider text-[#85827b]">
              Step 1: Select Screen / Audi
            </label>
            <div className="flex flex-wrap gap-2">
              {AUDI_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setScreen(p);
                    setCustomScreen("");
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs transition ${
                    screen === p && !customScreen
                      ? "bg-[#d46b38] text-[#160b06] font-semibold"
                      : "border border-white/10 bg-[#141414] text-[#85827b] hover:text-[#dedad2]"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={customScreen}
              onChange={(e) => setCustomScreen(e.target.value)}
              placeholder="Or type custom screen (e.g. Audi 5 IMAX)"
              className="w-full rounded-xl border border-white/10 bg-[#050505] px-3 py-2 text-sm text-[#dedad2] outline-none focus:border-[#d46b38]"
            />
          </div>

          {/* Step 2: Seat Range */}
          <div className="space-y-3">
            <label className="block text-xs font-mono uppercase tracking-wider text-[#85827b]">
              Step 2: Seat Layout Mode
            </label>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#050505] p-1 border border-white/10">
              <button
                type="button"
                onClick={() => setMode("grid")}
                className={`rounded-lg py-1 text-xs font-medium transition ${
                  mode === "grid" ? "bg-[#d46b38] text-[#160b06] font-semibold" : "text-[#85827b]"
                }`}
              >
                Audi Grid (A-N)
              </button>
              <button
                type="button"
                onClick={() => setMode("single")}
                className={`rounded-lg py-1 text-xs font-medium transition ${
                  mode === "single" ? "bg-[#d46b38] text-[#160b06] font-semibold" : "text-[#85827b]"
                }`}
              >
                Single Row
              </button>
              <button
                type="button"
                onClick={() => setMode("custom")}
                className={`rounded-lg py-1 text-xs font-medium transition ${
                  mode === "custom" ? "bg-[#d46b38] text-[#160b06] font-semibold" : "text-[#85827b]"
                }`}
              >
                Custom List
              </button>
            </div>

            {mode === "grid" && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[11px] text-[#85827b]">From Row</span>
                    <select
                      value={startRow}
                      onChange={(e) => setStartRow(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-[#050505] p-2 text-xs text-[#dedad2] outline-none"
                    >
                      {ALPHABET.map((r) => (
                        <option key={r} value={r}>
                          Row {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#85827b]">To Row</span>
                    <select
                      value={endRow}
                      onChange={(e) => setEndRow(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-[#050505] p-2 text-xs text-[#dedad2] outline-none"
                    >
                      {ALPHABET.map((r) => (
                        <option key={r} value={r}>
                          Row {r}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[11px] text-[#85827b]">Start Seat #</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={startNum}
                      onChange={(e) => setStartNum(Number(e.target.value))}
                      className="w-full rounded-lg border border-white/10 bg-[#050505] p-2 text-xs text-[#dedad2] outline-none"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-[#85827b]">End Seat #</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={endNum}
                      onChange={(e) => setEndNum(Number(e.target.value))}
                      className="w-full rounded-lg border border-white/10 bg-[#050505] p-2 text-xs text-[#dedad2] outline-none"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs text-[#85827b] pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipI}
                    onChange={(e) => setSkipI(e.target.checked)}
                    className="accent-[#d46b38]"
                  />
                  <span>Skip Row &quot;I&quot; (recommended for cinema seating)</span>
                </label>
              </div>
            )}

            {mode === "single" && (
              <div className="space-y-2">
                <div>
                  <span className="text-[11px] text-[#85827b]">Select Row Letter</span>
                  <select
                    value={singleRow}
                    onChange={(e) => setSingleRow(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-[#050505] p-2 text-xs text-[#dedad2] outline-none"
                  >
                    {ALPHABET.map((r) => (
                      <option key={r} value={r}>
                        Row {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[11px] text-[#85827b]">From Seat</span>
                    <input
                      type="number"
                      min={1}
                      value={startNum}
                      onChange={(e) => setStartNum(Number(e.target.value))}
                      className="w-full rounded-lg border border-white/10 bg-[#050505] p-2 text-xs text-[#dedad2] outline-none"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-[#85827b]">To Seat</span>
                    <input
                      type="number"
                      min={1}
                      value={endNum}
                      onChange={(e) => setEndNum(Number(e.target.value))}
                      className="w-full rounded-lg border border-white/10 bg-[#050505] p-2 text-xs text-[#dedad2] outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {mode === "custom" && (
              <div className="space-y-1">
                <span className="text-[11px] text-[#85827b]">Comma-separated seats:</span>
                <textarea
                  rows={3}
                  value={customSeatsText}
                  onChange={(e) => setCustomSeatsText(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#050505] p-2 text-xs text-[#dedad2] font-mono outline-none"
                  placeholder="A1, A2, A3, VIP-1, VIP-2"
                />
              </div>
            )}
          </div>

          {/* Step 3: Sticker Appearance & Density */}
          <div className="space-y-3 flex flex-col justify-between">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-[#85827b]">
                Step 3: Print Sheet Layout
              </label>
              <div className="mt-2 space-y-2">
                <div>
                  <span className="text-[11px] text-[#85827b]">Theatre / Brand Header</span>
                  <input
                    type="text"
                    value={cinemaName}
                    onChange={(e) => setCinemaName(e.target.value)}
                    placeholder="Maharaja Cinema"
                    className="w-full rounded-lg border border-white/10 bg-[#050505] p-2 text-xs text-[#dedad2] outline-none"
                  />
                </div>

                <div>
                  <span className="text-[11px] text-[#85827b]">Sticker Sheet Density</span>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#050505] p-1 border border-white/10 mt-1">
                    <button
                      type="button"
                      onClick={() => setStickerDensity("standard")}
                      className={`rounded-lg py-1 text-xs transition ${
                        stickerDensity === "standard"
                          ? "bg-[#d46b38] text-[#160b06] font-semibold"
                          : "text-[#85827b]"
                      }`}
                    >
                      12 / Sheet
                    </button>
                    <button
                      type="button"
                      onClick={() => setStickerDensity("compact")}
                      className={`rounded-lg py-1 text-xs transition ${
                        stickerDensity === "compact"
                          ? "bg-[#d46b38] text-[#160b06] font-semibold"
                          : "text-[#85827b]"
                      }`}
                    >
                      20 / Sheet
                    </button>
                    <button
                      type="button"
                      onClick={() => setStickerDensity("large")}
                      className={`rounded-lg py-1 text-xs transition ${
                        stickerDensity === "large"
                          ? "bg-[#d46b38] text-[#160b06] font-semibold"
                          : "text-[#85827b]"
                      }`}
                    >
                      6 / Sheet
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={generateQrs}
              disabled={generating || computedSeats.length === 0}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#d46b38] py-3 text-sm font-semibold text-[#160b06] shadow-lg shadow-[#d46b38]/20 transition hover:bg-[#e57e4c] active:scale-[0.98] disabled:opacity-50 mt-4"
            >
              <RefreshCw size={16} className={generating ? "animate-spin" : ""} />
              {generating ? "Generating QRs..." : `Generate ${computedSeats.length} QR Stickers`}
            </button>
          </div>
        </div>

        {/* Live Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-white/5">
          <div className="relative w-full max-w-xs">
            <Search size={15} className="absolute left-3 top-3 text-[#85827b]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Quick filter seat (e.g. F12)..."
              className="w-full rounded-xl border border-white/10 bg-[#050505] pl-9 pr-3 py-2 text-xs text-[#dedad2] outline-none focus:border-[#d46b38]"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-[#85827b]">
            <span>Showing <strong>{filteredItems.length}</strong> of {qrItems.length} stickers</span>
            <span className="h-3 w-px bg-white/10" />
            <span>Target Screen: <code className="text-[#d46b38]">{activeScreenName}</code></span>
          </div>
        </div>
      </div>

      {/* STICKER GRID - Both UI View & Print Sheets */}
      <div
        className={`grid gap-4 print:gap-2 print:m-0 ${
          stickerDensity === "compact"
            ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 print:grid-cols-4"
            : stickerDensity === "large"
            ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 print:grid-cols-2"
            : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 print:grid-cols-3"
        }`}
      >
        {filteredItems.map((item) => (
          <article
            key={item.id}
            className="group relative rounded-2xl border border-white/15 bg-white text-black p-3.5 shadow-md flex flex-col items-center justify-between text-center transition hover:shadow-xl print:border-2 print:border-black print:rounded-xl print:p-2.5 print:break-inside-avoid"
          >
            {/* Top Brand & Screen */}
            <div className="w-full border-b border-black/15 pb-1.5 mb-1.5">
              <p className="text-[9px] font-mono font-bold tracking-wider text-black/75 uppercase">
                {cinemaName}
              </p>
              <p className="text-[11px] font-semibold text-[#b85020] uppercase tracking-wide">
                {item.screen}
              </p>
            </div>

            {/* SEAT NUMBER (Prominent for Dim Auditorium Lighting) */}
            <div className="my-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-black/60 block -mb-1">
                SEAT
              </span>
              <strong className="text-3xl font-extrabold tracking-tight text-black font-sans">
                {item.seat}
              </strong>
            </div>

            {/* High-Contrast QR Code */}
            <div className="p-1 bg-white rounded-lg border border-black/10 my-1">
              <img
                src={item.qrDataUrl}
                alt={`QR for ${item.screen} Seat ${item.seat}`}
                className="h-36 w-36 object-contain print:h-28 print:w-28"
              />
            </div>

            {/* Bottom Instructions */}
            <div className="w-full border-t border-black/15 pt-1.5 mt-1.5">
              <p className="text-[9px] font-bold text-black leading-tight">
                Scan to Order Food to Your Seat
              </p>
              <p className="text-[8px] text-black/60 font-mono mt-0.5">
                Instant Delivery • Cashless UPI
              </p>
            </div>

            {/* Hover Actions in UI View (Hidden during Print) */}
            <div className="print:hidden absolute inset-0 rounded-2xl bg-black/85 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-2 p-3 backdrop-blur-sm">
              <strong className="text-white font-mono text-sm">{item.seat}</strong>
              <div className="flex flex-col gap-2 w-full max-w-[140px]">
                <button
                  type="button"
                  onClick={() => handleCopy(item)}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs py-1.5 font-medium transition"
                >
                  {copiedId === item.id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  {copiedId === item.id ? "Copied" : "Copy Link"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadPng(item)}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-[#d46b38] hover:bg-[#e57e4c] text-[#160b06] text-xs py-1.5 font-semibold transition"
                >
                  <Download size={13} /> Download PNG
                </button>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1 text-[10px] text-white/70 hover:text-white underline pt-1"
                >
                  Test Link <ExternalLink size={10} />
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>

      {filteredItems.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-[#0d0d0c] p-12 text-center text-[#85827b]">
          <QrCode size={36} className="mx-auto text-[#d46b38]/50 mb-3" />
          <p className="text-base font-semibold text-[#dedad2]">No seat stickers match your filter</p>
          <p className="text-xs mt-1">Try adjusting your search query or row range.</p>
        </div>
      )}
    </div>
  );
}
