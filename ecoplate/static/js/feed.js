// feed.js — EcoPlate Consumer Live Feed

const PERI_EMOJI = { Dairy:"🥛", Cooked:"🍲", Bakery:"🥐", Produce:"🥬" };

let allSales      = [];
let activeSort    = "all";
let cdTimers      = {};   // countdown interval handles keyed by sale id

// ─── FETCH & RENDER ────────────────────────────────────────────────────────────
async function fetchSales() {
  try {
    const r = await fetch("/api/sales");
    if (!r.ok) return;
    allSales = await r.json();
    render();
    updateCount();
  } catch (_) {}
}

function updateCount() {
  const now    = Date.now() / 1000;
  const active = allSales.filter(s => s.expires_at > now).length;
  document.getElementById("deal-count").textContent = active;
}

// ─── RENDER ────────────────────────────────────────────────────────────────────
function render() {
  const grid  = document.getElementById("deals-grid");
  const empty = document.getElementById("empty-state");

  // Clear countdowns
  Object.values(cdTimers).forEach(clearInterval);
  cdTimers = {};

  const sales = sorted();
  if (!sales.length) {
    grid.innerHTML = "";
    empty.style.display = "";
    return;
  }
  empty.style.display = "none";
  grid.innerHTML = sales.map(buildCard).join("");

  // Wire claim buttons
  grid.querySelectorAll(".js-claim").forEach(btn => {
    btn.addEventListener("click", () => openModal(btn.dataset.id, btn.dataset.name));
  });

  // Start all countdowns
  sales.forEach(s => startCD(s.id, s.expires_at));
}

function sorted() {
  const now = Date.now() / 1000;
  let list  = [...allSales];

  if (activeSort === "ending") {
    list.sort((a, b) => a.expires_at - b.expires_at);
  } else if (activeSort === "discount") {
    list.sort((a, b) => b.discount_pct - a.discount_pct);
  } else {
    // Default: active first (newest), expired last
    list.sort((a, b) => {
      const ae = a.expires_at < now, be = b.expires_at < now;
      if (ae !== be) return ae ? 1 : -1;
      return b.published_at - a.published_at;
    });
  }
  return list;
}

// ─── CARD BUILDER ──────────────────────────────────────────────────────────────
function buildCard(s) {
  const now     = Date.now() / 1000;
  const expired = s.expires_at < now;
  const emoji   = PERI_EMOJI[s.perishability] || "🍽️";
  const discRnd = Math.round(s.discount_pct);

  return `
<div class="deal-card${expired ? " expired" : ""}" id="card-${s.id}">

  <!-- Header: emoji + name + badge -->
  <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:1rem;gap:.5rem">
    <div style="display:flex;align-items:center;gap:.6rem;flex:1;min-width:0">
      <span style="font-size:1.75rem;flex-shrink:0">${emoji}</span>
      <div style="min-width:0">
        <div style="font-weight:700;font-size:.9rem;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.item)}</div>
        <div style="font-size:.72rem;color:rgba(255,255,255,.4);margin-top:.15rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.vendor)}</div>
      </div>
    </div>
    <span class="off-badge">${discRnd}% OFF</span>
  </div>

  <!-- Pricing -->
  <div style="display:flex;align-items:baseline;gap:.6rem;margin-bottom:.75rem">
    <span style="font-size:2rem;font-weight:800;color:#10b981">&#x20B9;${s.suggested_price}</span>
    <span style="font-size:.85rem;color:rgba(255,255,255,.3);text-decoration:line-through">&#x20B9;${s.original_price}</span>
  </div>

  <!-- Qty + tag -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
    <span style="font-size:.78rem;font-weight:600;color:${expired ? "rgba(255,255,255,.25)" : "#fb923c"}">
      ${expired ? "🚫 Sold Out" : `🔥 Only ${s.qty} left!`}
    </span>
    <span style="font-size:.7rem;padding:.15rem .5rem;border-radius:99px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.35)">${s.perishability}</span>
  </div>

  <!-- Countdown -->
  <div style="display:flex;align-items:center;gap:.5rem;background:rgba(255,255,255,.04);border-radius:.75rem;padding:.5rem .75rem;margin-bottom:.875rem">
    <span style="font-size:.85rem">⏱️</span>
    ${expired
      ? `<span style="font-size:.75rem;color:rgba(255,255,255,.3)">Expired</span>`
      : `<span class="countdown" id="cd-${s.id}">Calculating…</span>`
    }
  </div>

  <!-- Claim button -->
  <button
    class="claim-btn js-claim"
    data-id="${s.id}"
    data-name="${esc(s.item)}"
    ${expired ? "disabled" : ""}
  >
    ${expired ? "Expired" : "🛒 Claim Now"}
  </button>

</div>`;
}

// ─── COUNTDOWN ─────────────────────────────────────────────────────────────────
function startCD(id, expiresAt) {
  const el = document.getElementById(`cd-${id}`);
  if (!el) return;

  function tick() {
    const rem = expiresAt - Date.now() / 1000;
    if (rem <= 0) {
      expireCard(id);
      clearInterval(cdTimers[id]);
      updateCount();
      return;
    }
    const h = Math.floor(rem / 3600);
    const m = Math.floor((rem % 3600) / 60);
    const s = Math.floor(rem % 60);
    const pad = n => String(n).padStart(2, "0");
    el.textContent = h > 0
      ? `${h}h ${pad(m)}m ${pad(s)}s remaining`
      : `${pad(m)}m ${pad(s)}s remaining`;
    if (rem < 900) el.classList.add("urgent");
  }

  tick();
  cdTimers[id] = setInterval(tick, 1000);
}

function expireCard(id) {
  const card = document.getElementById(`card-${id}`);
  if (!card) return;
  card.classList.add("expired");

  const btn = card.querySelector(".js-claim");
  if (btn) { btn.disabled = true; btn.textContent = "Expired"; }

  const qtyEl = card.querySelector("[data-qty]");
  if (qtyEl) { qtyEl.textContent = "🚫 Sold Out"; qtyEl.style.color = "rgba(255,255,255,.25)"; }

  const cdEl = document.getElementById(`cd-${id}`);
  if (cdEl) { cdEl.textContent = "Expired"; cdEl.classList.remove("urgent"); }
}

// ─── FILTER CHIPS ──────────────────────────────────────────────────────────────
[["chip-all","all"],["chip-ending","ending"],["chip-discount","discount"]].forEach(([id, sort]) => {
  document.getElementById(id).addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
    document.getElementById(id).classList.add("active");
    activeSort = sort;
    render();
  });
});

// ─── MODAL ─────────────────────────────────────────────────────────────────────
function openModal(id, name) {
  const code = String(Math.floor(1000 + Math.random() * 9000));
  document.getElementById("pickup-code").textContent = code;
  document.getElementById("modal-item").textContent  = name;
  document.getElementById("claim-modal").classList.add("open");
}

document.getElementById("close-modal").addEventListener("click", closeModal);
document.getElementById("claim-modal").addEventListener("click", e => {
  if (e.target === document.getElementById("claim-modal")) closeModal();
});
function closeModal() { document.getElementById("claim-modal").classList.remove("open"); }

// ─── UTILS ─────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ─── INIT ──────────────────────────────────────────────────────────────────────
fetchSales();
setInterval(fetchSales, 9000);   // poll every 9 s
