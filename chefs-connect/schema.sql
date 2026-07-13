-- ============================================
-- ChefsConnect - Database Schema
-- ============================================
-- STEP 1: Create the database first (only once):
--     CREATE DATABASE chefs_connect;
-- STEP 2: Connect to it, then run everything below (pgAdmin Query Tool, or psql \i)

-- Users: customers, waiters, chefs all share one table with a role
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('customer','waiter','chef')),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Restaurant tables (for dine-in)
CREATE TABLE IF NOT EXISTS tables (
    id SERIAL PRIMARY KEY,
    table_number INTEGER UNIQUE NOT NULL,
    capacity INTEGER DEFAULT 4,
    status VARCHAR(20) NOT NULL DEFAULT 'free' CHECK (status IN ('free','occupied'))
);

-- Menu categories (Starters, Main Course, Beverages, etc.)
CREATE TABLE IF NOT EXISTS menu_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL
);

-- Menu items
CREATE TABLE IF NOT EXISTS menu_items (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES menu_categories(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    price NUMERIC(10,2) NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES users(id),
    waiter_id INTEGER REFERENCES users(id),
    table_id INTEGER REFERENCES tables(id),
    order_type VARCHAR(20) NOT NULL CHECK (order_type IN ('dine_in','takeaway')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','preparing','ready','served','billed','paid','cancelled')),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Order line items
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
    item_name VARCHAR(100) NOT NULL,   -- snapshot, in case menu item is edited later
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price_at_order NUMERIC(10,2) NOT NULL,
    item_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (item_status IN ('pending','preparing','ready')),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Bills
CREATE TABLE IF NOT EXISTS bills (
    id SERIAL PRIMARY KEY,
    order_id INTEGER UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    subtotal NUMERIC(10,2) NOT NULL,
    tax NUMERIC(10,2) NOT NULL,
    discount NUMERIC(10,2) NOT NULL DEFAULT 0,
    total NUMERIC(10,2) NOT NULL,
    payment_method VARCHAR(20) CHECK (payment_method IN ('cash','card','upi')),
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Feedback (customer rates a completed, paid order)
CREATE TABLE IF NOT EXISTS feedback (
    id SERIAL PRIMARY KEY,
    order_id INTEGER UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL REFERENCES users(id),
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_status ON order_items(item_status);

-- ============================================
-- Seed data so the app isn't empty on first run
-- ============================================

INSERT INTO tables (table_number, capacity) VALUES
(1,2),(2,2),(3,4),(4,4),(5,6),(6,4),(7,2),(8,4)
ON CONFLICT (table_number) DO NOTHING;

INSERT INTO menu_categories (name) VALUES
('Starters'), ('Main Course'), ('Breads'), ('Desserts'), ('Beverages')
ON CONFLICT (name) DO NOTHING;

INSERT INTO menu_items (category_id, name, description, price) VALUES
((SELECT id FROM menu_categories WHERE name='Starters'), 'Paneer Tikka', 'Grilled cottage cheese with spices', 220.00),
((SELECT id FROM menu_categories WHERE name='Starters'), 'Veg Spring Rolls', 'Crispy rolls with vegetable filling', 180.00),
((SELECT id FROM menu_categories WHERE name='Main Course'), 'Butter Chicken', 'Creamy tomato-based chicken curry', 320.00),
((SELECT id FROM menu_categories WHERE name='Main Course'), 'Paneer Butter Masala', 'Cottage cheese in rich tomato gravy', 280.00),
((SELECT id FROM menu_categories WHERE name='Main Course'), 'Veg Biryani', 'Fragrant rice with mixed vegetables', 250.00),
((SELECT id FROM menu_categories WHERE name='Breads'), 'Butter Naan', 'Soft leavened bread with butter', 60.00),
((SELECT id FROM menu_categories WHERE name='Breads'), 'Garlic Roti', 'Whole wheat bread with garlic', 45.00),
((SELECT id FROM menu_categories WHERE name='Desserts'), 'Gulab Jamun', 'Milk dumplings in sugar syrup', 90.00),
((SELECT id FROM menu_categories WHERE name='Beverages'), 'Masala Chai', 'Spiced Indian tea', 40.00),
((SELECT id FROM menu_categories WHERE name='Beverages'), 'Fresh Lime Soda', 'Refreshing lime drink', 70.00)
ON CONFLICT DO NOTHING;
