# Onspot Symposium Registration

Full-stack web application for public symposium registrations with a separate admin panel for event management and payment verification.

## Features

- Public registration page with no login requirement
- Multi-event selection for participants
- Payment proof upload support
- Admin login secured with JWT
- Event create, edit, delete, and active/inactive controls
- Registration approval, rejection, and pending review workflow
- Event-wise registration counts
- CSV export for participant records
- Responsive UI for mobile and desktop usage

## Stack

- Frontend: React + Vite
- Backend: Express
- Database: MySQL

## Run locally

1. Install dependencies from the project root if needed:

```bash
npm install
npm install --prefix client
npm install --prefix server
```

2. If you are using XAMPP, start `MySQL` from the XAMPP Control Panel first.

3. Create a database such as `onspot` using phpMyAdmin or MySQL Workbench.

4. Copy the backend environment template:

```bash
copy server\\.env.example server\\.env
```

5. Update `server/.env` with your database connection values.

For XAMPP, the usual local values are:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=onspot
```

6. Start the frontend and backend together:

```bash
npm run dev
```

7. Open:

- Public registration: `http://localhost:5173`
- Admin panel: `http://localhost:5173/admin`

## Default admin credentials

- Username: `admin`
- Password: `admin123`

Change these in [server/.env.example](/d:/Project/Onspot/server/.env.example) before deployment.

## Data storage

- MySQL database: managed through your MySQL server / MySQL Workbench
- Uploaded payment proofs: `server/uploads/`

## Build

```bash
npm run build
```

## XAMPP / MySQL Workbench

This project can connect to:

- XAMPP MariaDB
- MySQL Server

If you use XAMPP:

- Start `Apache` only if you need phpMyAdmin
- Start `MySQL` from the XAMPP Control Panel
- Create the `onspot` database
- Keep `DB_USER=root`
- Keep `DB_PASSWORD=` unless you explicitly set a root password in XAMPP

You can still use MySQL Workbench to:

- Create the database
- Open and inspect the `admins`, `events`, and `registrations` tables
- Run SQL queries or manual edits
- Manage the MySQL connection used by the app

The backend creates the tables and seeds default records on first successful startup.
