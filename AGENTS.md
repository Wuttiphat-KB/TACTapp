# AGENTS.md — TACT EV Charging Project Context

> ไฟล์นี้คือ context รวมของโปรเจกต์ สำหรับใช้กับ Codex
> วางไว้ที่ root ของ workspace เช่น `C:\Users\Asus\Documents\TACT\AGENTS.md`
> Last updated: 2026-07-24

---

## 0. TL;DR สำหรับ Codex

โปรเจกต์นี้คือระบบชาร์จรถ EV แบบเคลื่อนที่ (ไฟจากเครื่องปั่นไฟ ไม่ใช้กริด) ประกอบด้วย 4 ส่วน:

1. **TACTAPP** — Mobile App (React Native + Expo, TypeScript)
2. **tact-backend** — REST API + Socket.IO (Node.js + Express + TS + MongoDB)
3. **CSMS** — OCPP 1.6J Central System (Python) — *มีอยู่แล้ว ใช้งานได้*
4. **EdgeBox** — OCPP Client (Python บน Raspberry Pi CM4) คุยกับ PLC (HTTP) และ Generator (Modbus RTU)

**งานที่เพิ่งเสร็จ (2026-07-17):** อ่านค่า live DSE4620 (page 4 Modbus) → ส่งขึ้น App ครบเส้น (gen_telemetry.py → backend → ChargerScreen/ChargingScreen) — ดู §8.9
**งานที่ค้างฝั่ง App/Backend:** Charging History, Profile API, Build APK, capacity→kWh (รอขนาดถังน้ำมัน), generator status readback (รอทีม PLC — ดู `OPEN_QUESTIONS.md`)
**หมายเหตุ:** AGENTS.md เคยผิดหลายจุด (§7.4 gen tag, §9.1 ลำดับ start, §2 PLC IP/connector) — ตรวจกับโค้ดก่อนเชื่อ; รายการเต็มใน `OPEN_QUESTIONS.md`

---

## 1. Project Scope (จาก TOR — TCATEDS001/2025)

| หัวข้อ | รายละเอียด |
|---|---|
| ชื่อโครงการ | พัฒนา TACT Mobile Charger Application |
| ผู้ว่าจ้าง | บริษัท ไทยอิชิเทค จำกัด (TACT) |
| Platform | Android 1 platform |
| งบประมาณ | 100,000 บาท (รวม VAT) |
| ระยะเวลา | 90 วัน นับจากวันลงนามสัญญา |
| การชำระเงิน | งวด 1: 40% หลังลงนาม PO / งวด 2: 60% ภายใน 30 วันหลังส่งมอบ |
| ลิขสิทธิ์ | ตัว Application เป็นของ TACT (**ไม่รวม source code**) |
| Framework | React (TypeScript), MongoDB, Figma, VS Code, GitHub |

**วัตถุประสงค์:**
- ค้นหาสถานีชาร์จ EV บนแผนที่ + นำทาง
- เริ่ม/หยุดชาร์จ + ติดตามสถานะแบบ real-time
- ดูสรุปการใช้งาน, สถานะเครื่องปั่นไฟ, ราคา/หน่วย (บาท/kWh)
- รองรับ 2 ภาษา (ไทย/อังกฤษ)

---

## 2. Architecture ภาพรวม

```
📱 Mobile App (Expo/RN)
   │ REST + Socket.IO
   ▼
🖥️ Backend (Node/Express/TS)  ──HTTP──►  🐍 CSMS (Python, OCPP Central)
   │ MongoDB                                │ WebSocket OCPP 1.6J
   ▼                                        ▼
   MongoDB                            📦 EdgeBox-RPI-200 (Python, OCPP Client)
                                            │
                        ┌───────────────────┼─────────────────────┐
                        │ HTTP (CGI)        │ Modbus RTU          │ Modbus RTU
                        ▼                   ▼                     ▼
                  ⚙️ PLC (CODESYS)    ⚡ Energy Meter        🔌 DSE857 → DSE4620
                  192.168.0.8/.9      /dev/ttyACM0            /dev/ttyUSB0
                        │
                 ┌──────┴──────┐
                 ▼             ▼
            Generator     EV Charger (CCS2/AC)
```

**หมายเหตุสำคัญ:** PLC สื่อสารนอกวง LAN ไม่ได้ → ต้องมี EdgeBox เป็นตัวกลางเสมอ

### Ports / Endpoints

| Service | Address | Protocol |
|---|---|---|
| Backend API | `http://212.80.215.42:5000` | HTTP |
| CSMS HTTP API | `http://212.80.215.42:8080` | HTTP |
| CSMS WebSocket (OCPP) | `ws://212.80.215.42:9000/ocpp/TACT30KW` | WS (ocpp1.6) |
| MongoDB | `212.80.215.42:27017` | TCP |
| PLC Connector 1 | `192.168.0.8` | HTTP |
| PLC Connector 2 | `192.168.0.9` | HTTP |

