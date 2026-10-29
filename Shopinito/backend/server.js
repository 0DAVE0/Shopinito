require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "shopinito-demo-secret";
const allowedOrigins = [
  process.env.CLIENT_ORIGIN,
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));
app.use(express.json({ limit: "1mb" }));

const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
const useDemoMode = !process.env.DATABASE_URL;

const demoUsers = [];
const demoProducts = [
  { id: "p1", seller_id: "demo-seller", name: "Everyday Sneakers", description: "Comfortable everyday sneakers with a clean, versatile look.", price: 18500, category: "Fashion", condition: "New", location: "Lagos", image_url: "", status: "active", created_at: new Date().toISOString() },
  { id: "p2", seller_id: "demo-seller", name: "Wireless Headphones", description: "Wireless headphones for music, calls and study sessions.", price: 27500, category: "Electronics", condition: "Like new", location: "Abuja", image_url: "", status: "active", created_at: new Date().toISOString() },
  { id: "p3", seller_id: "demo-seller", name: "Minimal Wristwatch", description: "A simple wristwatch that works with everyday outfits.", price: 22000, category: "Fashion", condition: "New", location: "Lagos", image_url: "", status: "active", created_at: new Date().toISOString() }
];
const demoMessages = [];

function requireConfig(req, res, next) {
  if (!process.env.JWT_SECRET && !useDemoMode) {
    return res.status(500).json({ error: "Server JWT_SECRET is not configured." });
  }
  next();
}

function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Sign in required." });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { sub: decoded.sub || decoded.id || "demo-user", email: decoded.email || "demo@example.com" };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

const sanitizeUser = user => ({ id: user.id, name: user.name, email: user.email });
const createToken = user => jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "2h" });

app.get("/api/health", (req, res) =>
  res.json({ ok: true, service: "Shopinito API", mode: useDemoMode ? "demo" : "database" })
);

app.post("/api/auth/register", requireConfig, async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "Name, email and a password of at least 8 characters are required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    if (useDemoMode) {
      const exists = demoUsers.some(user => user.email === normalizedEmail);
      if (exists) return res.status(409).json({ error: "An account with this email already exists." });

      const user = {
        id: `user-${Date.now()}`,
        name: String(name).trim(),
        email: normalizedEmail,
        password_hash: await bcrypt.hash(password, 12),
        created_at: new Date().toISOString()
      };
      demoUsers.push(user);

      return res.status(201).json({ user: sanitizeUser(user), token: createToken(user) });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id, name, email, created_at",
      [String(name).trim(), normalizedEmail, hash]
    );
    const user = result.rows[0];
    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "2h" });
    res.status(201).json({ user, token });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "An account with this email already exists." });
    console.error(err);
    res.status(500).json({ error: "Could not create account." });
  }
});

app.post("/api/auth/login", requireConfig, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (useDemoMode) {
      const user = demoUsers.find(item => item.email === normalizedEmail);
      if (!user || !(await bcrypt.compare(String(password || ""), user.password_hash))) {
        return res.status(401).json({ error: "Email or password is incorrect." });
      }
      return res.json({ user: sanitizeUser(user), token: createToken(user) });
    }

    const result = await pool.query("SELECT id, name, email, password_hash FROM users WHERE email=$1", [normalizedEmail]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(String(password || ""), user.password_hash))) {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }
    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "2h" });
    res.json({ user: { id: user.id, name: user.name, email: user.email }, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not log in." });
  }
});

