// feed.js — EcoPlate Consumer Feed

const FOOD_IMGS = {
  Cooked:  "/static/food_cooked.png",
  Bakery:  "/static/food_bakery.png",
  Produce: "/static/food_produce.png",
  Dairy:   "/static/food_dairy.png"
};
const PERI_EMOJI = { Dairy:"🥛", Cooked:"🍲", Bakery:"🥐", Produce:"🥬" };

let allSales   = [];
let activeSort = "all";
let activeCategory = "";
let cdTimers   = {};

// ─── FETCH ────────────────────────────────────────────────────────────────────
async function fetchSales() {
  try {
    const r = await fetch("/api/sales");
    if (!r.ok) return;
    allSales = await r.json();
    render();
    updateCount();
  } catch (_) {}
}

async function fetchStats() {
  try {
    const r = await fetch("/api/stats");
    if (!r.ok) return;
    const s = await r.json();
    const meals = document.getElementById("stat-meals");
    const co2   = document.getElementById("stat-co2");
    const sub   = document.getElementById("savings-text-sub");
    if (meals) meals.textContent = s.meals_saved ?? "–";
    if (co2)   co2.textContent   = (s.co2_avoided ?? 0).toFixed(1);
    if (sub) {
      const rev = (s.revenue_recovered ?? 0).toFixed(0);
      sub.textContent = `₹${rev} recovered · ${s.meals_saved ?? 0} meals rescued · ${(s.co2_avoided ?? 0).toFixed(1)} kg CO₂ avoided`;
    }
  } catch (_) {}
}

