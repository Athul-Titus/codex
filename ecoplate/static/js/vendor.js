// vendor.js — fully wired interactive vendor dashboard

// ─── STATE ────────────────────────────────────────────────────────────────────
const CAPTIONS = [
  "Analyzing historical footfall...",
  "Benchmarking local demand...",
  "Calculating price elasticity...",
  "Scoring spoilage risk...",
  "Finalizing optimal strategy..."
];
let captionTimer   = null;
let captionIdx     = 0;
let lastResult     = null;       // holds last /api/calculate response + form inputs
let allInventory   = [];         // cached /api/sales array for client-side filter
let recentPublished = [];        // last 3 published items for notification bell

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  fetchStats();
  setInterval(fetchStats, 5000);
  refreshSparkline();
  loadInventory();          // pre-load so filter works immediately
});

// ─── SECTION NAVIGATION ───────────────────────────────────────────────────────
function goSection(sectionId) {
  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.section === sectionId);
  });
  document.querySelectorAll(".section-content").forEach(sec => {
    sec.classList.toggle("active", sec.id === "section-" + sectionId);
  });
  const TITLES = {
    dashboard:      "Vendor Portal — Dashboard",
    inventory:      "Vendor Portal — Active Inventory",
    marketplace:    "Vendor Portal — Consumer Marketplace",
    analytics:      "Vendor Portal — Analytics",
    sustainability: "Vendor Portal — Sustainability Impact",
    support:        "Vendor Portal — Help & FAQ",
    settings:       "Vendor Portal — Settings"
  };
  document.getElementById("page-title").textContent = TITLES[sectionId] || "Vendor Portal";

  // Scroll to top: both the inner container and the window
  const mc = document.getElementById("main-content");
  if (mc) mc.scrollTop = 0;
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (sectionId === "inventory")      loadInventory();
  if (sectionId === "marketplace")    loadMarketplaceStats();
  if (sectionId === "analytics")      loadAnalytics();
  if (sectionId === "sustainability") loadSustainability();
}

// ─── focusForm: "+ New Entry" button ──────────────────────────────────────────
function focusForm() {
  goSection("dashboard");
  setTimeout(() => {
    const el = document.getElementById("f-item");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus();
  }, 60);
}

// ─── Mobile menu ──────────────────────────────────────────────────────────────
function toggleMobileMenu() {
  document.getElementById("mobile-menu").classList.toggle("hidden");
}

// ─── STATS POLLING ────────────────────────────────────────────────────────────
async function fetchStats() {
  try {
    const s = await (await fetch("/api/stats")).json();
    document.getElementById("stat-revenue").textContent =
      "₹" + Math.round(s.revenue_recovered).toLocaleString("en-IN");
    document.getElementById("stat-meals").textContent = s.meals_saved;
    document.getElementById("stat-co2").innerHTML =
      s.co2_avoided.toFixed(1) +
      ' <span class="text-headline-md text-on-surface-variant font-normal">kg</span>';
  } catch (_) {}
}

// ─── SEARCH BAR (top) — live-filters inventory section ────────────────────────
document.getElementById("global-search").addEventListener("input", function () {
  const q = this.value.trim();
  if (q) {
    goSection("inventory");
    document.getElementById("inv-search").value = q;
    filterInventory(q);
  }
});

// ─── NOTIFICATION BELL ────────────────────────────────────────────────────────
const bellBtn = document.getElementById("bell-btn");
const bellDropdown = document.getElementById("bell-dropdown");

bellBtn.addEventListener("click", e => {
  e.stopPropagation();
  renderNotifications();
  bellDropdown.classList.toggle("hidden");
});
document.addEventListener("click", () => bellDropdown.classList.add("hidden"));

function renderNotifications() {
  const dot = document.getElementById("bell-dot");
  const list = document.getElementById("notif-list");
  if (!recentPublished.length) {
    list.innerHTML = `<div class="p-3 text-on-surface-variant font-label-sm text-label-sm">No recent broadcasts</div>`;
    dot.classList.add("hidden");
    return;
  }
  dot.classList.remove("hidden");
  list.innerHTML = recentPublished.slice().reverse().map(n => `
    <div class="px-3 py-2 border-b border-outline-variant last:border-0">
      <div class="font-semibold text-on-surface" style="font-size:12px">${esc(n.item)}</div>
      <div class="text-on-surface-variant" style="font-size:11px">${Math.round(n.discount_pct)}% off · ₹${n.suggested_price} · ${timeAgo(n.published_at)}</div>
    </div>
  `).join("");
}

