require('dotenv').config();
const express = require('express');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── OpenRouter Setup ─────────────────────────────────────────────────────────
const ai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});
const MODEL_NAME = 'qwen/qwen3.6-plus-preview:free';

// ─── Restaurant System Prompt ─────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Zara, a friendly and efficient AI assistant for Karachi Bites, an authentic Pakistani fast-food restaurant in Karachi. Your job is to warmly greet customers, help them explore the menu, take their orders step by step, and answer common questions.

RESTAURANT INFO:
- Name: Karachi Bites
- Location: Block 4, Clifton, Karachi
- Opening Hours: 12:00 PM – 12:00 AM (daily)
- Phone: 0300-1234567
- Delivery Time: 30–45 minutes
- Payment Methods: Cash on Delivery, Easypaisa, JazzCash

FULL MENU:
🍔 BURGERS:
- Zinger Burger – Rs. 350
- Double Patty Burger – Rs. 450
- Chicken Burger – Rs. 300
- BBQ Burger – Rs. 400
- Veggie Burger – Rs. 250

🍕 PIZZA:
- Margherita Pizza – Rs. 800
- Pepperoni Pizza – Rs. 950
- BBQ Chicken Pizza – Rs. 900
- Veggie Supreme Pizza – Rs. 850
- Meat Lovers Pizza – Rs. 1000

🥤 DRINKS:
- Coke – Rs. 150
- Sprite – Rs. 150
- Fanta – Rs. 150
- Lassi – Rs. 200
- Fresh Juice – Rs. 250

🍮 DESSERTS:
- Brownie – Rs. 300
- Ice Cream – Rs. 200
- Gulab Jamun – Rs. 150
- Kheer – Rs. 180
- Cake Slice – Rs. 250

YOUR BEHAVIOR RULES:
1. Greet customers warmly in English. Be friendly and professional.
2. When showing the menu, format it clearly with categories and prices.
3. To take an order, ask step by step:
   a. What items they want and quantity
   b. Delivery or pickup?
   c. If delivery: ask for their full address
   d. Confirm the complete order with total price before finalizing
4. Calculate total correctly based on the menu prices above.
5. Once the customer confirms the order, respond with a confirmation message AND include this special tag at the END of your response (do not show this tag to the customer visually, but include it):
   <ORDER_CONFIRMED>{"items": [{"name": "Item Name", "qty": 1, "price": 350}], "type": "delivery", "address": "customer address or null for pickup", "total": 350}</ORDER_CONFIRMED>
6. For FAQs answer confidently:
   - Hours: 12 PM to 12 AM daily
   - Location: Block 4, Clifton, Karachi
   - Delivery time: 30-45 minutes
   - Payment: Cash on delivery, Easypaisa, JazzCash
