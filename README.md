# ChefsConnect – Workplace Cafeteria Management System

## Overview
ChefsConnect is a full-stack web application developed to simplify and automate cafeteria operations within an organization or multinational company (MNC). The system provides a centralized platform where employees can view the daily menu, place food orders, track order status, and submit feedback, while cafeteria staff efficiently manage food preparation, order processing, billing, and delivery.

The application improves the overall cafeteria experience by reducing manual processes, minimizing waiting time, and enabling smooth coordination between employees and cafeteria staff.

---

## 🔗 Live Demo

**Try it live:** https://chefs-connect.onrender.com

⏳ *Note: hosted on a free tier, so the first load may take ~30–50 seconds while the server wakes up. Thanks for your patience!*

Create your own account to try any of the three roles:

| Role | Sign up link |
|---|---|
| Customer | https://chefs-connect.onrender.com/signup |
| Chef | https://chefs-connect.onrender.com/signup |
| Waiter | https://chefs-connect.onrender.com/signup |

(Select your role from the dropdown on the signup form.)

---

## Features

### Employee Module
- Employee Registration and Login
- View Daily Menu
- Add Food Items to Cart
- Place Food Orders
- Track Order Status
- View Order History
- Submit Feedback

### Chef Module
- View Incoming Orders
- Manage Kitchen Queue
- Update Food Preparation Status
- Mark Orders as Ready
- Manage Menu Availability

### Waiter/Cafeteria Staff Module
- Manage Tables
- Assign Orders
- Generate Bills
- Update Payment Status
- Deliver Orders

---

## Technology Stack

### Frontend
- HTML5
- CSS3
- Bootstrap 5
- JavaScript

### Backend
- Node.js
- Express.js

### Database
- PostgreSQL

### Authentication
- Express Session
- BCrypt Password Hashing

### Deployment
- Render (Web Service + managed PostgreSQL)

### Version Control
- Git
- GitHub

---

## Project Structure

```
chefs-connect/
│
├── routes/
├── controllers/
├── models/
├── views/
├── public/
│   ├── css/
│   ├── js/
│   └── images/
├── schema.sql
├── package.json
├── .env.example
└── README.md
```

---

## Key Functionalities
- Secure role-based authentication
- Daily cafeteria menu management
- Food ordering and cart management
- Order tracking
- Billing and payment management
- Feedback collection
- PostgreSQL database integration
- Responsive user interface using Bootstrap

---

## Running Locally

```bash
git clone https://github.com/naikpoojagetoewit/chefs-connect.git
cd chefs-connect
npm install
cp .env.example .env      # then fill in your local PostgreSQL credentials
psql -U <your_pg_user> -d <your_db_name> -f schema.sql
npm start
```

Open **http://localhost:3000** in your browser.

---

## Deployment Notes

This project is deployed on [Render](https://render.com):

- **Web Service**
  - Build Command: `npm install`
  - Start Command: `npm start`
  - Root Directory: `chefs-connect`
- **Database:** Render PostgreSQL (free tier)
- **Environment Variables:** `DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV=production`

Since Render's free PostgreSQL expires after 30 days unless upgraded, and the free web service spins down when idle, this deployment is intended as a **portfolio/demo deployment**, not a production instance.

---

## Project Objective
The primary objective of ChefsConnect is to digitalize workplace cafeteria operations by providing employees with a convenient platform to order meals and enabling cafeteria staff to efficiently manage kitchen activities, billing, and order delivery.

The system enhances operational efficiency, reduces manual workload, and improves the dining experience for employees in corporate workplaces.

---

## Future Enhancements
- QR Code-based order pickup
- Online payment gateway integration
- Email notifications
- Push notifications
- AI-based meal recommendations
- Nutrition and calorie tracking
- Mobile application support

---

## Author
**Pooja N. Naik**
GitHub: https://github.com/naikpoojagetoewit
LinkedIn: https://www.linkedin.com/in/pooja-n-naik/

---

## License
This project was developed for learning, academic, and portfolio purposes.
