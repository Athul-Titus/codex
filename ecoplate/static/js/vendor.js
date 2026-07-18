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
let allInventory = [];

// ─── SECTION NAVIGATION ──────────────────────────────────────────────────────
function goSection(sectionId) {
  // Update sidebar active classes
  document.querySelectorAll(".nav-item").forEach(item => {
    if (item.getAttribute("data-section") === sectionId) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  // Switch visible sections
  document.querySelectorAll(".section-content").forEach(sec => {
    if (sec.id === "section-" + sectionId) {
      sec.classList.add("active");
    } else {
      sec.classList.remove("active");
    }
  });

  // Update page header title
  const titles = {
    dashboard: "Vendor Portal — Dashboard",
    inventory: "Vendor Portal — Active Inventory",
    marketplace: "Vendor Portal — Consumer Marketplace",
    analytics: "Vendor Portal — Analytics Dashboard",
    sustainability: "Vendor Portal — Sustainability Impact",
    support: "Vendor Portal — Help & FAQ",
    settings: "Vendor Portal — Settings"
  };
  document.getElementById("page-title").textContent = titles[sectionId] || "Vendor Portal";

  // Trigger section-specific loads
  if (sectionId === "inventory") {
    loadInventory();
  } else if (sectionId === "marketplace") {
    loadMarketplaceStats();
  } else if (sectionId === "analytics") {
    loadAnalytics();
  } else if (sectionId === "sustainability") {
    loadSustainability();
  }
}

function focusForm() {
  const el = document.getElementById("f-item");
  if (el) el.focus();
}

function toggleMobileMenu() {
  const mm = document.getElementById("mobile-menu");
  mm.classList.toggle("hidden");
}

// ─── STATS POLLING ──────────────────────────────────────────────────────────
async function fetchStats() {
  try {
    const r = await fetch("/api/stats");
    if (!r.ok) return;
    const s = await r.json();
    document.getElementById("stat-revenue").textContent =
      "₹" + Math.round(s.revenue_recovered).toLocaleString("en-IN");
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
    if (!recent.length) {
      strip.innerHTML = "<div class='text-on-surface-variant text-[10px]'>No published sales yet</div>";
      return;
    }

    const maxD = Math.max(...recent.map(s => s.discount_pct));
    strip.innerHTML = "";
    recent.forEach((s, i) => {
      const div = document.createElement("div");
      const pct = Math.round((s.discount_pct / (maxD || 1)) * 100);
      const isLast = i === recent.length - 1;
      div.className = "w-1/5 chart-bar " + (isLast ? "bg-primary" : "bg-surface-container-highest");
      div.style.height = Math.max(10, pct) + "%";
      div.title = s.item + ": " + s.discount_pct.toFixed(1) + "% off";
      strip.appendChild(div);
    });

    const lastDisc = recent[recent.length - 1];
    if (lastDisc) latest.textContent = lastDisc.discount_pct.toFixed(0) + "% off";

  } catch (_) {}
}
refreshSparkline();

// ─── SEARCH HANDLERS ────────────────────────────────────────────────────────
function handleSearch(val) {
  // If we are not on inventory page, switch to it
  const invSec = document.getElementById("section-inventory");
  if (!invSec.classList.contains("active")) {
    goSection("inventory");
  }
  document.getElementById("inv-search").value = val;
  filterInventory(val);
}

// ─── INVENTORY SECTION ───────────────────────────────────────────────────────
async function loadInventory() {
  const tbody = document.getElementById("inventory-tbody");
  tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-on-surface-variant"><span class="spin mr-2">⏳</span>Loading active inventory...</td></tr>`;

  try {
    const r = await fetch("/api/sales");
    if (!r.ok) throw new Error("Fail");
    allInventory = await r.json();
    renderInventoryTable(allInventory);
  } catch (_) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-error">Failed to load inventory.</td></tr>`;
  }
}

function renderInventoryTable(items) {
  const tbody = document.getElementById("inventory-tbody");
  const count = document.getElementById("inv-count");
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-on-surface-variant">No active listings found. Create one on the Dashboard!</td></tr>`;
    count.textContent = "Showing 0 items";
    return;
  }

  const now = Date.now() / 1000;
  tbody.innerHTML = items.map(s => {
    const isExpired = s.expires_at < now;
    const statusText = isExpired ? "Expired" : "Active";
    const statusClass = isExpired ? "status-expired" : "status-active";
    return `
      <tr class="hover:bg-surface-container-low transition-colors">
        <td class="p-3 font-semibold text-on-surface">${esc(s.item)}</td>
        <td class="p-3 text-on-surface-variant">${esc(s.vendor)}</td>
        <td class="p-3 text-right font-label-mono text-label-mono">${s.qty}</td>
        <td class="p-3 text-right font-label-mono text-label-mono text-on-surface-variant">₹${s.original_price}</td>
        <td class="p-3 text-right font-label-mono text-label-mono font-semibold text-primary">₹${s.suggested_price}</td>
        <td class="p-3 text-right text-secondary font-bold">${Math.round(s.discount_pct)}%</td>
        <td class="p-3 text-center"><span class="${statusClass}">${statusText}</span></td>
        <td class="p-3 text-center">
          <button onclick="deleteSale('${s.id}')" class="text-error hover:bg-error-container/20 p-1.5 rounded transition-colors" title="Delete listing">
            <span class="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </td>
      </tr>
    `;
  }).join("");
  count.textContent = `Showing ${items.length} items`;
}