function timeAgo(ts) {
  const s = Math.floor(Date.now()/1000 - ts);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s/60) + "m ago";
  return Math.floor(s/3600) + "h ago";
}

// ─── SPARKLINE — plain SVG version ────────────────────────────────────────────
async function refreshSparkline() {
  try {
    const sales = await (await fetch("/api/sales")).json();
    allInventory = sales;           // keep local cache fresh too

    const recent = [...sales]
      .sort((a, b) => b.published_at - a.published_at)
      .slice(0, 5)
      .reverse();

    const strip  = document.getElementById("sparkline-strip");
    const latest = document.getElementById("spark-latest");

    if (!recent.length) {
      strip.innerHTML = `<span class="text-on-surface-variant" style="font-size:10px">No deals yet</span>`;
      latest.textContent = "--";
      return;
    }

    const maxD = Math.max(...recent.map(s => s.discount_pct), 1);
    const W = 280, H = 32, barW = 44, gap = 8;

    // SVG sparkline bar chart
    let svgBars = "";
    recent.forEach((s, i) => {
      const barH = Math.max(4, Math.round((s.discount_pct / maxD) * H));
      const x    = i * (barW + gap);
      const y    = H - barH;
      const col  = i === recent.length - 1 ? "#00261a" : "#a2d1bb";
      svgBars += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="4" fill="${col}">
        <title>${esc(s.item)}: ${s.discount_pct.toFixed(1)}% off</title></rect>`;
    });

    strip.innerHTML = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="overflow-visible">
        ${svgBars}
      </svg>`;

    const last = recent[recent.length - 1];
    latest.textContent = last ? last.discount_pct.toFixed(0) + "% off" : "--";
  } catch (_) {}
}

// ─── INVENTORY SECTION ────────────────────────────────────────────────────────
async function loadInventory() {
  const tbody = document.getElementById("inventory-tbody");
  tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-on-surface-variant">Loading…</td></tr>`;
  try {
    const r = await fetch("/api/sales");
    if (!r.ok) throw new Error();
    allInventory = await r.json();
    renderInventoryTable(allInventory);
  } catch (_) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center" style="color:#ba1a1a">Failed to load. Is the server running?</td></tr>`;
  }
}

function renderInventoryTable(items) {
  const tbody = document.getElementById("inventory-tbody");
  const count = document.getElementById("inv-count");
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-on-surface-variant">No listings found. Create one on the Dashboard!</td></tr>`;
    count.textContent = "0 items";
    return;
  }
  const now = Date.now() / 1000;
  tbody.innerHTML = items.map(s => {
    const expired     = s.expires_at < now;
    const statusClass = expired ? "status-expired" : "status-active";
    const statusText  = expired ? "Expired" : "Active";
    const mins = Math.max(0, Math.round((s.expires_at - now) / 60));
    const timeLabel = expired ? "–" : (mins < 60 ? `${mins}m` : `${Math.round(mins/60)}h`);
    return `
      <tr class="hover:bg-surface-container-low transition-colors">
        <td class="p-3 font-semibold text-on-surface">${esc(s.item)}</td>
        <td class="p-3 text-on-surface-variant">${esc(s.vendor)}</td>
        <td class="p-3 text-right font-label-mono text-label-mono">${s.qty}</td>
        <td class="p-3 text-right font-label-mono text-label-mono text-on-surface-variant">₹${s.original_price}</td>
        <td class="p-3 text-right font-label-mono text-label-mono font-semibold text-primary">₹${s.suggested_price}</td>
        <td class="p-3 text-right font-bold" style="color:#b8130e">${Math.round(s.discount_pct)}%</td>
        <td class="p-3 text-center">
          <span class="${statusClass}">${statusText}</span>
          <span class="block font-label-mono text-label-mono text-on-surface-variant" style="font-size:10px">${timeLabel}</span>
        </td>
        <td class="p-3 text-center">
          <button onclick="deleteSale('${s.id}')"
            class="p-1.5 rounded transition-colors hover:bg-surface-container-high"
            style="color:#ba1a1a" title="Remove from live feed">
            <span class="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </td>
      </tr>`;
  }).join("");
  count.textContent = `Showing ${items.length} item${items.length !== 1 ? "s" : ""}`;
}

