// vendor.js — wired to Stitch-designed vendor.html

const CAPTIONS = [
  "Analyzing historical footfall...",
  "Benchmarking local demand...",
  "Calculating price elasticity...",
  "Scoring spoilage risk...",
  "Finalizing optimal strategy..."
];

let captionTimer = null;
let captionIdx   = 0;
let lastResult   = null;

// ─── STATS POLLING ──────────────────────────────────────────────────────────
async function fetchStats() {
  try {
    const r = await fetch("/api/stats");
    if (!r.ok) return;
    const s = await r.json();
    document.getElementById("stat-revenue").textContent =
      "\u20B9" + Math.round(s.revenue_recovered).toLocaleString("en-IN");
    document.getElementById("stat-meals").textContent   = s.meals_saved;
    const co2El = document.getElementById("stat-co2");
    co2El.innerHTML = s.co2_avoided.toFixed(1) +
      ' <span class="text-headline-md text-on-surface-variant font-normal">kg</span>';
  } catch (_) {}
}
fetchStats();
setInterval(fetchStats, 5000);

// ─── SPARKLINE ──────────────────────────────────────────────────────────────
async function refreshSparkline() {
  try {
    const r = await fetch("/api/sales");
    if (!r.ok) return;
    const sales = await r.json();
    const recent = [...sales]
      .sort((a, b) => b.published_at - a.published_at)
      .slice(0, 5)
      .reverse();

    const strip = document.getElementById("sparkline-strip");
    const latest = document.getElementById("spark-latest");
    if (!recent.length) return;

    const maxD = Math.max(...recent.map(s => s.discount_pct));
    strip.innerHTML = "";
    recent.forEach((s, i) => {
      const div = document.createElement("div");
      const pct = Math.round((s.discount_pct / maxD) * 100);
      const isLast = i === recent.length - 1;
      div.className = "w-1/6 rounded-t-sm " +
        (isLast ? "bg-primary" : "bg-surface-container-highest");
      div.style.height = pct + "%";
      div.title = s.item + ": " + s.discount_pct.toFixed(1) + "% off";
      strip.appendChild(div);
    });

    const lastDisc = recent[recent.length - 1];
    if (lastDisc) latest.textContent = lastDisc.discount_pct.toFixed(0) + "% off";

  } catch (_) {}
}
refreshSparkline();

// ─── CALCULATE BUTTON ───────────────────────────────────────────────────────
document.getElementById("calculateBtn").addEventListener("click", async () => {
  const item  = document.getElementById("f-item").value.trim();
  const vendor= document.getElementById("f-vendor").value.trim();
  const qty   = parseInt(document.getElementById("f-qty").value, 10);
  const price = parseFloat(document.getElementById("f-price").value);
  const hours = parseFloat(document.getElementById("f-hours").value);
  const peri  = document.querySelector("input[name='perishability']:checked")?.value || "Cooked";

  if (!item)                { toast("\u26A0\uFE0F", "Item name is required.", true);       return; }
  if (!vendor)              { toast("\u26A0\uFE0F", "Vendor name is required.", true);     return; }
  if (!qty || qty <= 0)     { toast("\u26A0\uFE0F", "Enter a valid quantity.", true);      return; }
  if (!price || price <= 0) { toast("\u26A0\uFE0F", "Enter a valid original price.", true);return; }

  // Show skeleton
  const skeleton = document.getElementById("aiSkeleton");
  const result   = document.getElementById("aiResult");
  const caption  = document.getElementById("skeletonCaption");
  const confBadge= document.getElementById("conf-badge");

  skeleton.style.opacity = "1";
  skeleton.style.display = "";
  result.style.opacity   = "0";
  result.style.pointerEvents = "none";
  confBadge.style.display = "none";

  captionIdx = 0;
  caption.textContent = CAPTIONS[0];
  clearInterval(captionTimer);
  captionTimer = setInterval(() => {
    captionIdx = (captionIdx + 1) % CAPTIONS.length;
    caption.textContent = CAPTIONS[captionIdx];
  }, 700);

  try {
    await new Promise(r => setTimeout(r, 2500));

    const res  = await fetch("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item, vendor, qty, original_price: price, hours_left: hours, perishability: peri })
    });
    const data = await res.json();

    clearInterval(captionTimer);

    if (!res.ok || data.error) {
      toast("\u274C", data.error || "Calculation failed.", true);
      skeleton.style.opacity = "1";
      return;
    }

    lastResult = { item, vendor, qty, price, hours, peri, ...data };
    showResult(data, price, qty);

  } catch (_) {
    clearInterval(captionTimer);
    toast("\u274C", "Network error. Check your connection.", true);
    skeleton.style.opacity = "1";
  }
});

