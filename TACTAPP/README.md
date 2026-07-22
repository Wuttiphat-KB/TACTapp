# TACT EV Charging Mobile Application

> เอกสารสำหรับระบบ TACT EV Charging พร้อม Generator Integration  
> Version: 1.0.0  
> Last Updated: 2025

---

## 📋 สารบัญ

1. [ภาพรวมระบบ](#1-ภาพรวมระบบ)
2. [สถาปัตยกรรม](#2-สถาปัตยกรรม)
3. [Frontend - Mobile App](#3-frontend---mobile-app)
4. [Backend - API Server](#4-backend---api-server)
5. [OCPP Integration](#5-ocpp-integration)
6. [PLC & Generator Communication](#6-plc--generator-communication)
7. [Database Schema](#7-database-schema)
8. [API Endpoints](#8-api-endpoints)
9. [Socket.IO Events](#9-socketio-events)
10. [Charging Flow](#10-charging-flow)
11. [Configuration](#11-configuration)
12. [Deployment](#12-deployment)

---

## 1. ภาพรวมระบบ

### 1.1 คำอธิบาย

TACT EV Charging Application เป็นระบบสำหรับควบคุมการชาร์จรถยนต์ไฟฟ้าผ่าน Mobile App โดยมีการผสานการทำงานกับ Generator สำหรับพื้นที่ที่ไม่มีไฟฟ้าจากกริด

### 1.2 Features หลัก

| Feature | รายละเอียด |
|---------|-----------|
| 🗺️ แผนที่สถานี | แสดงตำแหน่งสถานีชาร์จบน Google Maps |
| 🔌 เริ่ม/หยุดชาร์จ | ควบคุมการชาร์จผ่าน OCPP RemoteStart/Stop |
| 📊 Real-time Monitoring | แสดงข้อมูลการชาร์จแบบ real-time (SoC, Power, Energy) |
| 💰 คำนวณค่าใช้จ่าย | คำนวณค่าไฟฟ้าตาม kWh |
| 📱 Multi-language | รองรับภาษาไทยและอังกฤษ |
| 🔐 Authentication | ระบบ Login/Register พร้อม JWT |
| 📜 ประวัติการชาร์จ | ดูประวัติการชาร์จย้อนหลัง |

### 1.3 Technology Stack

| Layer | Technology |
|-------|------------|
| Mobile App | React Native + Expo SDK 54 |
| Styling | NativeWind (TailwindCSS) |
| Backend | Node.js + Express + TypeScript |
| Database | MongoDB + Mongoose |
| Real-time | Socket.IO |
| OCPP | OCPP 1.6J (JSON over WebSocket) |
| CSMS | Python-based CSMS Server |
| Maps | Google Maps SDK for Android |

---

## 2. สถาปัตยกรรม

### 2.1 System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐a
│                           TACT EV CHARGING SYSTEM                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────┐      ┌──────────────┐      ┌─────────────┐               │
│   │  Mobile  │ HTTP │   Backend    │ HTTP │    CSMS     │               │
│   │   App    │◄────►│   Server     │◄────►│   Server    │               │
│   │ (Expo)   │      │  (Express)   │      │  (Python)   │               │
│   └──────────┘      └──────────────┘      └─────────────┘               │
│        │                   │                     │                       │
│        │ Socket.IO         │ MongoDB             │ WebSocket             │
│        │                   │                     │ (OCPP 1.6J)           │
│        ▼                   ▼                     ▼                       │
│   ┌──────────┐      ┌──────────────┐      ┌─────────────┐               │
│   │ Real-time│      │   MongoDB    │      │   EdgeBox   │               │
│   │  Updates │      │   Database   │      │ (OCPP Client)│              │
│   └──────────┘      └──────────────┘      └─────────────┘               │
│                                                  │                       │
│                                                  │ HTTP (Local)          │
│                                                  ▼                       │
│                                           ┌─────────────┐               │
│                                           │     PLC     │               │
│                                           │  (CODESYS)  │               │
│                                           └─────────────┘               │
│                                                  │                       │
│                                          ┌───────┴───────┐              │
│                                          ▼               ▼              │
│                                    ┌──────────┐   ┌──────────┐          │
│                                    │Generator │   │ Charger  │          │
│                                    └──────────┘   │ (CCS2/AC)│          │
│                                                   └──────────┘          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Network Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLOUD / INTERNET                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Mobile App ◄──────► Backend Server ◄──────► CSMS Server       │
│   (User's Phone)      (212.80.215.42:5000)   (212.80.215.42:8080)│
│                                                                  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               │ WebSocket (OCPP 1.6J)
                               │ ws://212.80.215.42:9000
                               │
┌──────────────────────────────┴──────────────────────────────────┐
│                     LOCAL NETWORK (Charger Site)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   EdgeBox (OCPP Client) ◄──HTTP──► PLC (192.168.0.8/0.9)        │
│                                      │                           │
│                              ┌───────┴───────┐                   │
│                              ▼               ▼                   │
│                         Generator      EV Charger                │
│                                        (CCS2/AC)                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Port Configuration

| Service | Port | Protocol |
|---------|------|----------|
| Backend API | 5000 | HTTP |
| CSMS HTTP API | 8080 | HTTP |
| CSMS WebSocket | 9000 | WebSocket (OCPP) |
| MongoDB | 27017 | TCP |
| PLC (Connector 1) | 192.168.0.8 | HTTP |
| PLC (Connector 2) | 192.168.0.9 | HTTP |

---

## 3. Frontend - Mobile App

### 3.1 Project Structure

```
TACTAPP/
├── App.tsx                    # Main app component
├── app.json                   # Expo configuration
├── eas.json                   # EAS Build configuration
├── package.json
├── tsconfig.json
├── global.css                 # TailwindCSS globals
├── tailwind.config.js
├── assets/
│   ├── icon.png              # App icon (1024x1024)
│   ├── adaptive-icon.png     # Android adaptive icon
│   ├── splash.png            # Splash screen
│   └── images/
│       └── LOGOblack.png
└── src/
    ├── config/
    │   └── api.ts            # API configuration
    ├── contexts/
    │   ├── AuthContext.tsx   # Authentication state
    │   └── LanguageContext.tsx # i18n
    ├── components/
    │   ├── Header.tsx
    │   ├── BottomTabs.tsx
    │   ├── MdiIcon.tsx
    │   └── ...
    ├── screens/
    │   ├── index.ts          # Screen exports
    │   ├── LoadingScreen.tsx
    │   ├── LoginScreen.tsx
    │   ├── RegisterScreen.tsx
    │   ├── ForgotPasswordScreen.tsx
    │   ├── MainScreen.tsx    # Map view
    │   ├── ChargerScreen.tsx # Station detail
    │   ├── ChargingScreen.tsx # Active charging
    │   ├── FinishingScreen.tsx
    │   ├── ChargingHistoryScreen.tsx
    │   ├── ProfileScreen.tsx
    │   ├── ContactScreen.tsx
    │   └── FaultScreen.tsx
    ├── services/
    │   ├── api.ts            # API client
    │   └── socket.ts         # Socket.IO client
    ├── types/
    │   └── index.ts          # TypeScript types
    └── utils/
        └── mapper.ts         # Data mappers
```

### 3.2 Key Dependencies

```json
{
  "dependencies": {
    "expo": "~54.0.0",
    "react": "18.3.1",
    "react-native": "0.76.9",
    "react-native-maps": "^1.20.1",
    "expo-location": "~18.0.10",
    "socket.io-client": "^4.7.4",
    "@react-native-async-storage/async-storage": "2.1.2",
    "nativewind": "^4.1.23",
    "@expo/vector-icons": "^14.0.0",
    "@mdi/js": "^7.4.47"
  }
}
```

### 3.3 Screen Flow

```
┌─────────────┐
│   Loading   │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    Login    │────►│  Register   │     │  Forgot PW  │
└──────┬──────┘     └─────────────┘     └─────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│                    MainTabs                          │
├─────────────┬─────────────┬─────────────┬───────────┤
│    Main     │   Charger   │   Contact   │  Profile  │
│   (Map)     │  (Station)  │             │           │
└──────┬──────┴──────┬──────┴─────────────┴───────────┘
       │             │
       ▼             ▼
┌─────────────┐ ┌─────────────┐
│   Station   │ │  Charging   │
│   Detail    │ │   Screen    │
└─────────────┘ └──────┬──────┘
                       │
                       ▼
               ┌─────────────┐
               │  Finishing  │
               └─────────────┘
```

### 3.4 App Configuration (app.json)

```json
{
  "expo": {
    "name": "TACT",
    "slug": "tactapp",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "plugins": [
      [
        "expo-build-properties",
        {
          "android": {
            "usesCleartextTraffic": true
          }
        }
      ],
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "Allow TACT to use your location."
        }
      ]
    ],
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#22c55e"
      },
      "package": "com.tact.charger",
      "usesCleartextTraffic": true,
      "config": {
        "googleMaps": {
          "apiKey": "YOUR_GOOGLE_MAPS_API_KEY"
        }
      }
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.tact.charger"
    },
    "extra": {
      "eas": {
        "projectId": "YOUR_EAS_PROJECT_ID"
      }
    }
  }
}
```

### 3.5 API Configuration

```typescript
// src/config/api.ts
const DEV_MODE = true;
const LOCAL_IP = '212.80.215.42';

export const API_BASE_URL = DEV_MODE
  ? `http://${LOCAL_IP}:5000/api`
  : 'https://api.tactcharger.com/api';

export const API_TIMEOUT = 10000;
```

### 3.6 TypeScript Types

```typescript
// src/types/index.ts
export interface Station {
  id: string;
  _id?: string;
  name: string;
  model: string;
  status: 'Online' | 'Offline';
  location: {
    latitude: number;
    longitude: number;
    address: string;
  };
  chargers: Charger[];
  ownerPhone: string;
  generatorFuelLevel: number;
}

export interface Charger {
  id: string;
  type: 'CCS2' | 'AC';
  status: 'Available' | 'Preparing' | 'Charging' | 'Finishing' | 'Faulted' | 'Offline' | 'Disabled';
  pricePerKwh: number;
  maxPower: number;
  connectorId?: number;
  enabled?: boolean;
}

export interface ChargingSession {
  id: string;
  chargerId: string;
  stationId: string;
  userId: string;
  soc: number | null;
  state: 'Preparing' | 'Charging' | 'Stopped' | 'Faulted';
  powerKw: number;
  chargingTime: number;
  energyCharged: number;
  status: 'Active' | 'Inactive';
  carbonReduce: number;
  fuelUsed: number;
  totalPrice: number;
  startTime: Date;
  endTime?: Date;
}

export interface User {
  id: string;
  username: string;
  email: string;
  phone: string;
  whatsapp?: string;
  line?: string;
  role: 'User' | 'Admin';
}
```

---

## 4. Backend - API Server

### 4.1 Project Structure

```
tact-backend/
├── src/
│   ├── index.ts              # Entry point
│   ├── routes/
│   │   ├── auth.ts           # Authentication routes
│   │   ├── stations.ts       # Station CRUD
│   │   └── charging.ts       # Charging session routes
│   ├── models/
│   │   ├── User.ts
│   │   ├── Station.ts
│   │   └── ChargingSession.ts
│   ├── middleware/
│   │   └── auth.ts           # JWT middleware
│   └── services/
│       ├── ocppBridge.ts     # CSMS communication
│       ├── csmsListener.ts   # WebSocket listener
│       └── socketService.ts  # Socket.IO service
├── package.json
├── tsconfig.json
└── .env
```

### 4.2 Environment Variables

```env
# .env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/tact
JWT_SECRET=your-jwt-secret

# CSMS Configuration
CSMS_HTTP_URL=http://212.80.215.42:8080
CSMS_WS_URL=ws://212.80.215.42:9000
CSMS_CP_ID=TACT30KW
```

### 4.3 Key Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "mongoose": "^8.0.0",
    "socket.io": "^4.7.4",
    "jsonwebtoken": "^9.0.2",
    "bcryptjs": "^2.4.3",
    "axios": "^1.6.2",
    "ws": "^8.14.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express-validator": "^7.0.1"
  }
}
```

---

## 5. OCPP Integration

### 5.1 OCPP 1.6J Overview

OCPP (Open Charge Point Protocol) 1.6J ใช้ JSON over WebSocket สำหรับสื่อสารระหว่าง:
- **CSMS (Central System)**: Server ที่รับ/ส่งคำสั่ง
- **Charge Point**: ตู้ชาร์จ (ในที่นี้คือ EdgeBox)

### 5.2 Messages ที่ใช้

#### Charge Point → CSMS

| Message | เมื่อไหร่ | ข้อมูล |
|---------|----------|--------|
| `BootNotification` | เปิดเครื่อง | vendor, model, serial |
| `Heartbeat` | ทุก 30 วินาที | - |
| `StatusNotification` | สถานะเปลี่ยน | connectorId, status, errorCode |
| `StartTransaction` | เริ่มชาร์จ | connectorId, idTag, meterStart |
| `StopTransaction` | หยุดชาร์จ | transactionId, meterStop, reason |
| `MeterValues` | ระหว่างชาร์จ | energy, power, soc, voltage, current |
| `Authorize` | ยืนยันตัวตน | idTag |

#### CSMS → Charge Point

| Message | การใช้งาน | Parameters |
|---------|----------|------------|
| `RemoteStartTransaction` | สั่งเริ่มชาร์จ | connectorId, idTag |
| `RemoteStopTransaction` | สั่งหยุดชาร์จ | transactionId |
| `Reset` | รีเซตเครื่อง | type (Soft/Hard) |
| `UnlockConnector` | ปลดล็อค | connectorId |
| `SetChargingProfile` | จำกัดกำลังไฟ | connectorId, limit |
| `TriggerMessage` | ขอข้อมูล | requestedMessage |

### 5.3 Connector Status

| Status | ความหมาย | สี (App) |
|--------|----------|---------|
| `Available` | พร้อมใช้งาน | 🟢 เขียว |
| `Preparing` | เสียบสายแล้ว รอเริ่ม | 🟡 เหลือง |
| `Charging` | กำลังชาร์จ | 🟡 เหลือง |
| `Finishing` | ชาร์จเสร็จ รอถอดสาย | 🟡 เหลือง |
| `SuspendedEV` | EV หยุดชั่วคราว | 🟡 เหลือง |
| `SuspendedEVSE` | Charger หยุดชั่วคราว | 🟡 เหลือง |
| `Faulted` | เกิดข้อผิดพลาด | 🔴 แดง |
| `Unavailable` | ไม่พร้อมใช้งาน | ⚫ เทา |

### 5.4 OCPP Bridge (Backend)

```typescript
// src/services/ocppBridge.ts

const CSMS_URL = process.env.CSMS_HTTP_URL || 'http://212.80.215.42:8080';
const CP_ID = process.env.CSMS_CP_ID || 'TACT30KW';

interface ChargePointStatus {
  id: string;
  vendor: string;
  model: string;
  status: { [key: string]: string };
  transactions: { [key: string]: any };
  connected: boolean;
  registration_status: string;
}

/**
 * ดึงสถานะ Charge Points ทั้งหมด
 */
export async function getChargePoints(): Promise<ChargePointStatus[]> {
  const response = await axios.get(`${CSMS_URL}/api/charge_points`);
  return response.data || [];
}

/**
 * เพิ่ม RFID card ใน CSMS
 */
export async function addRfidCard(idTag: string, description?: string) {
  const response = await axios.post(`${CSMS_URL}/api/rfid/add`, {
    id_tag: idTag.toUpperCase(),
    status: 'Accepted',
    description: description || `App user: ${idTag}`,
  });
  return { success: true };
}

/**
 * สั่ง Remote Start Transaction
 */
export async function remoteStart(connectorId: number, idTag: string) {
  const response = await axios.post(`${CSMS_URL}/api/command`, {
    cp_id: CP_ID,
    command: 'remote_start',
    params: {
      id_tag: idTag.toUpperCase(),
      connector_id: connectorId,
    },
  });
  return {
    success: response.data?.success ?? true,
    result: response.data?.result || { status: 'Accepted' },
  };
}

/**
 * สั่ง Remote Stop Transaction
 */
export async function remoteStop(transactionId: number) {
  const response = await axios.post(`${CSMS_URL}/api/command`, {
    cp_id: CP_ID,
    command: 'remote_stop',
    params: {
      transaction_id: transactionId,
    },
  });
  return {
    success: response.data?.success ?? true,
    result: response.data?.result || { status: 'Accepted' },
  };
}

/**
 * ดูสถานะ Connector
 */
export async function getConnectorStatus(connectorId: number): Promise<string | null> {
  const chargePoints = await getChargePoints();
  const cp = chargePoints.find(c => c.id === CP_ID);
  
  if (cp && cp.status) {
    return cp.status[connectorId.toString()] || null;
  }
  return null;
}

/**
 * สร้าง idTag จาก userId
 */
export function generateIdTag(userId: string): string {
  const tag = `U${userId.toString().slice(-19)}`.toUpperCase();
  return tag;
}
```

### 5.5 CSMS WebSocket Listener

```typescript
// src/services/csmsListener.ts

import WebSocket from 'ws';
import { Server as SocketIOServer } from 'socket.io';

const CSMS_WS_URL = process.env.CSMS_WS_URL || 'ws://212.80.215.42:9000';

// Mapping idTag → userId
const idTagUserMap: Map<string, string> = new Map();

export function registerIdTagUser(idTag: string, userId: string) {
  idTagUserMap.set(idTag.toUpperCase(), userId);
}

export function unregisterIdTag(idTag: string) {
  idTagUserMap.delete(idTag.toUpperCase());
}

export function startCsmsListener(io: SocketIOServer) {
  const ws = new WebSocket(CSMS_WS_URL);

  ws.on('open', () => {
    console.log('🎧 Connected to CSMS WebSocket');
  });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      await handleCsmsMessage(message, io);
    } catch (error) {
      console.error('CSMS message parse error:', error);
    }
  });

  ws.on('close', () => {
    console.log('CSMS WebSocket closed, reconnecting...');
    setTimeout(() => startCsmsListener(io), 5000);
  });
}

async function handleCsmsMessage(message: any, io: SocketIOServer) {
  const { event, data } = message;

  switch (event) {
    case 'StartTransaction':
      // อัพเดท session state เป็น Charging
      await handleStartTransaction(data, io);
      break;

    case 'StopTransaction':
      // อัพเดท session state เป็น Stopped
      await handleStopTransaction(data, io);
      break;

    case 'MeterValues':
      // ส่ง real-time data ไป App
      await handleMeterValues(data, io);
      break;

    case 'StatusNotification':
      // อัพเดทสถานะ connector
      await handleStatusNotification(data, io);
      break;
  }
}
```

---

## 6. PLC & Generator Communication

### 6.1 Architecture

```
EdgeBox (Python OCPP Client)
    │
    ├── HTTP polling ──► PLC CODESYS  (192.168.0.8 / 192.168.0.9)
    │                    /cgi-bin/ILRReadValues.exe  (READ)
    │                    /cgi-bin/writeVal.exe        (WRITE)
    │
    └── Modbus RTU ───► Energy Meter  (/dev/ttyACM0)
```

### 6.2 PLC Global Variables

#### Read Variables

| GV Tag | ค่า | ความหมาย |
|--------|-----|----------|
| `iCpStateCcs` | `'1'` | Available |
| | `'2'` | Preparing |
| | `'7'` (+ usiLink=`'13'`) | Charging |
| | `'9'`, `'10'` | Faulted |
| `usiLinkStateCcs` | `'0'` | Available |
| | `'1'`–`'11'`, `'21'`, `'22'` | Preparing |
| | `'12'`, `'13'`, `'19'` | Charging |
| | `'14'`, `'15'`, `'16'`, `'20'` | Finishing |
| `Emergency_stop` | `'0'` / `'1'` | Emergency button |
| `Head1Finishing` | `'0'` / `'1'` | Connector 1 finished |
| `Head2Finishing` | `'0'` / `'1'` | Connector 2 finished |
| `iRessState` | % | SoC ของ EV |
| `diTargetVoltageEvCcs` | V | Voltage ที่ EV request |
| `diTargetCurrentCcs` | A | Current ที่ EV request |

#### Write Variables

| GV Tag | Pattern | ผล |
|--------|---------|-----|
| `remote_start_webvisit` | Pulse: `1` → 2s → `0` | สั่ง PLC เริ่มชาร์จ |
| `remote_stop_webvisit` | Pulse: `1` → 3s → `0` | สั่ง PLC หยุดชาร์จ |
| `OCPP_HardReset1` | `1` | Hard reset connector 1 |
| `OCPP_HardReset2` | `1` | Hard reset connector 2 |
| `limitpower` | watts (int) | จำกัดกำลังไฟ (max 180,000 W) |
| `limitcurrent` | ampere (int) | จำกัดกระแส (max 500 A) |

### 6.3 PLC HTTP API Examples

#### Read Value

```python
def read_plc_value(ip_adr, tag_name):
    url = f"http://{ip_adr}/cgi-bin/ILRReadValues.exe"
    payload = f"<n>@GV.{tag_name}</n>"
    response = requests.post(url, data=payload, timeout=5)
    # Parse XML: <r><v>value</v></r>
    match = re.search(r'<v>(.+?)</v>', response.text)
    return match.group(1) if match else None
```

#### Write Value

```python
def write_plc_value(ip_adr, tag_name, value):
    url = f"http://{ip_adr}/cgi-bin/writeVal.exe?%40GV.{tag_name}+{value}"
    response = requests.get(url, timeout=5)
    return response.text
```

### 6.4 Remote Start/Stop Functions

```python
def remote_start_plc(ip_adr, value):
    """สั่ง PLC เริ่มชาร์จ (Pulse: HIGH → 2s → LOW)"""
    url = f"http://{ip_adr}/cgi-bin/writeVal.exe?%40GV.remote_start_webvisit+{value}"
    response = requests.get(url, timeout=5)
    return 'Remote Start Successful'

def remote_stop_plc(ip_adr, value):
    """สั่ง PLC หยุดชาร์จ (Pulse: HIGH → 3s → LOW)"""
    url = f"http://{ip_adr}/cgi-bin/writeVal.exe?%40GV.remote_stop_webvisit+{value}"
    response = requests.get(url, timeout=5)
    return 'Remote Stop Successful'
```

### 6.5 Generator Control (TODO)

```python
def start_generator(ip_adr):
    """สั่ง PLC เปิด Generator"""
    # TODO: เพิ่ม GV tag ใน PLC ก่อน
    url = f"http://{ip_adr}/cgi-bin/writeVal.exe?%40GV.start_generator+1"
    response = requests.get(url, timeout=5)
    return True

def stop_generator(ip_adr):
    """สั่ง PLC ปิด Generator"""
    url = f"http://{ip_adr}/cgi-bin/writeVal.exe?%40GV.stop_generator+1"
    response = requests.get(url, timeout=5)
    return True

def get_generator_status(ip_adr):
    """อ่านสถานะ Generator จาก PLC"""
    # TODO: เพิ่ม GV tag ใน PLC ก่อน
    value = read_plc_value(ip_adr, 'generator_status')
    return 'Running' if value == '1' else 'Stopped'
```

---

## 7. Database Schema

### 7.1 User Schema

```typescript
// src/models/User.ts
const UserSchema = new Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  password: { type: String, required: true },
  whatsapp: { type: String },
  line: { type: String },
  role: { type: String, enum: ['User', 'Admin'], default: 'User' },
  createdAt: { type: Date, default: Date.now },
});
```

### 7.2 Station Schema

```typescript
// src/models/Station.ts
const ChargerSchema = new Schema({
  id: { type: String, required: true },
  type: { type: String, enum: ['CCS2', 'AC'], required: true },
  status: { 
    type: String, 
    enum: ['Available', 'Preparing', 'Charging', 'Finishing', 'Faulted', 'Unavailable', 'Disabled'],
    default: 'Available' 
  },
  pricePerKwh: { type: Number, default: 7.5 },
  maxPower: { type: Number, default: 30 },
  connectorId: { type: Number },
  enabled: { type: Boolean, default: true },
});

const StationSchema = new Schema({
  name: { type: String, required: true },
  model: { type: String },
  chargerModel: { type: String },
  status: { type: String, enum: ['Online', 'Offline'], default: 'Offline' },
  location: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    address: { type: String },
  },
  chargers: [ChargerSchema],
  ownerPhone: { type: String },
  generatorFuelLevel: { type: Number, default: 100 },
  visible: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});
```

### 7.3 ChargingSession Schema

```typescript
// src/models/ChargingSession.ts
const ChargingSessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  stationId: { type: Schema.Types.ObjectId, ref: 'Station', required: true },
  chargerId: { type: String, required: true },
  chargerType: { type: String, enum: ['CCS2', 'AC'] },
  cpId: { type: String },
  connectorId: { type: Number },
  idTag: { type: String },
  transactionId: { type: Number },
  
  state: { 
    type: String, 
    enum: ['Preparing', 'Charging', 'Stopped', 'Faulted'],
    default: 'Preparing'
  },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  
  pricePerKwh: { type: Number, default: 7.5 },
  meterStart: { type: Number, default: 0 },
  meterStop: { type: Number },
  energyCharged: { type: Number, default: 0 },
  chargingTime: { type: Number, default: 0 },
  totalPrice: { type: Number, default: 0 },
  carbonReduce: { type: Number, default: 0 },
  
  soc: { type: Number },
  powerKw: { type: Number, default: 0 },
  
  errorCode: { type: String },
  errorMessage: { type: String },
  
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date },
});
```

---

## 8. API Endpoints

### 8.1 Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | ลงทะเบียนผู้ใช้ใหม่ |
| POST | `/api/auth/login` | เข้าสู่ระบบ |
| GET | `/api/auth/me` | ดึงข้อมูลผู้ใช้ปัจจุบัน |
| PUT | `/api/auth/profile` | อัพเดทโปรไฟล์ |
| POST | `/api/auth/forgot-password` | ขอรีเซตรหัสผ่าน |
| POST | `/api/auth/change-password` | เปลี่ยนรหัสผ่าน |

### 8.2 Stations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stations` | ดึงสถานีทั้งหมด (visible) |
| GET | `/api/stations/:id` | ดึงสถานีเฉพาะ |
| POST | `/api/stations` | สร้างสถานี (Admin) |
| PUT | `/api/stations/:id` | อัพเดทสถานี (Admin) |
| DELETE | `/api/stations/:id` | ลบสถานี (Admin) |
| POST | `/api/stations/refresh` | Refresh status จาก CSMS |
| PATCH | `/api/stations/:id/visibility` | ซ่อน/แสดงสถานี |
| PATCH | `/api/stations/:id/chargers/:chargerId/toggle` | เปิด/ปิด charger |

### 8.3 Charging

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/charging/start` | เริ่มชาร์จ |
| POST | `/api/charging/:id/stop` | หยุดชาร์จ |
| GET | `/api/charging/active` | ดึง session ที่กำลังชาร์จ |
| GET | `/api/charging/history` | ดึงประวัติการชาร์จ |
| GET | `/api/charging/:id` | ดึง session เฉพาะ |
| POST | `/api/charging/:id/fault` | รายงาน fault |
| DELETE | `/api/charging/cancel-all` | ยกเลิก session ทั้งหมด |
| GET | `/api/charging/connector/:id/status` | ดึงสถานะ connector |

### 8.4 Request/Response Examples

#### Start Charging

**Request:**
```http
POST /api/charging/start
Authorization: Bearer <token>
Content-Type: application/json

{
  "stationId": "6789abcd...",
  "chargerId": "connector-1",
  "connectorId": 1
}
```

**Response:**
```json
{
  "success": true,
  "message": "Charging command sent, waiting for charger...",
  "data": {
    "session": {
      "_id": "1234abcd...",
      "state": "Preparing",
      "connectorId": 1,
      "pricePerKwh": 7.5
    },
    "station": {
      "id": "6789abcd...",
      "name": "TACT Station 1"
    },
    "charger": {
      "id": "connector-1",
      "type": "CCS2",
      "pricePerKwh": 7.5
    }
  }
}
```

---

## 9. Socket.IO Events

### 9.1 Client → Server

| Event | Data | Description |
|-------|------|-------------|
| `joinSession` | `sessionId` | เข้าร่วม session room |
| `leaveSession` | `sessionId` | ออกจาก session room |
| `ping` | - | ทดสอบ connection |

### 9.2 Server → Client

| Event | Data | Description |
|-------|------|-------------|
| `meterUpdate` | `{sessionId, soc, powerKw, energyCharged, chargingTime, totalPrice, carbonReduce}` | อัพเดทค่า real-time |
| `chargingStarted` | `{sessionId, transactionId, state, connectorId}` | เริ่มชาร์จแล้ว |
| `chargingStopped` | `{sessionId, energyCharged, chargingTime, totalPrice, carbonReduce, reason}` | หยุดชาร์จแล้ว |
| `chargingFaulted` | `{sessionId, connectorId, errorCode}` | เกิด fault |
| `connectorStatus` | `{cpId, connectorId, status, errorCode}` | สถานะ connector เปลี่ยน |

### 9.3 Socket.IO Client (React Native)

```typescript
// src/services/socket.ts
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config/api';

const SOCKET_URL = API_BASE_URL.replace('/api', '');
let socket: Socket | null = null;

export function connectSocket(userId: string): Socket {
  socket = io(SOCKET_URL, {
    auth: { userId },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
  });
  return socket;
}

export function joinSession(sessionId: string): void {
  if (socket?.connected) {
    socket.emit('joinSession', sessionId);
  }
}

export function onMeterUpdate(callback: (data: MeterUpdateData) => void) {
  if (!socket) return () => {};
  socket.on('meterUpdate', callback);
  return () => socket?.off('meterUpdate', callback);
}
```

---

## 10. Charging Flow

### 10.1 Start Charging Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         START CHARGING FLOW                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. User เสียบสาย                                                    │
│     └→ PLC: iCpStateCcs = '2' (Preparing)                           │
│     └→ EdgeBox poll → StatusNotification: Preparing                 │
│     └→ CSMS → Backend → Socket.IO → App                             │
│                                                                      │
│  2. App แสดง status "Preparing" บน Charger                          │
│                                                                      │
│  3. User กด "Start Charging"                                         │
│     └→ App → Backend API: POST /api/charging/start                  │
│                                                                      │
│  4. Backend                                                          │
│     └→ สร้าง Session (state: Preparing)                              │
│     └→ สร้าง idTag จาก userId                                        │
│     └→ เพิ่ม RFID ใน CSMS                                            │
│     └→ ส่ง RemoteStartTransaction → CSMS                            │
│                                                                      │
│  5. CSMS → EdgeBox: RemoteStartTransaction                          │
│     └→ EdgeBox ตอบ Accepted                                         │
│     └→ EdgeBox ตั้ง flag: myremotestart_c1 = 1                      │
│                                                                      │
│  6. EdgeBox main loop                                                │
│     └→ เห็น flag → ส่ง HTTP pulse ไป PLC:                           │
│        remote_start_webvisit = 1 → sleep(2s) → 0                    │
│                                                                      │
│  7. PLC                                                              │
│     └→ Start Generator (10-20 วินาที)                                │
│     └→ Generator พร้อม → เริ่ม Charger                               │
│                                                                      │
│  8. Charger เริ่มชาร์จ                                               │
│     └→ PLC: iCpStateCcs = '7', usiLinkStateCcs = '13'               │
│                                                                      │
│  9. EdgeBox poll PLC                                                 │
│     └→ เห็น Charging state                                          │
│     └→ อ่าน meterStart จาก Energy Meter                             │
│     └→ ส่ง StartTransaction → CSMS                                  │
│                                                                      │
│  10. CSMS → Backend (WebSocket event)                                │
│      └→ อัพเดท session.state = 'Charging'                           │
│      └→ บันทึก transactionId                                        │
│      └→ Socket.IO: 'chargingStarted' → App                          │
│                                                                      │
│  11. App แสดงหน้า Charging                                           │
│                                                                      │
│  12. ระหว่างชาร์จ                                                    │
│      └→ EdgeBox ส่ง MeterValues ทุก 4 วินาที                         │
│      └→ CSMS → Backend → Socket.IO: 'meterUpdate' → App             │
│      └→ App อัพเดท Power, Energy, SoC, Price                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.2 Stop Charging Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         STOP CHARGING FLOW                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. User กด "Stop Charging"                                          │
│     └→ App → Backend API: POST /api/charging/:id/stop               │
│                                                                      │
│  2. Backend                                                          │
│     └→ ส่ง RemoteStopTransaction(transactionId) → CSMS              │
│     └→ ตอบ App: "Stop command sent"                                 │
│                                                                      │
│  3. CSMS → EdgeBox: RemoteStopTransaction                           │
│     └→ EdgeBox ตอบ Accepted                                         │
│     └→ EdgeBox ตั้ง flag: my_remote_stop_c1 = 1                     │
│                                                                      │
│  4. EdgeBox main loop                                                │
│     └→ เห็น flag → ส่ง HTTP pulse ไป PLC:                           │
│        remote_stop_webvisit = 1 → sleep(3s) → 0                     │
│                                                                      │
│  5. PLC                                                              │
│     └→ หยุด Charger                                                 │
│     └→ ตั้ง Finishing signal                                        │
│                                                                      │
│  6. EdgeBox poll PLC                                                 │
│     └→ เห็น Finishing signal                                        │
│     └→ ส่ง StatusNotification: Finishing                            │
│     └→ อ่าน meterStop จาก Energy Meter                              │
│     └→ ส่ง StopTransaction(reason='Remote') → CSMS                  │
│                                                                      │
│  7. CSMS → Backend (WebSocket event)                                 │
│      └→ อัพเดท session.state = 'Stopped'                            │
│      └→ คำนวณ energyCharged, totalPrice                             │
│      └→ Socket.IO: 'chargingStopped' → App                          │
│                                                                      │
│  8. App แสดงหน้า Finishing                                           │
│     └→ แสดงสรุป: Energy, Time, Price                                │
│                                                                      │
│  9. User กด "Finish"                                                 │
│     └→ กลับหน้า Main                                                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 11. Configuration

### 11.1 Backend .env

```env
# Server
PORT=5000
NODE_ENV=production

# MongoDB
MONGODB_URI=mongodb://localhost:27017/tact

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRE=30d

# CSMS
CSMS_HTTP_URL=http://212.80.215.42:8080
CSMS_WS_URL=ws://212.80.215.42:9000
CSMS_CP_ID=TACT30KW

# CORS
CORS_ORIGIN=*
```

### 11.2 Frontend API Config

```typescript
// src/config/api.ts
const DEV_MODE = true;
const LOCAL_IP = '212.80.215.42';

export const API_BASE_URL = DEV_MODE
  ? `http://${LOCAL_IP}:5000/api`
  : 'https://api.tactcharger.com/api';

export const API_TIMEOUT = 10000;
```

### 11.3 EAS Build Config

```json
// eas.json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  }
}
```

---

## 12. Deployment

### 12.1 Backend Deployment

```powershell
# 1. Clone repository
git clone <repo-url>
cd tact-backend

# 2. Install dependencies
npm install

# 3. Build
npm run build

# 4. Start with PM2
pm2 start dist/index.js --name tact-backend

# 5. Auto-start on boot
pm2 startup
pm2 save
```

### 12.2 Mobile App Build

```powershell
# 1. Install EAS CLI
npm install -g eas-cli

# 2. Login to Expo
eas login

# 3. Configure project
eas build:configure

# 4. Build APK (Preview)
eas build -p android --profile preview

# 5. Build AAB (Production)
eas build -p android --profile production
```

### 12.3 Server Requirements

| Component | Requirement |
|-----------|-------------|
| Node.js | >= 18.x |
| MongoDB | >= 6.x |
| Python | >= 3.9 (for CSMS) |
| RAM | >= 2GB |
| Storage | >= 20GB |
| OS | Ubuntu 22.04 LTS |

---

## 📝 Notes

### Known Issues

1. **Cleartext Traffic**: Android 9+ blocks HTTP by default → ต้องเพิ่ม `usesCleartextTraffic: true`

2. **Google Maps API Key**: ต้อง restrict key ให้ใช้ได้เฉพาะ package name `com.tact.charger`

3. **Session Restore**: หลัง clear app แล้วเปิดใหม่ ต้องเรียก `checkActiveSession()` เพื่อ restore session

### TODO

- [ ] เพิ่ม GV tag สำหรับ Generator control ใน PLC
- [ ] ทดสอบ Generator start/stop flow
- [ ] เพิ่ม timeout handling สำหรับ Generator
- [ ] เพิ่ม OTA update support

---

*Generated: 2025*  
*Version: 1.0.0*
