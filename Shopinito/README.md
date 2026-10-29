# Shopinito

A responsive marketplace starter with a frontend demo and an Express/PostgreSQL backend scaffold.

## 1. Open the project
Open the `Shopinito` folder in VS Code.

## 2. Preview the frontend
Recommended: install the **Live Server** extension in VS Code, right-click `frontend/index.html`, then choose **Open with Live Server**.

The frontend has a demo mode using browser localStorage for sample products, cart, favourites, and demo messages. This is for development only and is not secure storage for a real marketplace.

## 3. Start the backend
Install Node.js, then in the VS Code terminal run:
```bash
npm install
```
Create a local `.env` file by copying `.env.example` and updating the values. Never publish your `.env` file.

Create a PostgreSQL database named `shopinito`, then run `database/schema.sql` in that database using a PostgreSQL tool such as `psql` or pgAdmin.

Start the API:
```bash
npm run dev
```
The API runs at `http://localhost:3000`.

## Notes
- This is a starter project, not a production-ready marketplace.
- Authentication routes use JWT and password hashing, but before public launch add rate limiting, email verification, password reset flow, validation, audit logs, secure deployment settings, and security review.
- Payment integration is intentionally not enabled. Multi-seller payments, refunds, seller verification, delivery disputes, and compliance must be configured and tested with a payment provider before accepting real money.
- Never store card details yourself or expose sellers' private payment details publicly.
