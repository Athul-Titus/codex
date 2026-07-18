// feed.js — wired to Stitch-designed feed.html

const PERI_EMOJI = { Dairy:"🥛", Cooked:"🍲", Bakery:"🥐", Produce:"🥬" };

let allSales   = [];
let activeSort = "all";
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

function updateCount() {
  const now = Date.now() / 1000;
  document.getElementById("deal-count").textContent =
    allSales.filter(s => s.expires_at > now).length;
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
    empty.style.display = "";
    return;
  }
  empty.style.display = "none";
  list.innerHTML = sales.map(buildCard).join("");

  list.querySelectorAll(".js-claim").forEach(btn => {
    btn.addEventListener("click", () => openModal(btn.dataset.id, btn.dataset.item, btn.dataset.vendor));
  });
  sales.forEach(s => startCD(s.id, s.expires_at));
}

function sorted() {
  const now = Date.now() / 1000;
  let list  = [...allSales];
  if (activeSort === "ending")   list.sort((a, b) => a.expires_at - b.expires_at);
  else if (activeSort === "discount") list.sort((a, b) => b.discount_pct - a.discount_pct);
  else {
    list.sort((a, b) => {
      const ae = a.expires_at < now, be = b.expires_at < now;
      if (ae !== be) return ae ? 1 : -1;
      return b.published_at - a.published_at;
    });
  }
  return list;
}

// ─── FOOD IMAGES per perishability ───────────────────────────────────────────
const FOOD_IMGS = {
  Cooked:  "/static/food_cooked.png",
  Bakery:  "/static/food_bakery.png",
  Produce: "/static/food_produce.png",
  Dairy:   "/static/food_dairy.png"
};

// ─── CARD ─────────────────────────────────────────────────────────────────────
function buildCard(s) {
  const now     = Date.now() / 1000;
  const expired = s.expires_at < now;
  const discRnd = Math.round(s.discount_pct);
  const imgSrc  = FOOD_IMGS[s.perishability] || FOOD_IMGS.Cooked;
  const emoji   = PERI_EMOJI[s.perishability] || "🍽️";

  return `
<article class="bg-[#1e293b] border border-outline/20 rounded-xl overflow-hidden shadow-sm relative${expired ? " opacity-50" : ""}" id="card-${s.id}">
  <div class="h-40 relative w-full overflow-hidden">
    <img src="${imgSrc}" alt="${esc(s.item)}"
      class="w-full h-full object-cover"
      onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
    <div class="absolute inset-0 bg-gray-800 items-center justify-center hidden">
      <span class="text-5xl">${emoji}</span>
    </div>
    <div class="absolute inset-0 bg-gradient-to-t from-[#0f172a]/80 via-transparent to-transparent"></div>
    <div class="absolute top-2 left-2 bg-secondary text-on-secondary font-label-sm text-label-sm px-2 py-1 rounded shadow-sm font-bold flex items-center gap-1">
      <span class="material-symbols-outlined text-[14px]">local_fire_department</span>
      ${discRnd}% OFF
    </div>
    <div class="absolute top-2 right-2 bg-[#1e293b]/80 backdrop-blur-sm text-surface-variant font-label-mono text-label-mono px-2 py-0.5 rounded text-[10px] uppercase">${s.perishability}</div>
    ${expired ? `<div class="absolute inset-0 bg-black/60 flex items-center justify-center">
      <span class="font-label-mono text-label-mono text-white uppercase tracking-widest bg-black/50 px-4 py-2 rounded">Expired</span>
    </div>` : ""}
  </div>
  <div class="p-4">
    <div class="flex justify-between items-start mb-2">
      <div>
        <h2 class="font-headline-md text-headline-md text-on-surface font-semibold mb-1 text-white" style="font-size:1rem">${esc(s.item)}</h2>
        <div class="flex items-center gap-1 text-outline">
          <span class="material-symbols-outlined text-[14px]">storefront</span>
          <span class="font-label-sm text-label-sm uppercase">${esc(s.vendor)}</span>
        </div>
      </div>
      <div class="text-right">
        <div class="text-secondary font-display-metrics text-[24px] font-bold leading-none mb-1">&#x20B9;${s.suggested_price}</div>
        <div class="text-outline font-label-mono text-label-mono line-through">&#x20B9;${s.original_price}</div>
      </div>
    </div>
    <div class="flex items-center justify-between mt-4 p-3 bg-surface-container-highest/10 rounded-lg border border-outline/10">
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined ${expired ? "text-outline" : "text-secondary"} text-[16px]">inventory_2</span>
        <span class="font-label-sm text-label-sm text-surface-variant">${expired ? "Sold out" : s.qty + " items left"}</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined ${expired ? "text-outline" : "text-secondary"} text-[16px]">timer</span>
        ${expired
          ? `<span class="font-label-mono text-label-mono text-outline">Closed</span>`
          : `<span class="countdown font-label-mono text-label-mono text-secondary pulse-text font-bold" id="cd-${s.id}">...</span>`
        }
      </div>
    </div>
    <button
      class="w-full mt-4 font-label-sm text-label-sm py-3 rounded-lg flex items-center justify-center gap-2 shadow-sm js-claim
        ${expired
          ? "bg-[#1e293b] text-outline border border-outline/20 cursor-not-allowed"
          : "bg-primary text-on-primary hover:bg-primary-container transition-colors active:translate-y-px"}"
      data-id="${s.id}"
      data-item="${esc(s.item)}"
      data-vendor="${esc(s.vendor)}"
      ${expired ? "disabled" : ""}
    >
      <span class="material-symbols-outlined text-[18px]">${expired ? "block" : "shopping_cart_checkout"}</span>
      ${expired ? "Unavailable" : "Claim Now"}
    </button>
  </div>
</article>`;
}