MongoDB URI: `mongodb://admin:EDSTACT@212.80.215.42:27017/tact_db?authSource=admin`
CP ID: `TACT30KW` (2 connectors)

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Mobile App | React Native 0.76.9 + Expo SDK 54, TypeScript |
| Styling | NativeWind (TailwindCSS) |
| Backend | Node.js ≥18 + Express + TypeScript |
| Database | MongoDB ≥6 + Mongoose |
| Real-time | Socket.IO |
| OCPP | OCPP 1.6J (JSON over WebSocket) |
| CSMS | Python ≥3.9 (`ocpp` mobility-house + `websockets`) |
| EdgeBox | Python + `minimalmodbus` / `pyserial` / `requests` |
| Maps | Google Maps SDK for Android |
| Deploy | Windows Server (backend), PM2 / .bat, EAS Build (app) |

---

## 4. Frontend — TACTAPP

### 4.1 Structure

```
TACTAPP/
├── App.tsx                    # Main + navigation + DEV_MODE flags
├── app.json / eas.json / tailwind.config.js / global.css
├── assets/
└── src/
    ├── config/api.ts          # API_BASE_URL, API_TIMEOUT
    ├── contexts/
    │   ├── AuthContext.tsx    # JWT + AsyncStorage
    │   └── LanguageContext.tsx# i18n TH/EN
    ├── components/            # Header, BottomTabs, MdiIcon, ...
    ├── screens/
    │   ├── LoadingScreen.tsx / LoginScreen / RegisterScreen / ForgotPasswordScreen
    │   ├── MainScreen.tsx     # Map
    │   ├── ChargerScreen.tsx  # Station detail
    │   ├── ChargingScreen.tsx # Active charging
    │   ├── FinishingScreen.tsx
    │   ├── ChargingHistoryScreen.tsx
    │   ├── ProfileScreen.tsx / ContactScreen / FaultScreen
    ├── services/
    │   ├── api.ts             # API client
    │   └── socket.ts          # Socket.IO client
    ├── types/index.ts
    └── utils/mapper.ts
```

### 4.2 Screen Flow

```
Loading → Login (→ Register / Forgot PW)
        → MainTabs [ Main(Map) | Charger | Contact | Profile ]
            Main → Station Detail
            Charger → Charging → Finishing
```

### 4.3 Config สำคัญ

```typescript
// src/config/api.ts
const DEV_MODE = true;
const LOCAL_IP = '212.80.215.42';
export const API_BASE_URL = DEV_MODE
  ? `http://${LOCAL_IP}:5000/api`
  : 'https://api.tactcharger.com/api';
export const API_TIMEOUT = 10000;
```

```json
// app.json (ส่วนสำคัญ)
"android": {
  "package": "com.tact.charger",
  "usesCleartextTraffic": true,
  "config": { "googleMaps": { "apiKey": "YOUR_GOOGLE_MAPS_API_KEY" } }
}
```

### 4.4 Types

```typescript
export interface Station {
  id: string; _id?: string;
  name: string; model: string;
  status: 'Online' | 'Offline';
  location: { latitude: number; longitude: number; address: string };
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
  id: string; chargerId: string; stationId: string; userId: string;
  soc: number | null;
  state: 'Preparing' | 'Charging' | 'Stopped' | 'Faulted';
  powerKw: number; chargingTime: number; energyCharged: number;
  status: 'Active' | 'Inactive';
  carbonReduce: number; fuelUsed: number; totalPrice: number;
  startTime: Date; endTime?: Date;
}

export interface User {
  id: string; username: string; email: string; phone: string;
  whatsapp?: string; line?: string;
  role: 'User' | 'Admin';
}
```

---

## 5. Backend — tact-backend

### 5.1 Structure

```
tact-backend/
└── src/
    ├── index.ts              # Entry point (port 5000)
    ├── routes/               # auth.ts, stations.ts, charging.ts
    ├── models/               # User.ts, Station.ts, ChargingSession.ts
    ├── middleware/auth.ts    # JWT
    └── services/
        ├── ocppBridge.ts     # เรียก CSMS HTTP API
        ├── csmsListener.ts   # WebSocket listener จาก CSMS
        └── socketService.ts  # Socket.IO
```

### 5.2 .env

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/tact
JWT_SECRET=your-jwt-secret
CSMS_HTTP_URL=http://212.80.215.42:8080
CSMS_WS_URL=ws://212.80.215.42:9000
CSMS_CP_ID=TACT30KW
```

### 5.3 API Endpoints

