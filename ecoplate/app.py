import random
import math
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

# ---------------------------------------------------------------------------
# In-memory data store — no external DB required
# ---------------------------------------------------------------------------
ACTIVE_SALES = []

# ---------------------------------------------------------------------------
# Mock Machine Learning Pricing Engine
# ---------------------------------------------------------------------------
def calculate_optimal_price(original_price: float, qty: int, hours_left: float) -> dict:
    """
    Simulates a regression/classification model for dynamic clearance pricing.

    Key rules:
    - Urgency factor: fewer hours → steeper discount
    - Volume factor: more items left → steeper discount (harder to clear)
    - Random variance ± 3 % to feel authentic
    """

    # --- Urgency score (0.0 – 1.0, higher = more urgent) ---
    urgency = 1.0 - (hours_left / 2.0)          # 0.5 h → 0.75 | 2 h → 0.0
    urgency = max(0.0, min(1.0, urgency))

    # --- Volume score (0.0 – 1.0, higher = harder to clear) ---
    # Sigmoid-like normalisation: qty 1→low, qty 30+→high
    volume = 1.0 / (1.0 + math.exp(-0.15 * (qty - 10)))

    # --- Base discount % ---
    base_discount = 0.20 + (urgency * 0.35) + (volume * 0.20)

    # Random variance ± 3 %
    variance = random.uniform(-0.03, 0.03)
    discount = min(max(base_discount + variance, 0.15), 0.80)   # clamp 15 %–80 %

    suggested_price = round(original_price * (1 - discount))
    discount_pct    = round(discount * 100)

    return {
        "suggested_price": suggested_price,
        "discount_pct":    discount_pct,
        "original_price":  original_price,
    }


def generate_broadcast_text(item: str, qty: int, suggested_price: float,
                             original_price: float, hours_left: float,
                             vendor_name: str = "EcoPlate Partner") -> str:
    """Returns a FOMO-inducing broadcast message."""
    time_str = (
        "30 minutes" if hours_left <= 0.5
        else ("1 hour" if hours_left <= 1.0 else "2 hours")
    )
    emojis = ["🔥", "🚨", "⚡", "🎯"]
    emoji  = random.choice(emojis)

    return (
        f"{emoji} Flash Sale at {vendor_name}! "
        f"{qty} {item}{'s' if qty > 1 else ''} left for just ₹{int(suggested_price)}! "
        f"(was ₹{int(original_price)}) "
        f"Grab them before we close in {time_str}. "
        f"First come, first served! Limited stock — act NOW! 🏃"
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def feed():
    """Public consumer live feed."""
    now = datetime.utcnow()
    live = [s for s in ACTIVE_SALES if s["expires_at"] > now]
    ACTIVE_SALES[:] = live  # prune in-place

    enriched = []
    for sale in live:
        s = dict(sale)
        delta_secs = (s["expires_at"] - now).total_seconds()
        s["minutes_left"] = max(0, int(delta_secs // 60))
        s["expires_ts"]   = int(s["expires_at"].timestamp() * 1000)  # JS epoch ms
        enriched.append(s)

    return render_template("feed.html", sales=enriched)


@app.route("/vendor")
def vendor():
    """Vendor dashboard."""
    return render_template("vendor.html")


@app.route("/api/calculate", methods=["POST"])
def api_calculate():
    """
    Accepts: { item, qty, original_price, hours_left, vendor_name? }
    Returns: { suggested_price, discount_pct, broadcast_text, estimated_revenue }
    """
    try:
        data         = request.get_json(force=True)
        item         = str(data.get("item", "Item")).strip() or "Item"
        qty          = int(data.get("qty", 1))
        orig_price   = float(data.get("original_price", 100))
        hours_left   = float(data.get("hours_left", 1))
        vendor_name  = str(data.get("vendor_name", "EcoPlate Partner")).strip() or "EcoPlate Partner"

        if qty <= 0 or orig_price <= 0 or hours_left <= 0:
            return jsonify({"error": "qty, original_price, and hours_left must be positive."}), 400

        pricing        = calculate_optimal_price(orig_price, qty, hours_left)
        broadcast_text = generate_broadcast_text(
            item, qty, pricing["suggested_price"],
            orig_price, hours_left, vendor_name
        )

        return jsonify({
            "suggested_price":    pricing["suggested_price"],
            "discount_pct":       pricing["discount_pct"],
            "original_price":     orig_price,
            "estimated_revenue":  round(pricing["suggested_price"] * qty),
            "broadcast_text":     broadcast_text,
        })

    except (ValueError, TypeError) as e:
        return jsonify({"error": f"Invalid input: {str(e)}"}), 400


@app.route("/api/publish", methods=["POST"])
def api_publish():
    """
    Accepts: { item, qty, suggested_price, original_price, discount_pct, hours_left, vendor_name }
    Appends to ACTIVE_SALES. Returns success + sale_id.
    """
    try:
        data = request.get_json(force=True)

        required = ["item", "qty", "suggested_price", "original_price", "hours_left"]
        for field in required:
            if field not in data:
                return jsonify({"error": f"Missing field: {field}"}), 400

        hours_left  = float(data["hours_left"])
        expires_at  = datetime.utcnow() + timedelta(hours=hours_left)

        sale = {
            "id":             len(ACTIVE_SALES) + 1,
            "item":           str(data["item"]).strip(),
            "qty":            int(data["qty"]),
            "suggested_price":float(data["suggested_price"]),
            "original_price": float(data["original_price"]),
            "discount_pct":   int(data.get("discount_pct", 0)),
            "vendor_name":    str(data.get("vendor_name", "EcoPlate Partner")).strip(),
            "hours_left":     hours_left,
            "expires_at":     expires_at,
        }

        ACTIVE_SALES.append(sale)

        return jsonify({
            "success": True,
            "sale_id": sale["id"],
            "message": f"'{sale['item']}' is now live on the EcoPlate feed!",
        })

    except (ValueError, TypeError) as e:
        return jsonify({"error": f"Invalid input: {str(e)}"}), 400


# ---------------------------------------------------------------------------
if __name__ == "__main__":
    app.run(debug=True, port=5000)