function iconFor(peri) {
  const map = { Dairy: "water_drop", Cooked: "soup_kitchen", Bakery: "bakery_dining", Produce: "eco" };
  return map[peri] || "restaurant";
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
      if (card) card.classList.add("opacity-50");
      if (el)   el.textContent = "Closed";
      updateCount();
      return;
    }
    const h = Math.floor(rem / 3600);
    const m = Math.floor((rem % 3600) / 60);
    const s = Math.floor(rem % 60);
    const p = n => String(n).padStart(2, "0");
    el.textContent = h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
    if (rem < 900) el.classList.add("urgent");
  }
  tick();
  cdTimers[id] = setInterval(tick, 1000);
}

// ─── FILTER CHIPS ─────────────────────────────────────────────────────────────
[["chip-all","all"],["chip-ending","ending"],["chip-discount","discount"]].forEach(([id, sort]) => {
  document.getElementById(id).addEventListener("click", () => {
    document.querySelectorAll("#chip-all,#chip-ending,#chip-discount").forEach(c => {
      c.className = "bg-[#1e293b] text-surface-variant border border-outline/20 px-4 py-2 rounded-full font-label-sm text-label-sm hover:bg-[#1e293b]/80 transition-colors";
    });
    document.getElementById(id).className =
      "bg-primary text-on-primary border border-primary-container px-4 py-2 rounded-full font-label-sm text-label-sm hover:bg-primary-container transition-colors";
    activeSort = sort;
    render();
  });
});

// ─── MODAL ────────────────────────────────────────────────────────────────────
function openModal(id, item, vendor) {
  const code = String(Math.floor(1000 + Math.random() * 9000));
  document.getElementById("modal-item-name").textContent = item + " at " + vendor;
  document.getElementById("modal-order-id").textContent  = "Order ID: #ECP-" + code;
  document.getElementById("claim-modal").classList.add("open");
}

document.getElementById("close-modal").addEventListener("click", closeModal);
document.getElementById("claim-modal").addEventListener("click", e => {
  if (e.target === document.getElementById("claim-modal")) closeModal();
});
function closeModal() { document.getElementById("claim-modal").classList.remove("open"); }

function esc(s) {
  return String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
fetchSales();
setInterval(fetchSales, 9000);