**Auth**
| Method | Endpoint |
|---|---|
| POST | `/api/auth/register` |
| POST | `/api/auth/login` |
| GET | `/api/auth/me` |
| PUT | `/api/auth/profile` |
| POST | `/api/auth/forgot-password` |
| POST | `/api/auth/change-password` |

**Stations**
| Method | Endpoint |
|---|---|
| GET | `/api/stations` (visible only) |
| GET | `/api/stations/:id` |
| POST / PUT / DELETE | `/api/stations[/:id]` (Admin) |
| POST | `/api/stations/refresh` (sync จาก CSMS) |
| PATCH | `/api/stations/:id/visibility` |
| PATCH | `/api/stations/:id/chargers/:chargerId/toggle` |

**Charging**
| Method | Endpoint |
|---|---|
| POST | `/api/charging/start` |
| POST | `/api/charging/:id/stop` |
| GET | `/api/charging/active` |
| GET | `/api/charging/history` |
| GET | `/api/charging/:id` |
| POST | `/api/charging/:id/fault` |
| DELETE | `/api/charging/cancel-all` |
| GET | `/api/charging/connector/:id/status` |

**ตัวอย่าง Start Charging**
```http
POST /api/charging/start
Authorization: Bearer <token>

{ "stationId": "...", "chargerId": "connector-1", "connectorId": 1 }
```
```json
{ "success": true, "message": "Charging command sent, waiting for charger...",
  "data": { "session": { "_id": "...", "state": "Preparing", "connectorId": 1, "pricePerKwh": 7.5 },
            "station": { "id": "...", "name": "TACT Station 1" },
            "charger": { "id": "connector-1", "type": "CCS2", "pricePerKwh": 7.5 } } }
```

### 5.4 Socket.IO Events

**Client → Server:** `joinSession(sessionId)`, `leaveSession(sessionId)`, `ping`

**Server → Client:**
| Event | Payload |
|---|---|
| `meterUpdate` | `{sessionId, soc, powerKw, energyCharged, chargingTime, totalPrice, carbonReduce}` |
| `chargingStarted` | `{sessionId, transactionId, state, connectorId}` |
| `chargingStopped` | `{sessionId, energyCharged, chargingTime, totalPrice, carbonReduce, reason}` |
| `chargingFaulted` | `{sessionId, connectorId, errorCode}` |
| `connectorStatus` | `{cpId, connectorId, status, errorCode}` |

### 5.5 Database Schema (Mongoose)

```typescript
// User
{ username: unique, email: unique, phone, password(hash), whatsapp?, line?,
  role: 'User'|'Admin' = 'User', createdAt }

// Station
{ name, model, chargerModel, status: 'Online'|'Offline' = 'Offline',
  location: { latitude, longitude, address },
  chargers: [ChargerSchema], ownerPhone,
  generatorFuelLevel = 100, visible = true, createdAt }

// ChargerSchema (sub)
{ id, type: 'CCS2'|'AC',
  status: 'Available'|'Preparing'|'Charging'|'Finishing'|'Faulted'|'Unavailable'|'Disabled',
  pricePerKwh = 7.5, maxPower = 30, connectorId, enabled = true }

// ChargingSession
{ userId(ref User), stationId(ref Station), chargerId, chargerType, cpId,
  connectorId, idTag, transactionId,
  state: 'Preparing'|'Charging'|'Stopped'|'Faulted' = 'Preparing',
  status: 'Active'|'Inactive' = 'Active',
  pricePerKwh = 7.5, meterStart = 0, meterStop, energyCharged = 0,
  chargingTime = 0, totalPrice = 0, carbonReduce = 0,
  soc, powerKw = 0, errorCode, errorMessage, startTime, endTime }
```

---

## 6. OCPP 1.6J Integration

### 6.1 Messages ที่ใช้

**Charge Point → CSMS:** `BootNotification`, `Heartbeat` (30s), `StatusNotification`, `StartTransaction`, `StopTransaction`, `MeterValues` (ทุก 4s), `Authorize`

**CSMS → Charge Point:** `RemoteStartTransaction`, `RemoteStopTransaction`, `Reset`, `UnlockConnector`, `SetChargingProfile`, `TriggerMessage`

### 6.2 Connector Status → สีใน App

| Status | สี |
|---|---|
| `Available` | 🟢 เขียว |
| `Preparing` / `Charging` / `Finishing` / `SuspendedEV` / `SuspendedEVSE` | 🟡 เหลือง |
| `Faulted` | 🔴 แดง |
| `Unavailable` | ⚫ เทา |

### 6.3 CSMS HTTP API (ใช้จาก Backend)