7. If a customer seems angry, very confused, or has a complaint you can't resolve, say: "I understand your concern. Let me connect you to our team — please call us at 0300-1234567 and we'll sort this out right away!"
8. Keep responses concise but warm. Use emojis occasionally to make it friendly.
9. Never make up prices. Only use prices listed in the menu above.
10. After confirming an order, tell them an order number will be generated and estimated delivery/pickup time.`;

// ─── Data Helpers ─────────────────────────────────────────────────────────────
const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');
const CONVERSATIONS_FILE = path.join(__dirname, 'data', 'conversations.json');

function readOrders() {
  try {
    const data = fs.readFileSync(ORDERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function writeOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

function readConversations() {
  try {
    const data = fs.readFileSync(CONVERSATIONS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function writeConversations(conversations) {
  fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(conversations, null, 2));
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Routes: Pages ────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ─── Routes: Chat API ─────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body;

  if (!message || !sessionId) {
    return res.status(400).json({ error: 'message and sessionId are required' });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured. Please add it to your .env file.' });
  }

  try {
    const conversations = readConversations();
    let history = conversations[sessionId] || [];

    // Cap history to last 30 messages to control token usage
    if (history.length > 30) {
      history = history.slice(-30);
    }

    // Build messages array for OpenAI-compatible API
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.map(h => ({
        role: h.role === 'model' ? 'assistant' : h.role,
        content: h.parts[0].text,
      })),
      { role: 'user', content: message },
    ];

    const result = await ai.chat.completions.create({
      model: MODEL_NAME,
      messages,
    });

    const rawResponse = result.choices[0].message.content;

    // Parse order from response if present
    let cleanResponse = rawResponse;
    let orderCreated = false;
    let orderId = null;

    const orderMatch = rawResponse.match(/<ORDER_CONFIRMED>([\s\S]*?)<\/ORDER_CONFIRMED>/);
    if (orderMatch) {
      try {
        const orderData = JSON.parse(orderMatch[1]);
        orderId = uuidv4();
        const newOrder = {
          id: orderId,
          sessionId,
          items: orderData.items || [],
          type: orderData.type || 'delivery',
          address: orderData.address || null,
          total: orderData.total || 0,
          status: 'pending',
          createdAt: new Date().toISOString(),
        };

        const orders = readOrders();
        orders.push(newOrder);
        writeOrders(orders);
        orderCreated = true;
      } catch (parseErr) {
        console.error('Order parse error:', parseErr.message);
      }

      // Remove the tag from the visible response
      cleanResponse = rawResponse.replace(/<ORDER_CONFIRMED>[\s\S]*?<\/ORDER_CONFIRMED>/g, '').trim();
    }

    // Save updated conversation history (without system prompt, just user/model turns)
    const updatedHistory = [
      ...history,
      { role: 'user', parts: [{ text: message }] },
      { role: 'model', parts: [{ text: rawResponse }] },
    ];
    conversations[sessionId] = updatedHistory;
    writeConversations(conversations);

    res.json({
      reply: cleanResponse,
      sessionId,
      orderCreated,
      orderId: orderCreated ? `KB-${orderId.split('-')[0].toUpperCase()}` : null,
    });
  } catch (err) {
    console.error('Gemini API full error:', err);

    if (err.message && err.message.includes('API_KEY_INVALID')) {
      return res.status(500).json({ error: 'Invalid Gemini API key. Please check your .env file.' });
    }
    if (err.message && err.message.includes('QUOTA')) {
      return res.status(429).json({ error: 'API quota exceeded. Please try again later.' });
    }

    res.status(500).json({ error: err.message || 'Something went wrong. Please try again.' });
  }
});

// ─── Routes: Orders API ───────────────────────────────────────────────────────
app.get('/api/orders', (req, res) => {
  const orders = readOrders();
  res.json(orders);
});

app.patch('/api/orders/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const orders = readOrders();
  const idx = orders.findIndex(o => o.id === id);

  if (idx === -1) {
    return res.status(404).json({ error: 'Order not found' });
  }

  orders[idx].status = status;
  orders[idx].updatedAt = new Date().toISOString();
  writeOrders(orders);

  res.json(orders[idx]);
});

app.delete('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  const orders = readOrders();
  const filtered = orders.filter(o => o.id !== id);

  if (filtered.length === orders.length) {
    return res.status(404).json({ error: 'Order not found' });
  }

  writeOrders(filtered);
  res.json({ success: true });
});

// ─── Routes: Stats API ────────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const orders = readOrders();
  const today = new Date().toDateString();

  const todayOrders = orders.filter(o => new Date(o.createdAt).toDateString() === today);
  const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const pendingOrders = orders.filter(o => ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status)).length;

  // Count popular items
  const itemCounts = {};
  orders.forEach(order => {
    (order.items || []).forEach(item => {
      itemCounts[item.name] = (itemCounts[item.name] || 0) + (item.qty || 1);
    });
  });
  const popularItems = Object.entries(itemCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  res.json({
    totalOrders: orders.length,
    todayOrders: todayOrders.length,
    pendingOrders,
    todayRevenue,
    totalRevenue,
    popularItems,
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🍔 Karachi Bites AI Agent running at http://localhost:${PORT}`);
  console.log(`📊 Admin dashboard at http://localhost:${PORT}/admin`);
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn('\n⚠️  WARNING: OPENROUTER_API_KEY is not set in .env file!\n');
  }
});