function filterInventory(val) {
  const q = val.toLowerCase().trim();
  renderInventoryTable(q
    ? allInventory.filter(s => s.item.toLowerCase().includes(q) || s.vendor.toLowerCase().includes(q))
    : allInventory
  );
}

// Inventory section search box
document.getElementById("inv-search").addEventListener("input", function () {
  filterInventory(this.value);
});

async function deleteSale(id) {
  if (!confirm("Remove this listing from the live feed?")) return;
  try {
    const r = await fetch("/api/delete-sale", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    if (r.ok) {
      showToast("🗑️", "Listing removed from live feed!");
      allInventory = allInventory.filter(s => s.id !== id);
      renderInventoryTable(allInventory);
      refreshSparkline(); fetchStats();
    } else showToast("❌", "Delete failed.", true);
  } catch (_) { showToast("❌", "Network error.", true); }
}

// ─── MARKETPLACE ─────────────────────────────────────────────────────────────
async function loadMarketplaceStats() {
  try {
    const sales = await (await fetch("/api/sales")).json();
    const now = Date.now() / 1000;
    document.getElementById("mkt-active").textContent = sales.filter(s => s.expires_at > now).length;
    document.getElementById("mkt-total").textContent  = sales.length;
  } catch (_) {}
}

// ─── ANALYTICS ───────────────────────────────────────────────────────────────
async function loadAnalytics() {
  try {
    const sales = await (await fetch("/api/sales")).json();
    const now   = Date.now() / 1000;

    const active      = sales.filter(s => s.expires_at > now);
    const avgDisc     = sales.length ? (sales.reduce((a, s) => a + s.discount_pct, 0) / sales.length).toFixed(1) : "0";
    const totalOrig   = sales.reduce((a, s) => a + s.original_price * s.qty, 0);
    const totalRecov  = sales.reduce((a, s) => a + s.suggested_price * s.qty, 0);

    document.getElementById("analytics-summary").innerHTML = `
      <div class="flex justify-between py-2 border-b border-outline-variant"><span class="text-on-surface-variant">Active Listings</span><span class="font-bold text-primary">${active.length}</span></div>
      <div class="flex justify-between py-2 border-b border-outline-variant"><span class="text-on-surface-variant">Average Discount</span><span class="font-bold" style="color:#b8130e">${avgDisc}%</span></div>
      <div class="flex justify-between py-2 border-b border-outline-variant"><span class="text-on-surface-variant">Original Surplus Value</span><span class="font-bold text-on-surface">₹${Math.round(totalOrig).toLocaleString("en-IN")}</span></div>
      <div class="flex justify-between py-2"><span class="text-on-surface-variant">AI Recovery Potential</span><span class="font-bold text-primary">₹${Math.round(totalRecov).toLocaleString("en-IN")}</span></div>
    `;

    // ── Discount distribution bar chart (pixel heights) ──────────────────────
    const brackets = [0, 0, 0, 0];
    sales.forEach(s => {
      const d = s.discount_pct;
      if      (d <= 30) brackets[0]++;
      else if (d <= 50) brackets[1]++;
      else if (d <= 70) brackets[2]++;
      else              brackets[3]++;
    });
    const maxB    = Math.max(...brackets, 1);
    const BAR_MAX = 110; // px
    const discLabels = ["<30%", "30–50%", "50–70%", "70%+"];
    const discColors = ["#a2d1bb", "#3b6756", "#00261a", "#b8130e"];
    document.getElementById("disc-chart").innerHTML = brackets.map((v, i) => {
      const h = Math.max(6, Math.round((v / maxB) * BAR_MAX));
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:5px;padding-bottom:6px;">
        <span style="font-size:12px;font-weight:700;color:${discColors[i]}">${v}</span>
        <div style="width:100%;background:${discColors[i]};height:${h}px;border-radius:5px 5px 0 0;transition:height .5s ease;" title="${v} sale(s)"></div>
        <span style="font-size:9px;color:#717974;text-align:center;">${discLabels[i]}</span>
      </div>`;
    }).join("");
    // Remove old separate labels row (now embedded in bars)
    const labelsEl = document.getElementById("disc-labels");
    if (labelsEl) labelsEl.innerHTML = "";

    // ── Category breakdown (horizontal progress bars) ─────────────────────────
    const cats      = {};
    const catColors = { Cooked:"#00261a", Dairy:"#3b6756", Bakery:"#a2d1bb", Produce:"#b8130e" };
    const catEmoji  = { Cooked:"🍲", Dairy:"🥛", Bakery:"🥐", Produce:"🥬" };
    sales.forEach(s => { cats[s.perishability] = (cats[s.perishability] || 0) + s.qty; });
    const totalUnits = Object.values(cats).reduce((a, v) => a + v, 0) || 1;
    document.getElementById("cat-chart").innerHTML = ["Cooked", "Dairy", "Bakery", "Produce"].map(cat => {
      const count = cats[cat] || 0;
      const pct   = Math.round((count / totalUnits) * 100);
      return `<div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px;">
          <span style="font-weight:600;">${catEmoji[cat]} ${cat}</span>
          <span style="color:#717974;">${count} units &bull; ${pct}%</span>
        </div>
        <div style="width:100%;background:#edeeee;border-radius:99px;height:8px;">
          <div style="width:${pct}%;background:${catColors[cat]};height:8px;border-radius:99px;transition:width 0.6s ease;"></div>
        </div>
      </div>`;
    }).join("");

    // ── Revenue per sale — last 5 (pixel heights) ─────────────────────────────
    const last5  = [...sales].sort((a, b) => b.published_at - a.published_at).slice(0, 5).reverse();
    const maxRev = Math.max(...last5.map(s => s.suggested_price * s.qty), 1);
    document.getElementById("rev-chart").innerHTML = last5.length
      ? last5.map(s => {
          const rv = s.suggested_price * s.qty;
          const h  = Math.max(6, Math.round((rv / maxRev) * BAR_MAX));
          return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:5px;padding-bottom:6px;">
            <span style="font-size:10px;font-weight:700;color:#b8130e;">&#x20B9;${Math.round(rv)}</span>
            <div style="width:100%;background:#b8130e;height:${h}px;border-radius:5px 5px 0 0;transition:height .5s ease;" title="${esc(s.item)}: &#x20B9;${Math.round(rv)}"></div>
            <span style="font-size:9px;color:#717974;text-align:center;overflow:hidden;max-width:100%;white-space:nowrap;text-overflow:ellipsis;">${esc(s.item.split(' ')[0])}</span>
          </div>`;
        }).join("")
      : `<div style="width:100%;text-align:center;color:#717974;font-size:13px;padding:32px 0;">No sales yet</div>`;

  } catch (_) {}
}

// ─── SUSTAINABILITY ───────────────────────────────────────────────────────────
async function loadSustainability() {
  try {
    const sales = await (await fetch("/api/sales")).json();
    const total = sales.reduce((a, s) => a + s.qty, 0);
    const co2   = total * 2.5;

    document.getElementById("sust-co2").textContent   = co2.toFixed(1);
    document.getElementById("sust-trees").textContent = (co2 / 22).toFixed(1);
    document.getElementById("sust-km").textContent    = Math.round(co2 / 0.21).toLocaleString("en-IN");

    const cats = {};
    sales.forEach(s => { cats[s.perishability] = (cats[s.perishability] || 0) + s.qty; });
    document.getElementById("sust-breakdown").innerHTML =
      ["Cooked","Dairy","Bakery","Produce"].map(cat => {
        const count = cats[cat] || 0;
        return `<div class="flex justify-between py-1.5 border-b border-outline-variant text-body-md">
          <span class="text-on-surface">${cat}</span>
          <span class="text-on-surface-variant font-label-mono">${count} meals rescued · ${(count*2.5).toFixed(1)} kg CO&#x2082; avoided</span>
        </div>`;
      }).join("");
  } catch (_) {}
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
function saveSettings() {
  const name = document.getElementById("set-name").value.trim();
  if (!name) { showToast("⚠️", "Restaurant name is required.", true); return; }
  document.getElementById("f-vendor").value = name;
  showToast("✅", "Settings saved!");
}

// ─── PERISHABILITY — confirm radio state is captured ──────────────────────────
// Native radio buttons with name="perishability" — value read at click time via
// document.querySelector("input[name='perishability']:checked").value — no extra JS needed.

// ─── CALCULATE BUTTON ─────────────────────────────────────────────────────────
document.getElementById("calculateBtn").addEventListener("click", async () => {
  const item   = document.getElementById("f-item").value.trim();
  const vendor = document.getElementById("f-vendor").value.trim();
  const qty    = parseInt(document.getElementById("f-qty").value, 10);
  const price  = parseFloat(document.getElementById("f-price").value);
  const hours  = parseFloat(document.getElementById("f-hours").value);
  const peri   = document.querySelector("input[name='perishability']:checked")?.value || "Cooked";

  if (!item)              { showToast("⚠️", "Item name is required.", true);  return; }
  if (!vendor)            { showToast("⚠️", "Vendor name is required.", true); return; }
  if (!qty  || qty  <= 0) { showToast("⚠️", "Enter a valid quantity.", true); return; }
  if (!price || price <= 0) { showToast("⚠️", "Enter a valid price.", true);  return; }

  // Show skeleton, hide result
  const skeleton   = document.getElementById("aiSkeleton");
  const resultPane = document.getElementById("aiResult");
  const caption    = document.getElementById("skeletonCaption");
  const confBadge  = document.getElementById("conf-badge");
  const calcBtn    = document.getElementById("calculateBtn");

  skeleton.style.display  = "";
  skeleton.style.opacity  = "1";
  resultPane.style.opacity = "0";
  resultPane.style.pointerEvents = "none";
  confBadge.classList.add("hidden");
  calcBtn.disabled = true;
  calcBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">hourglass_empty</span> Calculating…';

  captionIdx = 0;
  caption.textContent = CAPTIONS[0];
  clearInterval(captionTimer);
  captionTimer = setInterval(() => {
    captionIdx = (captionIdx + 1) % CAPTIONS.length;
    caption.textContent = CAPTIONS[captionIdx];
  }, 450);

  try {
    await new Promise(r => setTimeout(r, 1600));   // deliberate UX delay

    const res  = await fetch("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item, vendor, qty, original_price: price, hours_left: hours, perishability: peri })
    });
    const data = await res.json();

    clearInterval(captionTimer);
    calcBtn.disabled = false;
    calcBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">model_training</span> Calculate Optimal Clearance Strategy';

    if (!res.ok || data.error) {
      showToast("❌", data.error || "Calculation failed.", true);
      return;
    }

    lastResult = { item, vendor, qty, price, hours, peri, ...data };
    showResult(data, price, qty);

  } catch (_) {
    clearInterval(captionTimer);
    calcBtn.disabled = false;
    calcBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">model_training</span> Calculate Optimal Clearance Strategy';
    showToast("❌", "Network error. Is Flask running?", true);
  }
});

function showResult(data, origPrice, qty) {
  const skeleton   = document.getElementById("aiSkeleton");
  const resultPane = document.getElementById("aiResult");
  const confBadge  = document.getElementById("conf-badge");

  document.getElementById("res-price").innerHTML =
    "₹" + data.suggested_price.toFixed(2) +
    '<span class="text-headline-md text-on-surface-variant font-normal">/unit</span>';
  document.getElementById("res-disc").textContent  =
    data.discount_pct.toFixed(1) + "% OFF (was ₹" + origPrice + ")";
  document.getElementById("res-rev").textContent   = "₹" + data.revenue_recovery.toLocaleString("en-IN");
  document.getElementById("res-co2").textContent   = (qty * 2.5).toFixed(1) + " kg";
  document.getElementById("res-desc").textContent  =
    "Recommended " + data.discount_pct.toFixed(1) + "% discount · " +
    data.confidence_score + "% model confidence.";
  document.getElementById("broadcast-txt").value   = data.broadcast_text;
  document.getElementById("res-conf").textContent  = data.confidence_score;

  skeleton.style.opacity = "0";
  setTimeout(() => {
    skeleton.style.display = "none";
    resultPane.style.opacity = "1";
    resultPane.style.pointerEvents = "auto";
    confBadge.classList.remove("hidden");
  }, 300);

  const pb = document.getElementById("publish-btn");
  pb.disabled = false;
  pb.innerHTML = '<span class="material-symbols-outlined text-[18px]">check_circle</span>Publish &amp; Broadcast';
}

// ─── AI REWRITE ───────────────────────────────────────────────────────────────
document.getElementById("ai-gen-btn").addEventListener("click", async () => {
  if (!lastResult) { showToast("⚠️", "Run Calculate first.", true); return; }
  const btn  = document.getElementById("ai-gen-btn");
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span style="display:inline-block;animation:spin .7s linear infinite">⏳</span> Rewriting…';

  try {
    const res  = await fetch("/api/ai-broadcast", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lastResult)
    });
    const data = await res.json();
    if (res.ok && data.broadcast_text) {
      document.getElementById("broadcast-txt").value = data.broadcast_text;
      showToast("🪄", "AI-rewritten with GPT-4o-mini!");
    } else {
      showToast("⚠️", data.error || "Rewrite failed.", true);
    }
  } catch (_) {
    showToast("❌", "Network error.", true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
});

// ─── PUBLISH ──────────────────────────────────────────────────────────────────
document.getElementById("publish-btn").addEventListener("click", async () => {
  if (!lastResult) { showToast("⚠️", "Calculate a price first!", true); return; }
  const broadcastText = document.getElementById("broadcast-txt").value;
  const btn = document.getElementById("publish-btn");
  btn.disabled = true;
  btn.innerHTML = '<span style="display:inline-block;animation:spin .7s linear infinite">⏳</span> Publishing…';

  try {
    const res  = await fetch("/api/publish", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item: lastResult.item,           vendor: lastResult.vendor,
        qty: lastResult.qty,             original_price: lastResult.price,
        suggested_price: lastResult.suggested_price,
        discount_pct: lastResult.discount_pct,
        hours_left: lastResult.hours,    perishability: lastResult.peri,
        broadcast_text: broadcastText
      })
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      showToast("❌", data.error || "Publish failed.", true);
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">check_circle</span>Publish &amp; Broadcast';
      return;
    }

    // Track for notification bell
    recentPublished.push({
      item:           lastResult.item,
      discount_pct:   lastResult.discount_pct,
      suggested_price:lastResult.suggested_price,
      published_at:   Date.now() / 1000
    });
    if (recentPublished.length > 3) recentPublished.shift();
    document.getElementById("bell-dot").classList.remove("hidden");

    // Clipboard
    try { await navigator.clipboard.writeText(broadcastText); } catch (_) {}
    showToast("🎉", "Deal is live! Broadcast copy copied.");

    btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">done_all</span> Published!';
    fetchStats();
    await refreshSparkline();            // update sparkline with new deal
    // Also refresh inventory cache silently
    try { allInventory = await (await fetch("/api/sales")).json(); } catch (_) {}

  } catch (_) {
    showToast("❌", "Network error during publish.", true);
    btn.disabled = false;
    btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">check_circle</span>Publish &amp; Broadcast';
  }
});