function showResult(data, origPrice, qty) {
  const skeleton  = document.getElementById("aiSkeleton");
  const result    = document.getElementById("aiResult");
  const confBadge = document.getElementById("conf-badge");

  document.getElementById("res-price").innerHTML =
    "\u20B9" + data.suggested_price +
    '<span class="text-headline-md text-on-surface-variant font-normal">/unit</span>';
  document.getElementById("res-disc").textContent  = data.discount_pct.toFixed(1) + "% OFF (was \u20B9" + origPrice + ")";
  document.getElementById("res-rev").textContent   = "\u20B9" + data.revenue_recovery.toLocaleString("en-IN");
  document.getElementById("res-co2").textContent   = (qty * 2.5).toFixed(1) + " kg";
  document.getElementById("res-desc").textContent  =
    "Recommended " + data.discount_pct.toFixed(1) + "% discount based on urgency and spoilage risk.";
  document.getElementById("broadcast-txt").value   = data.broadcast_text;
  document.getElementById("res-conf").textContent  = data.confidence_score;

  skeleton.style.opacity = "0";
  setTimeout(() => {
    skeleton.style.display = "none";
    result.style.opacity   = "1";
    result.style.pointerEvents = "auto";
    confBadge.style.display = "";
  }, 500);

  // Re-enable publish button
  const pb = document.getElementById("publish-btn");
  pb.disabled = false;
  pb.innerHTML = '<span class="material-symbols-outlined text-[18px]">check_circle</span> Publish &amp; Broadcast';
}

// ─── PUBLISH ────────────────────────────────────────────────────────────────
document.getElementById("publish-btn").addEventListener("click", async () => {
  if (!lastResult) return;
  const broadcastText = document.getElementById("broadcast-txt").value;
  const btn = document.getElementById("publish-btn");
  btn.disabled = true;
  btn.innerHTML = '<span style="width:14px;height:14px;border:2px solid currentColor;border-top-color:transparent;border-radius:50%;display:inline-block" class="spin mr-2"></span> Publishing...';

  try {
    const res  = await fetch("/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item: lastResult.item, vendor: lastResult.vendor, qty: lastResult.qty,
        original_price: lastResult.price, suggested_price: lastResult.suggested_price,
        discount_pct: lastResult.discount_pct, hours_left: lastResult.hours,
        perishability: lastResult.peri, broadcast_text: broadcastText
      })
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      toast("\u274C", data.error || "Publish failed.", true);
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">check_circle</span> Publish &amp; Broadcast';
      return;
    }

    let copied = false;
    try { await navigator.clipboard.writeText(broadcastText); copied = true; } catch (_) {}
    toast("\u2705", copied ? "Published & copied to clipboard!" : "Published to live feed!");

    btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">done_all</span> Published!';
    fetchStats();
    refreshSparkline();

  } catch (_) {
    toast("\u274C", "Network error during publish.", true);
    btn.disabled = false;
    btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">check_circle</span> Publish &amp; Broadcast';
  }
});

// ─── NEW / EDIT ─────────────────────────────────────────────────────────────
document.getElementById("new-btn").addEventListener("click", () => {
  const skeleton = document.getElementById("aiSkeleton");
  const result   = document.getElementById("aiResult");
  skeleton.style.display = "";
  skeleton.style.opacity = "1";
  result.style.opacity   = "0";
  result.style.pointerEvents = "none";
  document.getElementById("skeletonCaption").textContent = "Waiting for input...";
  document.getElementById("conf-badge").style.display = "none";

  const pb = document.getElementById("publish-btn");
  pb.disabled = false;
  pb.innerHTML = '<span class="material-symbols-outlined text-[18px]">check_circle</span> Publish &amp; Broadcast';
  lastResult = null;
});

// ─── TOAST ──────────────────────────────────────────────────────────────────
let toastTimeout;
function toast(icon, message, isError = false) {
  const el  = document.getElementById("toast");
  document.getElementById("toast-icon").textContent = icon;
  document.getElementById("toast-msg").textContent  = message;
  el.style.borderColor = isError ? "rgba(186,26,26,.5)" : "";
  clearTimeout(toastTimeout);
  el.classList.add("show");
  toastTimeout = setTimeout(() => el.classList.remove("show"), 3500);
}