```bash
# ดูสถานะ charge points
curl http://212.80.215.42:8080/api/charge_points

# เพิ่ม RFID
curl -X POST http://212.80.215.42:8080/api/rfid/add \
  -H "Content-Type: application/json" \
  -d '{"id_tag":"TESTAPP","status":"Accepted"}'

# Remote Start
curl -X POST http://212.80.215.42:8080/api/command \
  -H "Content-Type: application/json" \
  -d '{"cp_id":"TACT30KW","command":"remote_start","params":{"id_tag":"TESTAPP","connector_id":1}}'

# Remote Stop
curl -X POST http://212.80.215.42:8080/api/command \
  -H "Content-Type: application/json" \
  -d '{"cp_id":"TACT30KW","command":"remote_stop","params":{"transaction_id":123}}'
```

idTag generation: `` `U${userId.slice(-19)}`.toUpperCase() ``

### 6.4 EdgeBox main loop (โครงปัจจุบัน)

> **ตัว production คือ `OCPP_TACT/CP.py` เท่านั้น** — `CP(AC).py` เป็น backup ห้ามใช้เป็นตัวหลักหรือ deploy แทน

```python
async def main():
    url = "ws://212.80.215.42:9000/ocpp/TACT30KW"
    async with websockets.connect(url, subprotocols=["ocpp1.6"]) as ws:
        cp_cls = ChargePoint('CP_1', ws, iCpStateCss1=icp_ini1, iCpStateCss2=icp_ini2)
        notifier.notify("READY=1")
        await asyncio.gather(
            cp_cls.start(),
            cp_cls.loss_network_regis(),
            cp_cls.boot_notification_cp(),
            cp_cls.status_notification_cp(1),
            cp_cls.status_notification_cp(2),
            cp_cls.send_heartbeat(),
            cp_cls.main_run_program(0),
            systemd_watchdog_task(),
        )
```
รันอยู่ใน `while(1)` + try/except → log ลง `MDBlog.txt` + line_notify ตอน disconnect + `time.sleep(5)`

---

## 7. PLC (CODESYS) — HTTP CGI Interface

### 7.1 Read Variables (GV tags)

| GV Tag | ค่า | ความหมาย |
|---|---|---|
| `iCpStateCcs` | `'1'` / `'2'` / `'7'`(+usiLink=`'13'`) / `'9'`,`'10'` | Available / Preparing / Charging / Faulted |
| `usiLinkStateCcs` | `'0'` / `'1'–'11','21','22'` / `'12','13','19'` / `'14','15','16','20'` | Available / Preparing / Charging / Finishing |
| `Emergency_stop` | `'0'`/`'1'` | ปุ่มฉุกเฉิน |
| `Head1Finishing` / `Head2Finishing` | `'0'`/`'1'` | Connector 1/2 เสร็จ |
| `iRessState` | % | SoC ของ EV |
| `diTargetVoltageEvCcs` | V | Voltage ที่ EV request |
| `diTargetCurrentCcs` | A | Current ที่ EV request |

### 7.2 Write Variables

| GV Tag | Pattern | ผล |
|---|---|---|
| `remote_start_webvisit` | pulse `1` → 2s → `0` | เริ่มชาร์จ |
| `remote_stop_webvisit` | pulse `1` → 3s → `0` | หยุดชาร์จ |
| `OCPP_HardReset1` / `OCPP_HardReset2` | `1` | Hard reset connector |
| `limitpower` | watts (max 180,000) | จำกัดกำลัง |
| `limitcurrent` | ampere (max 500) | จำกัดกระแส |

### 7.3 Helper Functions

```python
def read_plc_value(ip_adr, tag_name):
    url = f"http://{ip_adr}/cgi-bin/ILRReadValues.exe"
    payload = f"<n>@GV.{tag_name}</n>"
    response = requests.post(url, data=payload, timeout=5)
    match = re.search(r'<v>(.+?)</v>', response.text)   # <r><v>value</v></r>
    return match.group(1) if match else None

def write_plc_value(ip_adr, tag_name, value):
    url = f"http://{ip_adr}/cgi-bin/writeVal.exe?%40GV.{tag_name}+{value}"
    return requests.get(url, timeout=5).text
```

### 7.4 Generator Control — GV.Start_Gen มีจริงและ live แล้ว ✅ (แก้ 2026-07-17)

> ⚠️ เวอร์ชันเก่าของหัวข้อนี้เขียนว่า "ยังไม่มี GV tag ต้องรอทีม PLC เพิ่ม `start_generator`" — **ผิด** ตรวจกับโค้ดจริงแล้ว

**tag ชื่อจริง = `Start_Gen`** (ไม่ใช่ `start_generator`) มีอยู่ ใช้งานได้ และ run production มาตั้งแต่ **2026-04-01**

```python
# OCPP_TACT/helpf/plc_function.py:382-386  (ของจริง)
def write_start_gen(ip_adr, value):
    url = "http://" + ip_adr + "/cgi-bin/writeVal.exe?%40GV.Start_Gen+" + str(value)
    return requests.request("GET", url, headers={}, data={}).text
```

