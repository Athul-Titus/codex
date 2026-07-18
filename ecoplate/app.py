import random
import time
import uuid
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

# ── SESSION STATS (grows as vendors publish) ───────────────────────────────────
SESSION_STATS = {
    "revenue_recovered": 0.0,
    "meals_saved": 0,
    "co2_avoided": 0.0,
}

# ── PERISHABILITY SPOILAGE-RISK MULTIPLIERS ────────────────────────────────────
PERISHABILITY_MULTIPLIER = {
    "Dairy":   1.12,
    "Cooked":  1.08,
    "Bakery":  1.0,
    "Produce": 1.0,
}

# ── MOCK ML PRICING ENGINE ─────────────────────────────────────────────────────
def calculate_optimal_price(original_price, qty, hours_left, perishability="Cooked"):
    """
    Deterministic rule-based pricing with +/-4% random variance.
    Calibration: 1 hr + 20 items ~70% off | 2 hr + 5 items ~30% off
    """
    if original_price <= 0 or qty <= 0:
        return (original_price, 0.0, 82)

    time_factor   = max(0.0, 1.0 - min(hours_left, 3.0) / 3.0)
    qty_factor    = min(qty, 40) / 40.0
    urgency       = time_factor * 0.65 + qty_factor * 0.35
    base_discount = urgency * 75.0

    multiplier    = PERISHABILITY_MULTIPLIER.get(perishability, 1.0)
    base_discount *= multiplier
    base_discount += random.uniform(-4.0, 4.0)

    discount_pct     = round(max(15.0, min(80.0, base_discount)), 1)
    suggested_price  = round(original_price * (1.0 - discount_pct / 100.0), 2)
    confidence_score = random.randint(82, 96)

    return (suggested_price, discount_pct, confidence_score)


def _make_seed(item, vendor, qty, original_price, discount_pct, hours_left, perishability):
    suggested_price = round(original_price * (1.0 - discount_pct / 100.0), 2)
    now = time.time()
    return {
        "id":             str(uuid.uuid4()),
        "item":           item,
        "vendor":         vendor,
        "qty":            qty,
        "original_price": float(original_price),
        "suggested_price": float(suggested_price),
        "discount_pct":   float(discount_pct),
        "perishability":  perishability,
        "broadcast_text": (
            f"EcoPlate Alert! {qty} portions of {item} at Rs.{suggested_price} "
            f"({discount_pct}% OFF). Freshly rescued - pickup before closing! #EcoPlate"
        ),
        "expires_at":   now + hours_left * 3600.0,
        "published_at": now,
    }


ACTIVE_SALES = [
    _make_seed("Paneer Butter Masala",  "Hotel Abad Plaza",  8,  220, 45.0, 1.5,  "Cooked"),
    _make_seed("Assorted Pastries Box", "Baker Street Cafe", 12, 350, 35.0, 0.75, "Bakery"),
    _make_seed("Fresh Fruit Salad",     "The Green Bowl",    6,  180, 50.0, 0.5,  "Produce"),
]

for _s in ACTIVE_SALES:
    SESSION_STATS["revenue_recovered"] += _s["suggested_price"] * _s["qty"]
    SESSION_STATS["meals_saved"]       += _s["qty"]
    SESSION_STATS["co2_avoided"]       += _s["qty"] * 2.5


@app.route("/")
def feed():
    return render_template("feed.html")


@app.route("/vendor")
def vendor():
    return render_template("vendor.html")


@app.route("/api/sales")
def api_sales():
    return jsonify(list(ACTIVE_SALES))


@app.route("/api/stats")
def api_stats():
    return jsonify(SESSION_STATS)


@app.route("/api/calculate", methods=["POST"])
def api_calculate():
    data = request.get_json(force=True) or {}
    try:
        item           = str(data.get("item",          "")).strip()
        vendor         = str(data.get("vendor",        "My Restaurant")).strip()
        qty            = int(data["qty"])
        original_price = float(data["original_price"])
        hours_left     = float(data["hours_left"])
        perishability  = str(data.get("perishability", "Cooked"))
    except (KeyError, ValueError, TypeError) as exc:
        return jsonify({"error": f"Invalid input: {exc}"}), 400

    if not item:
        return jsonify({"error": "Item name is required."}), 400
    if qty <= 0:
        return jsonify({"error": "Quantity must be greater than 0."}), 400
    if original_price <= 0:
        return jsonify({"error": "Original price must be greater than 0."}), 400
    if hours_left <= 0:
        return jsonify({"error": "Time left must be greater than 0."}), 400

    suggested_price, discount_pct, confidence_score = calculate_optimal_price(
        original_price, qty, hours_left, perishability
    )
    revenue_recovery = round(suggested_price * qty, 2)

    time_label = (
        "30 minutes" if hours_left <= 0.5 else
        "1 hour"     if hours_left <= 1.0 else
        "2 hours"
    )
    broadcast_text = (
        f"EcoPlate Alert! {qty} portions of {item} now available at just Rs.{suggested_price} "
        f"({discount_pct}% OFF original Rs.{original_price}). "
        f"Freshly rescued food - pickup within {time_label}. "
        f"Don't miss out! #EcoPlate #SurplusFood #ZeroWaste"
    )

    return jsonify({
        "suggested_price":  suggested_price,
        "discount_pct":     discount_pct,
        "confidence_score": confidence_score,
        "revenue_recovery": revenue_recovery,
        "broadcast_text":   broadcast_text,
    })


@app.route("/api/publish", methods=["POST"])
def api_publish():
    data = request.get_json(force=True) or {}
    try:
        item            = str(data.get("item",            "")).strip()
        vendor          = str(data.get("vendor",          "My Restaurant")).strip()
        qty             = int(data["qty"])
        original_price  = float(data["original_price"])
        suggested_price = float(data["suggested_price"])
        discount_pct    = float(data["discount_pct"])
        hours_left      = float(data["hours_left"])
        perishability   = str(data.get("perishability",  "Cooked"))
        broadcast_text  = str(data.get("broadcast_text", "")).strip()
    except (KeyError, ValueError, TypeError) as exc:
        return jsonify({"error": f"Invalid input: {exc}"}), 400

    if not item:
        return jsonify({"error": "Item name is required."}), 400
    if qty <= 0:
        return jsonify({"error": "Quantity must be greater than 0."}), 400

    now  = time.time()
    sale = {
        "id":             str(uuid.uuid4()),
        "item":           item,
        "vendor":         vendor or "My Restaurant",
        "qty":            qty,
        "original_price": original_price,
        "suggested_price": suggested_price,
        "discount_pct":   discount_pct,
        "perishability":  perishability,
        "broadcast_text": broadcast_text,
        "expires_at":     now + hours_left * 3600.0,
        "published_at":   now,
    }
    ACTIVE_SALES.append(sale)

    SESSION_STATS["revenue_recovered"] += suggested_price * qty
    SESSION_STATS["meals_saved"]       += qty
    SESSION_STATS["co2_avoided"]       += qty * 2.5

    return jsonify({"success": True, "id": sale["id"]})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
