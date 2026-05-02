#!/usr/bin/env python3
"""Customer service chatbot for product info and store hours queries."""

import os
import anthropic

# ── Store data ──────────────────────────────────────────────────────────────

STORE_HOURS = {
    "Monday":    {"open": "9:00 AM",  "close": "8:00 PM"},
    "Tuesday":   {"open": "9:00 AM",  "close": "8:00 PM"},
    "Wednesday": {"open": "9:00 AM",  "close": "8:00 PM"},
    "Thursday":  {"open": "9:00 AM",  "close": "9:00 PM"},
    "Friday":    {"open": "9:00 AM",  "close": "9:00 PM"},
    "Saturday":  {"open": "10:00 AM", "close": "7:00 PM"},
    "Sunday":    {"open": "11:00 AM", "close": "5:00 PM"},
}

PRODUCTS = [
    {
        "name": "Wireless Bluetooth Headphones",
        "sku": "WBH-001",
        "price": 79.99,
        "category": "Electronics",
        "description": "Over-ear headphones with 30-hour battery life and active noise cancellation.",
        "in_stock": True,
        "warranty": "1 year",
    },
    {
        "name": "Ergonomic Office Chair",
        "sku": "EOC-202",
        "price": 249.99,
        "category": "Furniture",
        "description": "Adjustable lumbar support, breathable mesh back, 5-year frame warranty.",
        "in_stock": True,
        "warranty": "5 years",
    },
    {
        "name": "Stainless Steel Water Bottle",
        "sku": "SWB-055",
        "price": 24.99,
        "category": "Kitchen",
        "description": "1-litre double-wall insulated bottle, keeps drinks cold 24 h / hot 12 h.",
        "in_stock": True,
        "warranty": "Lifetime",
    },
    {
        "name": "Fitness Tracker Watch",
        "sku": "FTW-310",
        "price": 129.99,
        "category": "Electronics",
        "description": "Heart-rate monitor, GPS, sleep tracking, 7-day battery, water-resistant.",
        "in_stock": False,
        "warranty": "2 years",
    },
    {
        "name": "Portable Laptop Stand",
        "sku": "PLS-088",
        "price": 39.99,
        "category": "Accessories",
        "description": "Aluminium foldable stand, compatible with laptops 10–17 inches.",
        "in_stock": True,
        "warranty": "2 years",
    },
    {
        "name": "Organic Green Tea (50 bags)",
        "sku": "OGT-120",
        "price": 12.99,
        "category": "Food & Beverage",
        "description": "USDA-certified organic, individually wrapped, antioxidant-rich.",
        "in_stock": True,
        "warranty": "Best before 18 months from manufacture",
    },
]

# ── System prompt ────────────────────────────────────────────────────────────

def _format_hours() -> str:
    lines = []
    for day, times in STORE_HOURS.items():
        lines.append(f"  {day}: {times['open']} – {times['close']}")
    return "\n".join(lines)


def _format_products() -> str:
    lines = []
    for p in PRODUCTS:
        stock = "In Stock" if p["in_stock"] else "Out of Stock"
        lines.append(
            f"- {p['name']} (SKU: {p['sku']})\n"
            f"    Price: ${p['price']:.2f} | Category: {p['category']} | {stock}\n"
            f"    Description: {p['description']}\n"
            f"    Warranty: {p['warranty']}"
        )
    return "\n".join(lines)


SYSTEM_PROMPT = f"""You are a friendly and helpful customer service assistant for ShopEase, \
an online and physical retail store. Your role is to help customers with:

1. PRODUCT INFORMATION – prices, availability, descriptions, warranties, SKUs.
2. STORE HOURS – opening and closing times for any day of the week.
3. GENERAL CUSTOMER SERVICE – returns policy, shipping, order help, and FAQs.

Always be polite, concise, and accurate. If you do not know something, say so honestly \
and offer to escalate to a human agent.

━━━━━━━━━━━ STORE HOURS ━━━━━━━━━━━
{_format_hours()}

━━━━━━━━━━━ PRODUCT CATALOG ━━━━━━━
{_format_products()}

━━━━━━━━━━━ POLICIES ━━━━━━━━━━━━━━
Returns: 30-day hassle-free returns on all items with original packaging.
Shipping: Free standard shipping on orders over $50. Express shipping available.
Payment: We accept Visa, MasterCard, PayPal, and Apple Pay.

Respond only based on the information above. Do not invent products, prices, or policies.
"""

# ── Chat engine ──────────────────────────────────────────────────────────────

class CustomerServiceChatbot:
    def __init__(self, model: str = "claude-sonnet-4-6"):
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise EnvironmentError(
                "ANTHROPIC_API_KEY environment variable is not set.\n"
                "Export it before running:  export ANTHROPIC_API_KEY=sk-ant-..."
            )
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model
        self.history: list[dict] = []

    def chat(self, user_message: str) -> str:
        self.history.append({"role": "user", "content": user_message})
        response = self.client.messages.create(
            model=self.model,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=self.history,
        )
        assistant_reply = response.content[0].text
        self.history.append({"role": "assistant", "content": assistant_reply})
        return assistant_reply

    def reset(self):
        self.history.clear()


# ── CLI ──────────────────────────────────────────────────────────────────────

BANNER = """
╔══════════════════════════════════════════════════════╗
║         ShopEase Customer Service Chatbot            ║
║  Ask about products, store hours, returns & more!    ║
╚══════════════════════════════════════════════════════╝
Type  'quit' or 'exit' to leave  |  'reset' to start over
"""

EXAMPLE_QUERIES = [
    "What are your store hours on Saturday?",
    "Do you have the Fitness Tracker Watch in stock?",
    "How much does the ergonomic chair cost?",
    "What is your return policy?",
    "What time do you open on Sundays?",
]


def main():
    print(BANNER)
    print("Example questions you can ask:")
    for q in EXAMPLE_QUERIES:
        print(f"  • {q}")
    print()

    bot = CustomerServiceChatbot()

    while True:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nGoodbye! Have a great day.")
            break

        if not user_input:
            continue

        if user_input.lower() in {"quit", "exit"}:
            print("Bot: Thank you for shopping with ShopEase. Goodbye!")
            break

        if user_input.lower() == "reset":
            bot.reset()
            print("Bot: Conversation reset. How can I help you?\n")
            continue

        try:
            reply = bot.chat(user_input)
            print(f"\nBot: {reply}\n")
        except anthropic.APIStatusError as e:
            print(f"\n[API Error {e.status_code}]: {e.message}\n")
        except anthropic.APIConnectionError:
            print("\n[Connection Error]: Could not reach the API. Check your network.\n")


if __name__ == "__main__":
    main()