// ─── EDIT / NEW ───────────────────────────────────────────────────────────────
document.getElementById("new-btn").addEventListener("click", () => {
  const skeleton   = document.getElementById("aiSkeleton");
  const resultPane = document.getElementById("aiResult");
  skeleton.style.display  = "";
  skeleton.style.opacity  = "1";
  resultPane.style.opacity = "0";
  resultPane.style.pointerEvents = "none";
  document.getElementById("skeletonCaption").textContent = "Waiting for input…";
  document.getElementById("conf-badge").classList.add("hidden");
  ["f-item","f-qty","f-price"].forEach(id => { document.getElementById(id).value = ""; });
  const pb = document.getElementById("publish-btn");
  pb.disabled = false;
  pb.innerHTML = '<span class="material-symbols-outlined text-[18px]">check_circle</span>Publish &amp; Broadcast';
  lastResult = null;
  document.getElementById("f-item").focus();
});

// ─── TOAST ────────────────────────────────────────────────────────────────────
let _toastT;
function showToast(icon, msg, isError = false) {
  const el = document.getElementById("toast");
  document.getElementById("toast-icon").textContent = icon;
  document.getElementById("toast-msg").textContent  = msg;
  el.style.borderColor = isError ? "#ba1a1a" : "";
  el.classList.add("show");
  clearTimeout(_toastT);
  _toastT = setTimeout(() => el.classList.remove("show"), 3500);
}

// ─── UTILITY ──────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// Spin animation used inline
const _spinStyle = document.createElement("style");
_spinStyle.textContent = "@keyframes spin{to{transform:rotate(360deg)}} .status-active{background:#dcfce7;color:#166534;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700} .status-expired{background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700}";
document.head.appendChild(_spinStyle);
