# TACT EV Charger Backend API

Backend API สำหรับ TACT Mobile Charger Application

## 🛠️ Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB
- **Language:** TypeScript
- **Auth:** JWT (JSON Web Token)
- **Password:** bcrypt

## 📁 Project Structure

```
tact-backend/
├── src/
│   ├── config/
│   │   └── database.ts      # MongoDB connection
│   ├── models/
│   │   ├── User.ts          # User schema
│   │   ├── Station.ts       # Station schema
│   │   ├── ChargingSession.ts
│   │   └── index.ts
│   ├── routes/
│   │   ├── auth.ts          # Auth routes
│   │   ├── stations.ts      # Station routes
│   │   ├── charging.ts      # Charging routes
│   │   └── index.ts
│   ├── middleware/
│   │   └── auth.ts          # JWT middleware
│   ├── seeds/
│   │   └── seed.ts          # Seed data
│   └── index.ts             # Entry point
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## 🚀 Getting Started

### 1. Install Dependencies

```bash
cd tact-backend
npm install
```

### 2. Setup Environment

```bash
# Copy example env file
cp .env.example .env

# Edit .env file with your settings
```

### 3. Setup MongoDB

**Option A: Local MongoDB**
```bash
# Install MongoDB locally
# macOS
brew install mongodb-community

# Start MongoDB
brew services start mongodb-community
```

**Option B: MongoDB Atlas (Cloud)**
1. Go to https://www.mongodb.com/atlas
2. Create a free cluster
3. Get connection string
4. Update `MONGODB_URI` in `.env`

### 4. Seed Database

```bash
npm run seed
```

### 5. Start Server

```bash
# Development (with hot reload)
npm run dev

# Production
npm run build
npm start
```

## 📡 API Endpoints

### Auth

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/api/auth/register` | Register new user | Public |
| POST | `/api/auth/login` | Login | Public |
| GET | `/api/auth/me` | Get current user | Private |
| PUT | `/api/auth/profile` | Update profile | Private |

### Stations

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/stations` | Get all stations | Public |
| GET | `/api/stations/:id` | Get single station | Public |
| POST | `/api/stations` | Create station | Admin |
| PUT | `/api/stations/:id` | Update station | Admin |
| DELETE | `/api/stations/:id` | Delete station | Admin |

### Charging

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/api/charging/start` | Start charging | Private |
| PUT | `/api/charging/:id/update` | Update session | Private |
| PUT | `/api/charging/:id/stop` | Stop charging | Private |
| PUT | `/api/charging/:id/fault` | Report fault | Private |
| GET | `/api/charging/active` | Get active session | Private |
| GET | `/api/charging/history` | Get history | Private |

## 🔐 Authentication

ใช้ JWT Token ในการ authenticate

```bash
# Header format
Authorization: Bearer <token>
```

## 📝 Example API Calls

### Register

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john",
    "email": "john@example.com",
    "password": "123456",
    "phone": "081-234-5678"
  }'
```

### Login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "test123"
  }'
```

### Get Stations

```bash
curl http://localhost:5000/api/stations
```

### Start Charging

```bash
curl -X POST http://localhost:5000/api/charging/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "stationId": "<station_id>",
    "chargerId": "ladprao-ccs2-01"
  }'
```

## 👤 Test Users (after seeding)

| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | Admin |
| testuser | test123 | User |

## 📄 License

MIT
