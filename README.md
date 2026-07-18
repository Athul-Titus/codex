# EcoPlate 🌿

**EcoPlate** is a B2B Dynamic Pricing SaaS + consumer broadcast tool built for a 2-hour hackathon MVP. It allows restaurants, cafes, and hotels to easily calculate optimal clearance prices for surplus food items before closing, generate AI-optimized broadcast marketing copy, and stream deals to a public consumer live feed.

### 🔗 Live Demo
- **Consumer Live Feed:** [codex-tau-orcin.vercel.app](https://codex-tau-orcin.vercel.app/)
- **Vendor Portal:** [codex-tau-orcin.vercel.app/vendor](https://codex-tau-orcin.vercel.app/vendor)

---

## 🚀 Key Features

1. **AI-Powered Dynamic Pricing Engine**
   - Leverages **GPT-4o-Mini** (via OpenAI API) in JSON structured mode to calculate optimal, context-aware clearance prices based on the food item name, original price, quantity, perishability, and remaining hours.
   - **Intelligent Fallback:** Automatically switches to a deterministic mathematical algorithm if no API key is present or the API request fails.
2. **GPT-4o-Mini Broadcast Assistant**
   - High-quality social copy generation (with emojis & tags) tailored to drive urgency on Instagram, WhatsApp, or Twitter.
3. **Live Consumer Feed**
   - Automatically polls the server every 9 seconds.
   - Shows active discounts, time-to-close countdowns, and real-time inventory count.
   - Allows claiming an item instantly, rendering a mock claim ticket & scan code.
4. **Real-time Sustainability & Financial Analytics**
   - Tracks **Revenue Recovered**, **Meals Rescued**, and **CO₂ Avoided** (calculated as `2.5 kg CO₂` per meal rescued).
   - Generates interactive, CSS-rendered charts to visualize:
     - Discount distributions.
     - Sales counts by Category.
     - Revenue trends over the session.
5. **Interactive B2B Sidebar Navigation**
   - Fully client-routed, single-page dashboard panels:
     - **Dashboard:** Surplus pricing configuration & engine.
     - **Inventory:** View, filter, and delete active listings.
     - **Marketplace:** Public-facing summary statistics.
     - **Analytics:** Data metrics and charts.
     - **Sustainability:** Deep-dive carbon reduction stats.
     - **Support & FAQ:** Explanatory guides.
     - **Settings:** Profile controls.

---

## 📁 Project Structure

```
├── requirements.txt       # Global dependencies for Vercel/Render hosting (Flask, OpenAI, Gunicorn)
├── vercel.json            # Vercel serverless function routing configuration
├── api/
│   └── index.py           # Vercel serverless entry point
├── ecoplate/
│   ├── app.py             # Flask server + AI dynamic pricing engine + OpenAI integration
│   ├── requirements.txt   # Core local project dependencies
│   ├── .env               # Ignored configuration file containing API keys
│   ├── /templates
│   │   ├── vendor.html    # Clean, modern B2B dashboard (tab-switches, forms, widgets)
│   │   ├── feed.html      # Clean, modern consumer feed (countdown timer, modals, claim)
│   └── /static
│       ├── /js
│       │   ├── vendor.js  # Dashboard controller (polling, charts, AI call, toast API)
│       │   └── feed.js    # Consumer feed controller (countdown loops, filter chips)
```

---

## 🛠️ Setting Up & Running Locally

### 1. Pre-requisites
Ensure you have Python 3.10+ installed.

### 2. Installation
Navigate to the directory and install dependencies:
```bash
pip install -r requirements.txt
```

### 3. API Keys (OpenAI Integration)
Create a `.env` file in the `/ecoplate` directory:
```
OPENAI_API_KEY=your-openai-api-key
```
*Note: If no key is provided, the app gracefully falls back to the deterministic dynamic pricing algorithm and template text generator.*

### 4. Start Server
Run the Flask application:
```bash
python ecoplate/app.py
```

Open your browser to:
- **Consumer Feed:** `http://localhost:5000/`
- **Vendor Portal:** `http://localhost:5000/vendor`

---

## 📊 Dynamic Pricing Logic
When an API key is available, the Clearance Strategy Engine queries `gpt-4o-mini` to compute context-aware pricing. Under fallback conditions, the dynamic engine applies the following heuristic:
$$\text{Discount} = (\text{Urgency Factor} \times 75\%) \times \text{Perishability Multiplier} \pm 4\% \text{ Random Variance}$$
Clamped strictly between $15\%$ and $80\%$ maximum clearance discounts.
* CO₂ impact is mapped as $2.5\text{ kg CO}_{2}\text{e}$ per meal rescued from landfill.
* Tree carbon sequestration equivalent is based on a standard rate of $22\text{ kg CO}_{2}$ absorbed per mature tree per year.