function filterInventory(val) {
  const query = val.toLowerCase().trim();
  if (!query) {
    renderInventoryTable(allInventory);
    return;
  }
  const filtered = allInventory.filter(s =>
    s.item.toLowerCase().includes(query) || s.vendor.toLowerCase().includes(query)
  );
  renderInventoryTable(filtered);
}

async function deleteSale(id) {
  if (!confirm("Are you sure you want to delete this listing? it will remove it from the consumer live feed immediately.")) return;
  try {
    const r = await fetch("/api/delete-sale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    if (r.ok) {
      showToast("🗑️", "Listing deleted successfully!");
      loadInventory();
      refreshSparkline();
      fetchStats();
    } else {
      showToast("❌", "Failed to delete listing.");
    }
  } catch (_) {
    showToast("❌", "Network error occurred.");
  }
}

// ─── MARKETPLACE SECTION ─────────────────────────────────────────────────────
async function loadMarketplaceStats() {
  try {
    const r = await fetch("/api/sales");
    if (!r.ok) return;
    const sales = await r.json();
    const now = Date.now() / 1000;
    const active = sales.filter(s => s.expires_at > now).length;
    document.getElementById("mkt-active").textContent = active;
    document.getElementById("mkt-total").textContent = sales.length;
  } catch (_) {}
}