ลำดับจริง (แก้ 2026-07-24) — `Start_Gen` เป็น level command:
เมื่อได้ RemoteStart: `write_start_gen(1)` → `time.sleep(15)` → `remote_start_plc(1)` → `sleep(2)` → `remote_start_plc(0)` และคง `Start_Gen=1` ไว้จนกว่าจะหยุด

**สถานะ gen tag แต่ละตัว:**

| tag | มีจริง? | หมายเหตุ |
|---|---|---|
| `Start_Gen` (run/stop) | ✅ live | level command: ส่ง `1` ให้ generator ทำงาน และส่ง `0` เพื่อหยุด; ใช้ทั้ง DC flow และ AC DataTransfer |
| `generator_status` (readback) | ❌ **ยังไม่มี** | `sleep(15)` เป็น open-loop ไม่อ่านสถานะกลับ → **ต้องขอทีม PLC** ถึงจะทำ timeout handling ได้ |

รายละเอียดค้าง/คำถามทีม PLC ดู `OPEN_QUESTIONS.md`

> หมายเหตุ: `read_plc_value`/`write_plc_value` ที่ §7.3 เขียนไว้ **ไม่มีอยู่จริง** ของจริงคือ ~30 ฟังก์ชัน copy-paste ต่อ tag ใน `helpf/plc_function.py` (ไม่มี timeout/try/except)

---

## 8. Generator / DSE4620 Modbus Integration ✅ อ่านค่าได้แล้ว (2026-07-17)

> **แก้แล้ว:** ปัญหา "ค่าไม่เปลี่ยนตอน start gen" เกิดจาก **อ่านผิด address range** — GenComm ใช้ `register = page×256 + offset` แต่เดิมสแกน `0x0000–0x000B` = **page 0 (Communications Status)** ซึ่งเป็น static config metadata (ค่าที่เห็น 12/3/2/8176 คือ exception code / password status / GenComm version / baud bitmask — ไม่ใช่ instrumentation) ค่าจริงอยู่ **page 4 = 1024 (0x0400)** ขึ้นไป
> ไฟล์ที่อ่านได้จริง: `OCPP_TACT/gen_telemetry.py` (poller ส่งค่าขึ้น backend แล้ว) และ `OCPP_TACT/dse_probe.py` (diagnostic read-only)

### 8.1 Hardware

| อุปกรณ์ | รายละเอียด |
|---|---|
| Genset | YC48GF — YUCHAI YC4D90Z-D21 (4 สูบ, 4.21L, 1500rpm, Turbo) |
| Rating | PRP 50kW / 62.5kVA, LTP 55kW / 68.5kVA, 400V-50Hz-cos(fi)0.8 |
| Alternator | LEROY-SOMER TAL A42H, 3 phase, Star serial |
| Fuel cons. | 16.3 L/h @100% PRP, 12.4 @75%, 8.3 @50% |
| Controller | Deep Sea **DSE4620** (Auto Mains Failure, USB comms) |
| Converter | **DSE857** USB→RS485 (Modbus RTU, RS485 up to 1.2 km, power 8–35V DC) |
| Edge Device | **EdgeBox-RPI-200** (Raspberry Pi CM4, Ubuntu/RPi OS, user `pi`) |

### 8.2 Communication Chain

```
DSE4620 (USB-B) → DSE857 (USB-A) → RS485 → EdgeBox-RPI-200 (/dev/ttyUSB0)
```

### 8.3 ค่า Config ที่ยืนยันแล้ว ✅

| Parameter | Value |
|---|---|
| Port | `/dev/ttyUSB0` |
| Baud | **19200** (ไม่ใช่ 9600) |
| Bytesize / Parity / Stopbits | 8 / N / 1 |
| Mode | Modbus RTU |
| Slave ID **10** | DSE857 เอง (config registers) |
| Slave ID **11** | **Passthrough → DSE4620** ← ใช้ตัวนี้ |
| Function code | FC3 (read holding registers) |
| **Address จริง** | อ่าน **page 4 = BASE 1024** (0x0400) 20 registers ในข้อความเดียว — ไม่ใช่ 0x0000 |

### 8.4 Library

- ✅ `pymodbus` (Gen.py ใช้อยู่ ทำงานได้) — จัดการ breaking change ด้วย `inspect.signature` เช็ค `device_id=` vs `slave=` เอง
- ✅ `minimalmodbus 2.1.1` — ใช้ได้เหมือนกัน (`dse_probe.py` ใช้ตัวนี้)
- หมายเหตุ: เวอร์ชันเก่าของหัวข้อนี้เขียน "อย่าใช้ pymodbus" — ไม่จริงแล้ว แค่ต้องเช็ค kwarg ตาม pymodbus version

### 8.5 Working Snippet (page 4, ยืนยันด้วยค่าจริงแล้ว)

