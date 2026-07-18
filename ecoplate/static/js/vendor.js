// vendor.js — EcoPlate Vendor Portal

const CAPTIONS = [
  "Analyzing historical footfall...",
  "Checking local weather patterns...",
  "Calculating dynamic price curve...",
  "Scoring spoilage risk..."
];

let captionTimer = null;
let captionIdx   = 0;
let lastResult   = null;   // stores last /api/calculate response + form data

// ─── STAT POLLING ──────────────────────────────────────────────────────────────
async function fetchStats() {
  try {
    const r = await fetch("/api/stats");
    if (!r.ok) return;
    const s = await r.json();
    document.getElementById("stat-revenue").textContent =
      "\u20B9" + Math.round(s.revenue_recovered).toLocaleString("en-IN");
    document.getElementById("stat-meals").textContent = s.meals_saved;
    document.getElementById("stat-co2").textContent   = s.co2_avoided.toFixed(1) + " kg";
  } catch (_) {}
}
fetchStats();
setInterval(fetchStats, 5000);

// ─── SPARKLINE ─────────────────────────────────────────────────────────────────
async function refreshSparkline() {
  try {
    const r = await fetch("/api/sales");
    if (!r.ok) return;
    const sales = await r.json();

    // Last 5 by published_at
    const recent = [...sales]
      .sort((a, b) => b.published_at - a.published_at)
      .slice(0, 5)
      .reverse();

    const wrap   = document.getElementById("sparkline");
    const labels = document.getElementById("spark-labels");

    if (!recent.length) {
      wrap.innerHTML = '<div style="font-size:.75rem;color:rgba(255,255,255,.25);text-align:center;width:100%">No listings yet</div>';
      labels.innerHTML = "";
      return;
    }

    const maxD = Math.max(...recent.map(s => s.discount_pct));
    wrap.innerHTML   = "";
    labels.innerHTML = "";

    recent.forEach(s => {
      const bar = document.createElement("div");
      bar.className = "sparkbar";
      bar.style.height = ((s.discount_pct / maxD) * 100) + "%";
      bar.setAttribute("data-tip", s.discount_pct.toFixed(1) + "% off");
      bar.title = s.item + ": " + s.discount_pct.toFixed(1) + "% off";
      wrap.appendChild(bar);

      const lbl = document.createElement("div");
      lbl.style.cssText = "flex:1;text-align:center;font-size:.65rem;color:rgba(255,255,255,.3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      lbl.textContent = s.discount_pct.toFixed(0) + "%";
      labels.appendChild(lbl);
    });
  } catch (_) {}
}
refreshSparkline();

// ─── SKELETON ──────────────────────────────────────────────────────────────────
function showSkeleton() {
  document.getElementById("form-section").style.display    = "none";
  document.getElementById("result-section").style.display  = "none";
  document.getElementById("skeleton-section").style.display = "";
  captionIdx = 0;
  document.getElementById("skel-caption").textContent = CAPTIONS[0];
  captionTimer = setInterval(() => {
    captionIdx = (captionIdx + 1) % CAPTIONS.length;
    document.getElementById("skel-caption").textContent = CAPTIONS[captionIdx];
  }, 625);
}

function hideSkeleton() {
  clearInterval(captionTimer);
  document.getElementById("skeleton-section").style.display = "none";
}

// ─── FORM SUBMIT ───────────────────────────────────────────────────────────────
document.getElementById("pricing-form").addEventListener("submit", async e => {
  e.preventDefault();

  const item   = document.getElementById("f-item").value.trim();
  const vendor = document.getElementById("f-vendor").value.trim();
  const qty    = parseInt(document.getElementById("f-qty").value, 10);
  const price  = parseFloat(document.getElementById("f-price").value);
  const hours  = parseFloat(document.getElementById("f-hours").value);
  const peri   = document.getElementById("f-peri").value;

  if (!item)               { toast("⚠️", "Item name is required.", true);          return; }
  if (!vendor)             { toast("⚠️", "Restaurant name is required.", true);    return; }
  if (!qty   || qty  <= 0) { toast("⚠️", "Enter a valid quantity.", true);         return; }
  if (!price || price <= 0){ toast("⚠️", "Enter a valid original price.", true);   return; }

  showSkeleton();

  try {
    await delay(2500);   // deliberate 2.5 s loading theatre

    const res  = await fetch("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item, vendor, qty, original_price: price, hours_left: hours, perishability: peri })
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      hideSkeleton();
      document.getElementById("form-section").style.display = "";
      toast("❌", data.error || "Calculation failed.", true);
      return;
    }

    lastResult = { item, vendor, qty, price, hours, peri, ...data };
    showResult(data, price);

  } catch (_) {
    hideSkeleton();
    document.getElementById("form-section").style.display = "";
    toast("❌", "Network error. Check your connection.", true);
  }
});

