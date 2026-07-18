import random, time, uuid, os
from flask import Flask, render_template, request, jsonify
from openai import OpenAI

app = Flask(__name__)

# ── Load .env file manually if exists ──────────────────────────────────────────
env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip() and not line.strip().startswith("#"):
                parts = line.strip().split("=", 1)
                if len(parts) == 2:
                    os.environ[parts[0].strip()] = parts[1].strip()

# ── OpenAI client ──────────────────────────────────────────────────────────────
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
_oai = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

# ── SESSION STATS ──────────────────────────────────────────────────────────────
SESSION_STATS = {"revenue_recovered": 0.0, "meals_saved": 0, "co2_avoided": 0.0}

# ── PERISHABILITY MULTIPLIERS ──────────────────────────────────────────────────
PERI_MULT = {"Dairy": 1.12, "Cooked": 1.08, "Bakery": 1.0, "Produce": 1.0}

# ── MOCK ML ────────────────────────────────────────────────────────────────────
def calculate_optimal_price(original_price, qty, hours_left, perishability="Cooked"):
    if original_price <= 0 or qty <= 0:
        return (original_price, 0.0, 82)
    time_factor   = max(0.0, 1.0 - min(hours_left, 3.0) / 3.0)
    qty_factor    = min(qty, 40) / 40.0
    urgency       = time_factor * 0.65 + qty_factor * 0.35
    base_discount = urgency * 75.0 * PERI_MULT.get(perishability, 1.0)
    base_discount += random.uniform(-4.0, 4.0)
    discount_pct  = round(max(15.0, min(80.0, base_discount)), 1)
    suggested_price  = round(original_price * (1.0 - discount_pct / 100.0), 2)
    return (suggested_price, discount_pct, random.randint(82, 96))

# ── SEED DATA ──────────────────────────────────────────────────────────────────
def _seed(item, vendor, qty, orig, disc, hrs, peri):
    sp  = round(orig * (1 - disc/100), 2)
    now = time.time()
    return {"id": str(uuid.uuid4()), "item": item, "vendor": vendor, "qty": qty,
            "original_price": float(orig), "suggested_price": float(sp),
            "discount_pct": float(disc), "perishability": peri,
            "broadcast_text": f"EcoPlate: {qty} portions of {item} at Rs.{sp} ({disc}% OFF)! #EcoPlate",
            "expires_at": now + hrs*3600, "published_at": now}

ACTIVE_SALES = [
    _seed("Paneer Butter Masala",  "Hotel Abad Plaza",  8,  220, 45.0, 1.5,  "Cooked"),
    _seed("Assorted Pastries Box", "Baker Street Cafe", 12, 350, 35.0, 0.75, "Bakery"),
    _seed("Fresh Fruit Salad",     "The Green Bowl",    6,  180, 50.0, 0.5,  "Produce"),
]
for _s in ACTIVE_SALES:
    SESSION_STATS["revenue_recovered"] += _s["suggested_price"] * _s["qty"]
    SESSION_STATS["meals_saved"]       += _s["qty"]
    SESSION_STATS["co2_avoided"]       += _s["qty"] * 2.5

# ── ROUTES ─────────────────────────────────────────────────────────────────────
@app.route("/")
def feed(): return render_template("feed.html")

@app.route("/vendor")
def vendor(): return render_template("vendor.html")

@app.route("/api/sales")
def api_sales(): return jsonify(list(ACTIVE_SALES))

@app.route("/api/stats")
def api_stats(): return jsonify(SESSION_STATS)

@app.route("/api/calculate", methods=["POST"])
def api_calculate():
    d = request.get_json(force=True) or {}
    try:
        item  = str(d.get("item","")).strip()
        vendor= str(d.get("vendor","My Restaurant")).strip()
        qty   = int(d["qty"]); orig = float(d["original_price"])
        hrs   = float(d["hours_left"]); peri = str(d.get("perishability","Cooked"))
    except Exception as e: return jsonify({"error": str(e)}), 400
    if not item: return jsonify({"error": "Item name required."}), 400
    if qty<=0:   return jsonify({"error": "Quantity must be >0."}), 400
    if orig<=0:  return jsonify({"error": "Price must be >0."}), 400
    sp, disc, conf = calculate_optimal_price(orig, qty, hrs, peri)
    rev  = round(sp * qty, 2)
    tlbl = "30 min" if hrs<=0.5 else ("1 hr" if hrs<=1 else "2 hrs")
    btxt = (f"EcoPlate Alert! {qty} portions of {item} at Rs.{sp} "
            f"({disc}% OFF original Rs.{orig}). Pickup within {tlbl}! "
            f"#EcoPlate #SurplusFood #ZeroWaste")
    return jsonify({"suggested_price":sp,"discount_pct":disc,"confidence_score":conf,
                    "revenue_recovery":rev,"broadcast_text":btxt})

@app.route("/api/publish", methods=["POST"])
def api_publish():
    d = request.get_json(force=True) or {}
    try:
        item=str(d.get("item","")).strip(); vendor=str(d.get("vendor","My Restaurant")).strip()
        qty=int(d["qty"]); orig=float(d["original_price"]); sp=float(d["suggested_price"])
        disc=float(d["discount_pct"]); hrs=float(d["hours_left"])
        peri=str(d.get("perishability","Cooked")); btxt=str(d.get("broadcast_text","")).strip()
    except Exception as e: return jsonify({"error":str(e)}), 400
    if not item: return jsonify({"error":"Item name required."}), 400
    if qty<=0:   return jsonify({"error":"Quantity must be >0."}), 400
    now = time.time()
    sale = {"id":str(uuid.uuid4()),"item":item,"vendor":vendor or "My Restaurant",
            "qty":qty,"original_price":orig,"suggested_price":sp,"discount_pct":disc,
            "perishability":peri,"broadcast_text":btxt,
            "expires_at":now+hrs*3600,"published_at":now}
    ACTIVE_SALES.append(sale)
    SESSION_STATS["revenue_recovered"] += sp*qty
    SESSION_STATS["meals_saved"]       += qty
    SESSION_STATS["co2_avoided"]       += qty*2.5
    return jsonify({"success":True,"id":sale["id"]})

@app.route("/api/ai-broadcast", methods=["POST"])
def ai_broadcast():
    if not _oai:
        return jsonify({"error":"OpenAI API key not configured."}), 503
    d = request.get_json(force=True) or {}
    item=d.get("item","Food"); vendor=d.get("vendor","Restaurant")
    qty=d.get("qty",1); orig=d.get("original_price",100)
    sp=d.get("suggested_price",50); disc=d.get("discount_pct",50); hrs=d.get("hours_left",1)
    try:
        resp = _oai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role":"system","content":
                "You write urgent, friendly social media posts for surplus food rescue. "
                "Use 2-3 sentences, relevant emojis, and hashtags. Keep it under 280 chars if possible."},
               {"role":"user","content":
                f"Write a broadcast for: {qty} portions of '{item}' at '{vendor}' "
                f"discounted {disc:.0f}% from Rs.{orig} to Rs.{sp}. "
                f"Pickup window: {hrs} hour(s)."}],
            max_tokens=120, temperature=0.8
        )
        return jsonify({"broadcast_text": resp.choices[0].message.content.strip()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/delete-sale", methods=["POST"])
def delete_sale():
    d = request.get_json(force=True) or {}
    sale_id = d.get("id","")
    global ACTIVE_SALES
    ACTIVE_SALES = [s for s in ACTIVE_SALES if s["id"] != sale_id]
    return jsonify({"success": True})

if __name__ == "__main__":
    app.run(debug=True, port=5000)