app.get("/api/products", async (req, res) => {
  try {
    if (useDemoMode) return res.json({ products: demoProducts });

    const q = String(req.query.q || "").trim();
    const category = String(req.query.category || "").trim();
    const values = [];
    const where = ["status = 'active'"];
    if (q) { values.push(`%${q}%`); where.push(`(name ILIKE $${values.length} OR description ILIKE $${values.length})`); }
    if (category) { values.push(category); where.push(`category = $${values.length}`); }
    const result = await pool.query(
      `SELECT id, seller_id, name, description, price, category, condition, location, image_url, created_at FROM products WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT 100`,
      values
    );
    res.json({ products: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load products." });
  }
});

app.post("/api/products", auth, async (req, res) => {
  try {
    const { name, description, price, category, condition, location, image_url } = req.body || {};
    if (!name || !category || !Number.isFinite(Number(price)) || Number(price) <= 0) {
      return res.status(400).json({ error: "Product name, category and a positive price are required." });
    }

    if (useDemoMode) {
      const product = {
        id: `p-${Date.now()}`,
        seller_id: req.user.sub,
        name: String(name).trim(),
        description: description || "",
        price: Number(price),
        category,
        condition: condition || "Used",
        location: location || "",
        image_url: image_url || null,
        status: "active",
        created_at: new Date().toISOString()
      };
      demoProducts.unshift(product);
      return res.status(201).json({ product });
    }

    const result = await pool.query(
      `INSERT INTO products (seller_id,name,description,price,category,condition,location,image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id,seller_id,name,description,price,category,condition,location,image_url,status,created_at`,
      [req.user.sub, String(name).trim(), description || "", Number(price), category, condition || "Used", location || "", image_url || null]
    );
    res.status(201).json({ product: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create listing." });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    if (useDemoMode) {
      const product = demoProducts.find(item => item.id === req.params.id);
      if (!product) return res.status(404).json({ error: "Product not found." });
      return res.json({ product });
    }

    const result = await pool.query("SELECT id,seller_id,name,description,price,category,condition,location,image_url,created_at FROM products WHERE id=$1 AND status='active'", [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: "Product not found." });
    res.json({ product: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load product." });
  }
});

app.get("/api/me", auth, async (req, res) => {
  try {
    if (useDemoMode) {
      const user = demoUsers.find(item => item.id === req.user.sub) || demoUsers[0];
      if (!user) return res.status(404).json({ error: "Account not found." });
      return res.json({ user: sanitizeUser(user) });
    }

    const result = await pool.query("SELECT id,name,email,location,created_at FROM users WHERE id=$1", [req.user.sub]);
    if (!result.rowCount) return res.status(404).json({ error: "Account not found." });
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load profile." });
  }
});

app.get("/api/messages", auth, async (req, res) => {
  try {
    if (useDemoMode) return res.json({ messages: demoMessages.filter(message => message.sender_id === req.user.sub || message.receiver_id === req.user.sub) });

    const result = await pool.query(
      `SELECT m.id,m.conversation_id,m.sender_id,m.body,m.created_at
       FROM messages m JOIN conversation_members cm ON cm.conversation_id=m.conversation_id
       WHERE cm.user_id=$1 ORDER BY m.created_at DESC LIMIT 100`, [req.user.sub]
    );
    res.json({ messages: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load messages." });
  }
});

app.post("/api/messages", auth, async (req, res) => {
  try {
    const { conversation_id, body } = req.body || {};
    if (!conversation_id || !String(body || "").trim()) {
      return res.status(400).json({ error: "Conversation and message are required." });
    }

    if (useDemoMode) {
      const message = {
        id: `msg-${Date.now()}`,
        conversation_id,
        sender_id: req.user.sub,
        body: String(body).trim(),
        created_at: new Date().toISOString()
      };
      demoMessages.unshift(message);
      return res.status(201).json({ message });
    }

    const member = await pool.query("SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2", [conversation_id, req.user.sub]);
    if (!member.rowCount) return res.status(403).json({ error: "You are not a member of this conversation." });
    const result = await pool.query("INSERT INTO messages (conversation_id,sender_id,body) VALUES ($1,$2,$3) RETURNING id,conversation_id,sender_id,body,created_at", [conversation_id, req.user.sub, String(body).trim()]);
    res.status(201).json({ message: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not send message." });
  }
});

app.use((req, res) => res.status(404).json({ error: "Route not found." }));

app.listen(PORT, () => {
  console.log(`Shopinito API listening on http://localhost:${PORT}${useDemoMode ? " (demo mode)" : ""}`);
});