function updateCount() {
  const now = Date.now() / 1000;
  const el = document.getElementById("deal-count");
  if (el) el.textContent = allSales.filter(s => s.expires_at > now).length;
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function render() {
  const list  = document.getElementById("deals-list");
  const empty = document.getElementById("empty-state");

  Object.values(cdTimers).forEach(clearInterval);
  cdTimers = {};

  const sales = sorted();
  if (!sales.length) {
    list.innerHTML = "";
    empty.style.display = "flex";
    return;
  }
  empty.style.display = "none";

  // Stagger animation by adding delay per card
  list.innerHTML = sales.map((s, i) => buildCard(s, i)).join("");

  list.querySelectorAll(".js-claim").forEach(btn => {
    btn.addEventListener("click", () =>
      openModal(btn.dataset.id, btn.dataset.item, btn.dataset.vendor));
  });

  sales.forEach(s => startCD(s.id, s.expires_at));
}

function sorted() {
  const now  = Date.now() / 1000;
  let list   = [...allSales];

  // Category filter
  if (activeCategory) {
    list = list.filter(s => s.perishability === activeCategory);
  }

  // Sort
  if (activeSort === "ending") {
    list = list.filter(s => s.expires_at > now);
    list.sort((a, b) => a.expires_at - b.expires_at);
  } else if (activeSort === "discount") {
    list.sort((a, b) => b.discount_pct - a.discount_pct);
  } else {
    list.sort((a, b) => {
      const ae = a.expires_at < now, be = b.expires_at < now;
      if (ae !== be) return ae ? 1 : -1;
      return b.published_at - a.published_at;
    });
  }
  return list;
}

// ─── CARD ─────────────────────────────────────────────────────────────────────
function buildCard(s, index = 0) {
  const now     = Date.now() / 1000;
  const expired = s.expires_at < now;
  const discRnd = Math.round(s.discount_pct);
  const imgSrc  = FOOD_IMGS[s.perishability] || FOOD_IMGS.Cooked;
  const emoji   = PERI_EMOJI[s.perishability] || "🍽️";
  const delay   = index * 0.06;

  return `
<article class="deal-card${expired ? " expired" : ""}" id="card-${s.id}" style="animation-delay:${delay}s">
  <div class="card-img-wrap">
    <img src="${imgSrc}" alt="${esc(s.item)}"
      onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
    <div class="img-fallback">${emoji}</div>
    <div class="card-gradient"></div>
    <div class="badge-discount">
      <span class="material-symbols-rounded">local_fire_department</span>
      ${discRnd}% OFF
    </div>
    <div class="badge-peri">${esc(s.perishability)}</div>
    ${expired ? `<div class="badge-expired-overlay"><span>Expired</span></div>` : ""}
  </div>
  <div class="card-body">
    <div class="card-top">
      <div>
        <div class="card-name">${esc(s.item)}</div>
        <div class="card-vendor">
          <span class="material-symbols-rounded">storefront</span>
          ${esc(s.vendor)}
        </div>
      </div>
      <div class="card-price-block">
        <div class="price-now">₹${s.suggested_price}</div>
        <div class="price-was">₹${s.original_price}</div>
      </div>
    </div>

    <div class="card-meta">
      <div class="meta-item">
        <span class="material-symbols-rounded" style="color:${expired?"#4b5a6e":"#f59e0b"}">inventory_2</span>
        ${expired ? "Sold out" : `${s.qty} left`}
      </div>
      <div class="meta-divider"></div>
      <div class="meta-item ${expired ? "" : "live"}">
        <span class="material-symbols-rounded" style="color:${expired?"#4b5a6e":"#f59e0b"}">timer</span>
        ${expired
          ? `<span style="color:var(--text-dim)">Closed</span>`
          : `<span class="countdown" id="cd-${s.id}">…</span>`
        }
      </div>
    </div>

    <button
      class="claim-btn${expired ? " disabled" : ""} js-claim"
      data-id="${s.id}"
      data-item="${esc(s.item)}"
      data-vendor="${esc(s.vendor)}"
      ${expired ? "disabled" : ""}
    >
      <span class="material-symbols-rounded">${expired ? "block" : "shopping_cart_checkout"}</span>
      ${expired ? "Unavailable" : "Claim Deal"}
    </button>
  </div>
</article>`;
}

// ─── COUNTDOWN ───────────────────────────────────────────────────────────────
function startCD(id, expiresAt) {
  const el = document.getElementById(`cd-${id}`);
  if (!el) return;

  function tick() {
    const rem = expiresAt - Date.now() / 1000;
    if (rem <= 0) {
      clearInterval(cdTimers[id]);
      const card = document.getElementById(`card-${id}`);
      if (card) card.classList.add("expired");
      if (el)   el.textContent = "Closed";
      updateCount();
      return;
    }
    const h = Math.floor(rem / 3600);
    const m = Math.floor((rem % 3600) / 60);
    const sec = Math.floor(rem % 60);
    const p = n => String(n).padStart(2, "0");
    el.textContent = h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
    if (rem < 900) el.classList.add("urgent");
    else el.classList.remove("urgent");
  }
  tick();
  cdTimers[id] = setInterval(tick, 1000);
}

// ─── FILTER CHIPS ─────────────────────────────────────────────────────────────
const sortChips = [["chip-all","all"],["chip-ending","ending"],["chip-discount","discount"]];
const catChips  = [["chip-cooked","Cooked"],["chip-bakery","Bakery"],
                   ["chip-produce","Produce"],["chip-dairy","Dairy"]];

function setChipState(activeId, group) {
  group.forEach(([id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("active", id === activeId);
  });
}

sortChips.forEach(([id, sort]) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("click", () => {
    activeSort = sort;
    setChipState(id, sortChips);
    render();
  });
});

catChips.forEach(([id, cat]) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("click", () => {
    if (activeCategory === cat) {
      activeCategory = "";
      el.classList.remove("active");
    } else {
      activeCategory = cat;
      catChips.forEach(([cid]) => document.getElementById(cid)?.classList.remove("active"));
      el.classList.add("active");
    }
    render();
  });
});

// ─── MANUAL REFRESH ───────────────────────────────────────────────────────────
async function manualRefresh() {
  const icon = document.getElementById("refresh-icon");
  if (icon) icon.classList.add("spin");
  await Promise.all([fetchSales(), fetchStats()]);
  setTimeout(() => icon?.classList.remove("spin"), 400);
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function openModal(id, item, vendor) {
  const code = String(Math.floor(1000 + Math.random() * 9000));
  document.getElementById("modal-item-name").textContent = item + " · " + vendor;
  document.getElementById("modal-order-id").textContent  = "Order ID: #ECP-" + code;
  document.getElementById("claim-modal").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  document.getElementById("claim-modal").classList.remove("open");
  document.body.style.overflow = "";
}

document.getElementById("close-modal").addEventListener("click", closeModal);
document.getElementById("claim-modal").addEventListener("click", e => {
  if (e.target === document.getElementById("claim-modal")) closeModal();
});

function esc(s) {
  return String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
fetchSales();
fetchStats();
setInterval(fetchSales, 9000);
setInterval(fetchStats, 30000);