```python
# ดูฉบับเต็มที่ OCPP_TACT/gen_telemetry.py (มี reconnect + POST ขึ้น backend)
import inspect
from pymodbus.client import ModbusSerialClient

BASE, SLAVE = 1024, 11   # page 4, passthrough → DSE4620
client = ModbusSerialClient(port="/dev/ttyUSB0", baudrate=19200, parity="N",
                            stopbits=1, bytesize=8, timeout=1)
client.connect()
_ID = "device_id" if "device_id" in inspect.signature(
    client.read_holding_registers).parameters else "slave"

rr = client.read_holding_registers(address=BASE, count=20, **{_ID: SLAVE})
r = rr.registers
rpm      = r[1030 - BASE]                       # u16
freq_hz  = r[1031 - BASE] * 0.1                 # u16 ×0.1
fuel_pct = r[1027 - BASE]                       # u16 %
l1n_v    = ((r[1032-BASE] << 16) | r[1033-BASE]) * 0.1   # u32 MSW-first ×0.1
```

**Register map (page 4):** 1024 oil kPa · 1025 coolant °C · 1027 **fuel %** · 1028 charge-alt V ×0.1 · 1029 battery V ×0.1 · 1030 **RPM** · 1031 **freq Hz ×0.1** · 1032/1034/1036 gen L-N V (u32 ×0.1) · 1038/1040/1042 gen L-L V (u32 ×0.1)

### 8.6 ค่าที่อ่านได้จริง (Slave 11, page 4) — เทียบ log 2026-xx

ตอน gen วิ่ง: `RPM 1534 · Freq 51.2 Hz · Fuel 15% · Battery 14.0 V · Oil 468 kPa · Coolant 58°C · L1-N 231.6 V · L1-L2 401.6 V`
ตอน gen ดับ: ทุกค่าไป 0 อย่างสอดคล้อง (RPM 0 · Freq 0 · L-N 0) — **fuel อ่านได้ 15% (ไม่ใช่ n/a) = มี fuel sender ต่ออยู่จริง**

> เกร็ดที่เคยเข้าใจผิด (page 0): `0x000A=8176=0x1FF0` = baud-availability bitmask (bit 9 = 19200 = baud ที่ใช้จริง), `0x0006=3` = password status, `0x0009=2` = GenComm version — ทั้งหมด static config ไม่เกี่ยวกับ instrumentation

### 8.7 ปัญหาที่แก้แล้ว ✅ / ที่ยังเหลือ

- ✅ **อ่านค่าไม่ออก** → แก้แล้ว (page×256, อ่าน BASE 1024)
- ✅ **"DSE857 ต้อง config gateway ก่อน"** → ไม่จริง 19200/slave10/slave11 = factory default อยู่แล้ว
- ⚠️ **fuel% = ค่าเดียวที่ไม่มี OCPP measurand** → ใช้ sidecar HTTP POST (gen_telemetry.py → `/api/telemetry/generator`) ไม่ส่งผ่าน OCPP
- 🔴 **ถ้า `/dev/ttyUSB0` หาย:** `ls /dev/ttyUSB0`, `dmesg | tail -20`; ดู LED บน DSE857 = **อัตราการกะพริบ** (ไม่ใช่สี) กะพริบช้า = ไม่มี USB link ไป 4620

### 8.8 ข้อจำกัดฮาร์ดแวร์สำคัญ

- **DSE4620 มี USB แค่พอร์ตเดียว** → ต่อ PC (DSE Config Suite) กับ DSE857 พร้อมกันไม่ได้ ต้องสลับ
  - โหมด Configure: `DSE4620 USB → PC`
  - โหมด Production: `DSE4620 USB → DSE857 → RS485 → EdgeBox`
- **LED บน DSE857 = ดูที่อัตราการกะพริบ ไม่ใช่สี** (ตาม install instructions 053-169): Off = ไม่มีไฟ/RS485 ไม่ทำงาน · กะพริบช้า = ไม่มี USB link ไป controller · กะพริบเร็ว = link ติด+data วิ่ง

### 8.9 Data pipeline ขึ้น App (ที่ทำแล้ว 2026-07-17)

```
DSE4620 ──Modbus page4── EdgeBox: gen_telemetry.py
   └─ POST /api/telemetry/generator ──► backend (generatorState.ts)
        ├─ persist Station.generator (REST /stations ใช้ตอนเปิดหน้า)
        ├─ staleness watchdog 15s (เงียบ >35s → status 'Unknown')
        └─ socket 'generatorUpdate' ──► App (ChargerScreen + ChargingScreen)
```

