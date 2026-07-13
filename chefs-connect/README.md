# ChefsConnect — Restaurant Management System

A full restaurant ordering & billing system with **3 role-based modules**:

- **Customer** — browse menu by category, cart, place dine-in/takeaway orders, track live order status, view bill, leave feedback
- **Waiter** — table grid (free/occupied), active order queue, assign orders, mark served, generate bill (auto tax + discount), collect payment (frees the table automatically)
- **Chef** — kitchen queue (only pending/preparing items), mark items preparing → ready, manage the menu (add items, toggle availability)

**Order lifecycle:** `pending → preparing → ready → served → billed → paid`
(an order auto-moves to "preparing" when the chef starts the first item, and to "ready" automatically once every item in it is marked ready)

---

## 1. Create the database

You already have PostgreSQL + pgAdmin installed from your last project — just repeat the same steps with a new database name:

1. Open **pgAdmin 4**
2. Right-click **Databases → Create → Database**, name it:
   ```
   chefs_connect
   ```
3. Click on `chefs_connect` to select it → **Tools → Query Tool**
4. Open `schema.sql` from this project, copy all of it, paste into the Query Tool, run with **F5**
5. You should see `users`, `tables`, `menu_categories`, `menu_items`, `orders`, `order_items`, `bills`, `feedback` under Tables — and the menu/tables come pre-filled with sample data so the app isn't empty on first run.

## 2. Open in VS Code

1. Extract this project folder fully (make sure `server.js`, `.env`, `routes/`, `middleware/`, `utils/` are all directly inside — not nested one level too deep)
2. File → Open Folder → select the extracted `chefs-connect` folder
3. Open `.env` and set your real PostgreSQL password:
   ```
   PGPASSWORD=your_actual_password
   ```

## 3. Install & run

In the VS Code terminal:
```
npm install
npm start
```
You should see:
```
✅ Connected to PostgreSQL
🚀 ChefsConnect running at http://localhost:3000
```

Open **http://localhost:3000**

## 4. Try it out

Since all 3 roles log into the same app, the easiest way to test the full flow is to sign up 3 separate accounts (one per role) — you can use the same browser in separate tabs, or use one normal window + one incognito window so two sessions don't overwrite each other's login.

1. **Sign up as a Customer** → go to Menu → add items to cart → Checkout (choose Dine-in + a table, or Takeaway)
2. **Sign up as a Chef** (separate browser tab/incognito) → go to Kitchen → Start Preparing → Mark Ready on each item
3. **Sign up as a Waiter** (another tab) → Dashboard → Assign the order to yourself → once it shows "ready", Mark Served → Generate Bill → Mark as Paid
4. Back in the **Customer** tab → refresh the order page → see the bill → leave feedback

---

## Project structure
```
chefs-connect/
├── server.js              ← entry point, wires up routes + sessions
├── db.js                  ← PostgreSQL connection pool
├── schema.sql              ← run once in pgAdmin — creates tables + sample menu/table data
├── package.json
├── .env                    ← fill in your DB password
├── middleware/
│   └── auth.js              ← login check + role-based access control
├── routes/
│   ├── auth.js               ← signup/login/logout (role picked at signup)
│   ├── customer.js            ← menu, cart, checkout, order tracking, feedback
│   ├── waiter.js               ← dashboard, tables, assign/serve, billing, payment
│   └── chef.js                  ← kitchen queue, item status, menu management
└── utils/
    └── layout.js               ← shared HTML page layout + small helpers
```

## For your project report / viva

- **Frontend:** server-rendered HTML (generated in each route file), shared layout/CSS in `utils/layout.js`
- **Backend:** Node.js + Express, organized into role-based route modules (`routes/customer.js`, `routes/waiter.js`, `routes/chef.js`) with middleware-enforced role access control
- **Database:** PostgreSQL, 8 tables with foreign key relationships — `orders → order_items → menu_items`, `orders → bills`, `orders → feedback`, `orders → tables`
- **Transactions:** checkout uses a database transaction (`BEGIN`/`COMMIT`/`ROLLBACK`) so an order and its table can never be created inconsistently if something fails mid-way
- **Auth:** bcrypt password hashing + `express-session`, single `users` table with a `role` column, middleware (`requireRole`) restricts each route group to its role
- **State machine:** the `orders.status` and `order_items.item_status` columns implement an explicit workflow (pending → preparing → ready → served → billed → paid), enforced with PostgreSQL `CHECK` constraints

## Common issues

| Problem | Fix |
|---|---|
| `role "..." does not exist` | Your `.env` isn't being read — make sure `.env` sits directly next to `server.js`, not in a subfolder, and restart `npm start` after any edit |
| `relation "orders" does not exist` | Run `schema.sql` in the `chefs_connect` database via pgAdmin |
| Can't see other roles' updates | Each role should be tested in a separate browser session (normal window + incognito), since login is one session per browser |
| Port 3000 in use | Change `PORT` in `.env` |