// ─── ANALYTICS SECTION ───────────────────────────────────────────────────────
async function loadAnalytics() {
  try {
    const r = await fetch("/api/sales");
    if (!r.ok) return;
    const sales = await r.json();
    const now = Date.now() / 1000;

    // Summary calculations
    const active = sales.filter(s => s.expires_at > now);
    const avgDisc = sales.length ? (sales.reduce((acc, s) => acc + s.discount_pct, 0) / sales.length).toFixed(1) : "0";
    const totalListedVal = sales.reduce((acc, s) => acc + (s.original_price * s.qty), 0);
    const estRecoveryVal = sales.reduce((acc, s) => acc + (s.suggested_price * s.qty), 0);

    const summary = document.getElementById("analytics-summary");
    summary.innerHTML = `
      <div class="flex justify-between py-1.5 border-b border-outline-variant"><span class="text-on-surface-variant">Active Listings</span><span class="font-bold text-primary">${active.length}</span></div>
      <div class="flex justify-between py-1.5 border-b border-outline-variant"><span class="text-on-surface-variant">Average Discount</span><span class="font-bold text-secondary">${avgDisc}%</span></div>
      <div class="flex justify-between py-1.5 border-b border-outline-variant"><span class="text-on-surface-variant">Original Surplus Value</span><span class="font-bold text-on-surface">₹${totalListedVal.toLocaleString("en-IN")}</span></div>
      <div class="flex justify-between py-1.5 border-b border-outline-variant"><span class="text-on-surface-variant">AI Recovery Potential</span><span class="font-bold text-primary">₹${estRecoveryVal.toLocaleString("en-IN")}</span></div>
    `;

    // 1. Discount Distribution Chart (0-30%, 30-50%, 50-70%, 70%+)
    const brackets = [0, 0, 0, 0];
    sales.forEach(s => {
      const d = s.discount_pct;
      if (d <= 30) brackets[0]++;
      else if (d <= 50) brackets[1]++;
      else if (d <= 70) brackets[2]++;
      else brackets[3]++;
    });
    const maxB = Math.max(...brackets, 1);
    const dChart = document.getElementById("disc-chart");
    dChart.innerHTML = brackets.map((val, idx) => {
      const height = (val / maxB) * 100;
      return `<div class="flex-1 bg-primary/20 rounded-t flex flex-col justify-end h-full relative" title="${val} sales">
        <div class="bg-primary rounded-t chart-bar w-full" style="height:${height}%"></div>
        <div class="absolute inset-0 flex items-center justify-center font-bold text-xs text-primary">${val}</div>
      </div>`;
    }).join("");
    document.getElementById("disc-labels").innerHTML = `
      <span class="flex-1 text-center">&lt;30%</span>
      <span class="flex-1 text-center">30-50%</span>
      <span class="flex-1 text-center">50-70%</span>
      <span class="flex-1 text-center">70%+</span>
    `;

    // 2. Category Breakdown Chart
    const cats = {};
    sales.forEach(s => { cats[s.perishability] = (cats[s.perishability] || 0) + s.qty; });
    const maxC = Math.max(...Object.values(cats), 1);
    const cChart = document.getElementById("cat-chart");
    cChart.innerHTML = ["Cooked", "Dairy", "Bakery", "Produce"].map(cat => {
      const count = cats[cat] || 0;
      const pct = (count / maxC) * 100;
      return `
        <div class="space-y-1">
          <div class="flex justify-between text-xs text-on-surface-variant"><span>${cat}</span><span>${count} units</span></div>
          <div class="w-full bg-surface-container rounded-full h-2">
            <div class="bg-primary h-2 rounded-full transition-all" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    }).join("");

    // 3. Revenue Trend Chart (Last 5 Sales)
    const revChart = document.getElementById("rev-chart");
    const last5 = [...sales].sort((a,b)=>b.published_at - a.published_at).slice(0,5).reverse();
    const maxRev = Math.max(...last5.map(s => s.suggested_price * s.qty), 1);
    revChart.innerHTML = last5.map(s => {
      const r = s.suggested_price * s.qty;
      const height = (r / maxRev) * 100;
      return `<div class="flex-1 bg-secondary/10 rounded-t flex flex-col justify-end h-full relative" title="₹${r}">
        <div class="bg-secondary rounded-t chart-bar w-full" style="height:${height}%"></div>
        <div class="absolute inset-0 flex items-center justify-center font-bold text-[10px] text-secondary">₹${Math.round(r)}</div>
      </div>`;
    }).join("");

  } catch (_) {}
}

// ─── SUSTAINABILITY SECTION ──────────────────────────────────────────────────
async function loadSustainability() {
  try {
    const r = await fetch("/api/sales");
    if (!r.ok) return;
    const sales = await r.json();

    const totalRescued = sales.reduce((acc, s) => acc + s.qty, 0);
    const co2 = totalRescued * 2.5;
    const trees = (co2 / 22.0).toFixed(1);
    const km = (co2 / 0.21).toFixed(0);

    document.getElementById("sust-co2").textContent = co2.toFixed(1);
    document.getElementById("sust-trees").textContent = trees;
    document.getElementById("sust-km").textContent = km.toLocaleString("en-IN");

    // Breakdown category table
    const cats = {};
    sales.forEach(s => { cats[s.perishability] = (cats[s.perishability] || 0) + s.qty; });
    const bdown = document.getElementById("sust-breakdown");
    bdown.innerHTML = ["Cooked", "Dairy", "Bakery", "Produce"].map(cat => {
      const count = cats[cat] || 0;
      const savedCo2 = count * 2.5;
      return `
        <div class="flex justify-between py-1.5 border-b border-outline-variant text-body-md">
          <span class="text-on-surface">${cat}</span>
          <span class="text-on-surface-variant font-label-mono">${count} meals rescued (≈ ${savedCo2.toFixed(1)} kg CO&#x2082; avoided)</span>
        </div>
      `;
    }).join("");

  } catch (_) {}
}

// ─── SETTINGS SECTION ────────────────────────────────────────────────────────
function saveSettings() {
  const name = document.getElementById("set-name").value.trim();
  if (!name) {
    showToast("⚠️", "Restaurant name is required.", true);
    return;
  }
  document.getElementById("f-vendor").value = name;
  showToast("✅", "Settings saved successfully!");
}

// ─── AI STRATEGY ENGINE ──────────────────────────────────────────────────────
document.getElementById("calculateBtn").addEventListener("click", async () => {
  const item  = document.getElementById("f-item").value.trim();
  const vendor= document.getElementById("f-vendor").value.trim();
  const qty   = parseInt(document.getElementById("f-qty").value, 10);
  const price = parseFloat(document.getElementById("f-price").value);
  const hours = parseFloat(document.getElementById("f-hours").value);
  const peri  = document.querySelector("input[name='perishability']:checked")?.value || "Cooked";

  if (!item)                { showToast("⚠️", "Item name is required.", true);       return; }
  if (!vendor)              { showToast("⚠️", "Vendor name is required.", true);     return; }
  if (!qty || qty <= 0)     { showToast("⚠️", "Enter a valid quantity.", true);      return; }
  if (!price || price <= 0) { showToast("⚠️", "Enter a valid original price.", true);return; }

  // Switch to skeleton
  const skeleton = document.getElementById("aiSkeleton");
  const result   = document.getElementById("aiResult");
  const caption  = document.getElementById("skeletonCaption");
  const confBadge= document.getElementById("conf-badge");

  skeleton.style.opacity = "1";
  skeleton.style.display = "";
  result.style.opacity   = "0";
  result.style.pointerEvents = "none";
  confBadge.classList.add("hidden");

  captionIdx = 0;
  caption.textContent = CAPTIONS[0];
  clearInterval(captionTimer);
  captionTimer = setInterval(() => {
    captionIdx = (captionIdx + 1) % CAPTIONS.length;
    caption.textContent = CAPTIONS[captionIdx];
  }, 450);

  try {
    await new Promise(r => setTimeout(r, 2200));

    const res  = await fetch("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item, vendor, qty, original_price: price, hours_left: hours, perishability: peri })
    });
    const data = await res.json();

    clearInterval(captionTimer);

    if (!res.ok || data.error) {
      showToast("❌", data.error || "Calculation failed.", true);
      skeleton.style.opacity = "1";
      return;
    }

    lastResult = { item, vendor, qty, price, hours, peri, ...data };
    showResult(data, price, qty);

  } catch (_) {
    clearInterval(captionTimer);
    showToast("❌", "Network error. Check server.", true);
    skeleton.style.opacity = "1";
  }
});

function showResult(data, origPrice, qty) {
  const skeleton  = document.getElementById("aiSkeleton");
  const result    = document.getElementById("aiResult");
  const confBadge = document.getElementById("conf-badge");

  document.getElementById("res-price").innerHTML =
    "₹" + data.suggested_price.toFixed(2) +
    '<span class="text-headline-md text-on-surface-variant font-normal">/unit</span>';
  document.getElementById("res-disc").textContent  = data.discount_pct.toFixed(1) + "% OFF (was ₹" + origPrice + ")";
  document.getElementById("res-rev").textContent   = "₹" + data.revenue_recovery.toLocaleString("en-IN");
  document.getElementById("res-co2").textContent   = (qty * 2.5).toFixed(1) + " kg";
  document.getElementById("res-desc").textContent  =
    "Recommended " + data.discount_pct.toFixed(1) + "% discount based on urgency and perishability.";
  document.getElementById("broadcast-txt").value   = data.broadcast_text;
  document.getElementById("res-conf").textContent  = data.confidence_score;

  skeleton.style.opacity = "0";
  setTimeout(() => {
    skeleton.style.display = "none";
    result.style.opacity   = "1";
    result.style.pointerEvents = "auto";
    confBadge.classList.remove("hidden");
  }, 350);

  // Re-enable publish button
  const pb = document.getElementById("publish-btn");
  pb.disabled = false;
  pb.innerHTML = '<span class="material-symbols-outlined text-[18px]">check_circle</span>Publish &amp; Broadcast';
}

// ─── AI REWRITE ──────────────────────────────────────────────────────────────
document.getElementById("ai-gen-btn").addEventListener("click", async () => {
  if (!lastResult) return;
  const btn = document.getElementById("ai-gen-btn");
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin font-bold text-xs">⏳</span> Rewriting...';

  try {
    const res = await fetch("/api/ai-broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lastResult)
    });
    const data = await res.json();
    if (res.ok && data.broadcast_text) {
      document.getElementById("broadcast-txt").value = data.broadcast_text;
      showToast("🪄", "Rewritten with GPT-4o-mini!");
    } else {
      showToast("⚠️", data.error || "Could not rewrite copy.", true);
    }
  } catch (_) {
    showToast("❌", "Network error.", true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
});

// ─── PUBLISH ────────────────────────────────────────────────────────────────
document.getElementById("publish-btn").addEventListener("click", async () => {
  if (!lastResult) return;
  const broadcastText = document.getElementById("broadcast-txt").value;
  const btn = document.getElementById("publish-btn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spin mr-2 text-[14px]">⏳</span>Publishing...';

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
      showToast("❌", data.error || "Publish failed.", true);
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">check_circle</span>Publish &amp; Broadcast';
      return;
    }

    let copied = false;
    try { await navigator.clipboard.writeText(broadcastText); copied = true; } catch (_) {}
    showToast("🎉", copied ? "Published & copied broadcast copy!" : "Deal is now live on feed!");

    btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">done_all</span>Published!';
    fetchStats();
    refreshSparkline();

  } catch (_) {
    showToast("❌", "Network error during publish.", true);
    btn.disabled = false;
    btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">check_circle</span>Publish &amp; Broadcast';
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
  document.getElementById("conf-badge").classList.add("hidden");

  // Clear inputs
  document.getElementById("f-item").value = "";
  document.getElementById("f-qty").value = "";
  document.getElementById("f-price").value = "";

  const pb = document.getElementById("publish-btn");
  pb.disabled = false;
  pb.innerHTML = '<span class="material-symbols-outlined text-[18px]">check_circle</span>Publish &amp; Broadcast';
  lastResult = null;
});

// ─── TOAST ──────────────────────────────────────────────────────────────────
let toastTimeout;
function showToast(icon, message, isError = false) {
  const el  = document.getElementById("toast");
  document.getElementById("toast-icon").textContent = icon;
  document.getElementById("toast-msg").textContent  = message;
  
  if (isError) {
    el.classList.add("border-red-500");
  } else {
    el.classList.remove("border-red-500");
  }
  
  clearTimeout(toastTimeout);
  el.classList.add("show");
  toastTimeout = setTimeout(() => el.classList.remove("show"), 3500);
}

function esc(s) {
  return String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