- **ไม่ส่งผ่าน OCPP** เพราะ (1) MeterValues ผูกกับ transaction (ส่งได้เฉพาะตอนชาร์จ) (2) fuel% ไม่มี measurand (3) เสี่ยง crash CP.py (`send_meter_values` ไม่มี try/except + hardcode 7 measurands ที่ `CP.py:1311`)
- deploy: copy `gen_telemetry.py` ขึ้น EdgeBox, `pip install pymodbus requests`, รันเป็น process แยกจาก CP.py (คนละ serial port: gen=ttyUSB0, energy meter=ttyACM0)
- ⚠️ ตั้ง `DEVICE_API_KEY` ใน backend `.env` + `TACT_DEVICE_KEY` ฝั่ง EdgeBox ให้ตรงกัน (ไม่งั้น endpoint เปิดรับ POST จากใครก็ได้)

**ยังเหลือ (design decision — ดู `OPEN_QUESTIONS.md`):** capacity/kWh row ต้องรู้ขนาดถัง (ลิตร) + kWh/ลิตร ถึงจะแปลง fuel% → kWh คงเหลือได้ถูก (ตอนนี้แสดง fuel% ตรง ๆ)

### 8.10 Tips การทำงานบน EdgeBox

ใช้ heredoc สร้างไฟล์ Python (copy-paste ตรงๆ จะเจอ non-UTF-8 → SyntaxError):

```bash
cat > /home/pi/script.py << 'EOF'
# code here
EOF
sudo python3 /home/pi/script.py
```

---

## 9. Charging Flow (End-to-End)

### 9.1 Start

```
1.  User เสียบสาย → PLC: iCpStateCcs='2' → EdgeBox → StatusNotification: Preparing
                    → CSMS → Backend → Socket.IO → App
2.  App แสดง "Preparing"
3.  User กด Start → POST /api/charging/start
4.  Backend: สร้าง Session(Preparing) → gen idTag → addRfidCard → RemoteStartTransaction → CSMS
5.  CSMS → EdgeBox: RemoteStartTransaction → Accepted → set flag myremotestart_c1 = 1
6.  EdgeBox loop: เห็น flag → Start_Gen=1 → รอ 15s → HTTP pulse: remote_start_webvisit=1 → sleep(2s) → 0
7.  PLC: Generator ทำงานต่อโดย Start_Gen คงเป็น 1 → เริ่ม Charger
8.  Charger ชาร์จ → PLC: iCpStateCcs='7', usiLinkStateCcs='13'
9.  EdgeBox poll เห็น Charging → อ่าน meterStart จาก Energy Meter → StartTransaction → CSMS
10. CSMS → Backend: session.state='Charging', เก็บ transactionId → Socket.IO 'chargingStarted'
11. App เข้าหน้า Charging
12. ระหว่างชาร์จ: EdgeBox ส่ง MeterValues ทุก 4s → CSMS → Backend → 'meterUpdate' → App
```

### 9.2 Stop

```
1. User กด Stop → POST /api/charging/:id/stop
2. Backend → RemoteStopTransaction(transactionId) → CSMS → ตอบ App "Stop command sent"
3. CSMS → EdgeBox → Accepted → set flag my_remote_stop_c1 = 1
4. EdgeBox loop → HTTP pulse: remote_stop_webvisit=1 → sleep(3s) → 0 → ถ้าไม่มี session อื่น ให้ Start_Gen=0
5. PLC: หยุด Charger → ตั้ง Finishing signal
6. EdgeBox → StopTransaction + meterStop → CSMS → Backend → 'chargingStopped' → App หน้า Finishing
```

### 9.3 State Machine

```
Preparing ──StartTransaction──► Charging ──StopTransaction──► Stopped ──► Finishing (UI)
                                    │
                                 (Fault)
                                    ▼
                                 Faulted
```

---

## 10. Error Codes (App)

| Code | English | Thai |
|---|---|---|
| ERR_001 | Communication Error | การสื่อสารขัดข้อง |
| ERR_002 | Overcurrent Detected | กระแสไฟเกิน |
| ERR_003 | Overvoltage Detected | แรงดันไฟเกิน |
| ERR_004 | Ground Fault | ไฟรั่วลงดิน |
| ERR_005 | Emergency Stop Activated | หยุดฉุกเฉิน |
| ERR_006 | Connector Lock Failure | ล็อคหัวชาร์จล้มเหลว |
| ERR_007 | Temperature Error | อุณหภูมิผิดปกติ |
| ERR_008 | Internal Error | ข้อผิดพลาดภายใน |

---

## 11. Run & Deploy

### Local Dev
```bash
# Backend (ต้องรันก่อน)
cd tact-backend
npm install
npm run seed      # ครั้งแรกเท่านั้น
npm run dev       # port 5000

# Frontend
cd TACTAPP
npm install
npx expo start    # กด 'a' เปิด Android
```
⚠️ แก้ IP ใน `TACTAPP/src/config/api.ts` ให้ตรงเครื่อง (`ipconfig` → IPv4) | มือถือจริงต้อง WiFi เดียวกัน