// ─── SHOW RESULT ───────────────────────────────────────────────────────────────
function showResult(data, origPrice) {
  hideSkeleton();
  document.getElementById("res-orig").textContent  = "\u20B9" + origPrice;
  document.getElementById("res-price").textContent = "\u20B9" + data.suggested_price;
  document.getElementById("res-disc").textContent  = data.discount_pct + "% OFF";
  document.getElementById("res-rev").textContent   = "\u20B9" + data.revenue_recovery.toLocaleString("en-IN");
  document.getElementById("res-conf").textContent  = data.confidence_score;
  document.getElementById("broadcast-txt").value   = data.broadcast_text;
  document.getElementById("result-section").style.display = "";

  // Re-enable publish button
  const pb = document.getElementById("publish-btn");
  pb.disabled = false;
  pb.innerHTML = "&#x1F4E1; Publish to Live Feed &amp; Copy to Clipboard";
  pb.style.background = "linear-gradient(135deg,#10b981,#059669)";
}

// ─── PUBLISH ───────────────────────────────────────────────────────────────────
document.getElementById("publish-btn").addEventListener("click", async () => {
  if (!lastResult) return;

  const broadcastText = document.getElementById("broadcast-txt").value;
  const btn = document.getElementById("publish-btn");
  btn.disabled = true;
  btn.innerHTML = '<span style="width:14px;height:14px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;display:inline-block;animation:spin .7s linear infinite;margin-right:.4rem"></span>Publishing...';

  try {
    const res  = await fetch("/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item:            lastResult.item,
        vendor:          lastResult.vendor,
        qty:             lastResult.qty,
        original_price:  lastResult.price,
        suggested_price: lastResult.suggested_price,
        discount_pct:    lastResult.discount_pct,
        hours_left:      lastResult.hours,
        perishability:   lastResult.peri,
        broadcast_text:  broadcastText
      })
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      toast("❌", data.error || "Publish failed.", true);
      btn.disabled = false;
      btn.innerHTML = "&#x1F4E1; Publish to Live Feed &amp; Copy to Clipboard";
      return;
    }

    // Clipboard — fail gracefully
    let copied = false;
    try {
      await navigator.clipboard.writeText(broadcastText);
      copied = true;
    } catch (_) {}

    toast("✅", copied ? "Published & copied to clipboard!" : "Published to live feed!");

    btn.innerHTML = "✅ Published!";
    btn.style.background = "rgba(16,185,129,.2)";

    fetchStats();
    refreshSparkline();

  } catch (_) {
    toast("❌", "Network error during publish.", true);
    btn.disabled = false;
    btn.innerHTML = "&#x1F4E1; Publish to Live Feed &amp; Copy to Clipboard";
    btn.style.background = "linear-gradient(135deg,#10b981,#059669)";
  }
});

// ─── NEW LISTING ───────────────────────────────────────────────────────────────
document.getElementById("new-btn").addEventListener("click", () => {
  document.getElementById("result-section").style.display = "none";
  document.getElementById("form-section").style.display   = "";
  document.getElementById("pricing-form").reset();
  lastResult = null;
});

// ─── TOAST ─────────────────────────────────────────────────────────────────────
let toastTimeout;
function toast(icon, message, isError = false) {
  const el  = document.getElementById("toast");
  const ico = document.getElementById("toast-icon");
  const msg = document.getElementById("toast-msg");

  ico.textContent = icon;
  msg.textContent = message;
  el.style.borderColor = isError ? "rgba(239,68,68,.4)" : "rgba(16,185,129,.2)";

  clearTimeout(toastTimeout);
  el.classList.add("show");
  toastTimeout = setTimeout(() => el.classList.remove("show"), 3500);
}

// ─── HELPERS ───────────────────────────────────────────────────────────────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