### Backend Deploy (Windows Server / PM2)
```bash
git pull origin main
npm install
npm run build
pm2 start dist/index.js --name tact-backend
pm2 startup && pm2 save
```

Port 5000 ชน → 
```bash
netstat -ano | findstr :5000
tasklist | findstr <PID>
taskkill /PID <PID> /F
```

### Mobile Build
```bash
npm install -g eas-cli
eas login
eas build:configure
eas build -p android --profile preview      # APK
eas build -p android --profile production   # AAB
```

### Server Requirements
Node ≥18 | MongoDB ≥6 | Python ≥3.9 | RAM ≥2GB | Storage ≥20GB | Ubuntu 22.04 LTS (หรือ Windows Server ที่ใช้อยู่)

---

## 12. Known Issues

1. **Cleartext Traffic** — Android 9+ block HTTP → ต้อง `usesCleartextTraffic: true`
2. **Google Maps API Key** — ต้อง restrict ให้เฉพาะ package `com.tact.charger`
3. **Session Restore** — หลัง clear app ต้องเรียก `checkActiveSession()` เพื่อ restore
4. **pymodbus 3.13** — API breaking (`slave` kwarg หาย) → ใช้ minimalmodbus
5. **DSE857 ttyUSB0 หลุด** — ดู §8.7

---

## 13. Status Board

### ✅ เสร็จแล้ว
- [x] โครงสร้าง Project (Frontend + Backend)
- [x] UI ครบ 10 screens + BottomTabs
- [x] Auth (Login/Register) เชื่อม API จริง + JWT + AsyncStorage
- [x] MongoDB connection + Seed data
- [x] Map ดึงสถานีจาก DB
- [x] Fault Simulation (DEV_MODE)
- [x] 2 ภาษา (TH/EN)
- [x] CSMS + EdgeBox OCPP connection ใช้งานได้
- [x] Backend push ขึ้น GitHub + รันบน Windows Server
- [x] ยืนยัน Modbus params: 19200 / Slave 11 / FC3

### 🔄 กำลังทำ / รอ deploy
- [x] อ่านค่า live DSE4620 ผ่าน Modbus (page 4 / BASE 1024) — `gen_telemetry.py`
- [x] Generator telemetry pipeline → App (backend `/api/telemetry/generator` + socket `generatorUpdate` + แก้ UI ที่ hardcode "Active")
- [ ] deploy `gen_telemetry.py` ขึ้น EdgeBox จริง + ตั้ง `DEVICE_API_KEY` (EdgeBox เงียบตั้งแต่ 2026-05-22 — เช็คว่า online ก่อน)

### ⬜ ยังไม่เสร็จ
- [x] ~~หน้า Charger เชื่อม API (Start/Stop จริง)~~ — เสร็จแล้ว (เดิม status board ผิด)
- [ ] Profile ดึงจาก API
- [ ] Forgot Password (⚠️ ปัจจุบันทำครึ่งทาง + ส่ง temp password ใน response = ช่องโหว่ ดู `OPEN_QUESTIONS.md`)
- [ ] Charging History
- [ ] `generator_status` GV tag (รอทีม PLC) + Timeout handling
- [ ] capacity row: fuel% → kWh คงเหลือ (รอขนาดถัง + kWh/ลิตร)
- [ ] OTA update support
- [ ] Build APK / Play Store

---

## 14. Reference Docs (ในโฟลเดอร์ project)

| ไฟล์ | เนื้อหา |
|---|---|
| `TACT_Mobile_Application_Documentation.md` | เอกสารระบบเต็ม v1.0.0 |
| `TACT_ขอบเขตของงาน_TOR_2.pdf` | TOR สัญญา |
| `DSE857DataSheet.pdf` | สเปก USB→RS485 converter |
| `DSE4610DSE4620DataSheet.pdf` | สเปก controller |
| `DSE4610DSE4620OperatorsManual.pdf` | คู่มือ + terminal wiring + CT connections |
| `YC_genset_50kW_datasheet1.pdf` | สเปก genset YC48GF |
| `EdgeBoxRPi200_Edge_Computing_Controller_User_Manual.pdf` | คู่มือ EdgeBox |

---

## 15. Working Preferences

- ตอบเป็นภาษาไทย
- สร้างไฟล์ Python บน EdgeBox ด้วย heredoc (`cat > file << 'EOF'`) เสมอ
- ตอนแก้ปัญหา hardware → ให้คำสั่ง diagnostic ที่รันได้ทันที ไม่ต้องอธิบายทฤษฎียาว
- Backend/Frontend อยู่คนละ repo — ระบุ path ให้ชัดว่ากำลังแก้ตัวไหน
