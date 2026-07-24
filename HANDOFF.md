# TACT EV Charging — Handoff / สรุปส่งต่องาน

> สำหรับคนที่มารับช่วงทำต่อ — อ่านไฟล์นี้ก่อน
> Last updated: 2026-07-24 (ปรับ generator control ให้ใช้ Start_Gen tag เดียว)
> อ่านคู่กับ `OPEN_QUESTIONS.md` (ปัญหาค้าง + จุดที่ CLAUDE.md ผิด) และ `CHARGER_REQUIREMENTS.md`

---

## 0. TL;DR

ระบบชาร์จรถ EV แบบเคลื่อนที่ (ไฟจากเครื่องปั่นไฟ ไม่ใช้กริด) — **ตอนนี้ deploy แล้วและทำงานครบวงจรบน server จริง**: ตู้ online, ชาร์จ DC ได้, ค่าเครื่องปั่นไฟขึ้นแอปแบบ real-time

**เหลือหลัก ๆ:** (1) ทำ AC ให้ครบ (ย้ายจาก OCPP connector → DataTransfer gen control) (2) เทสต์ Remote Stop DC (3) รอ PLC เพิ่ม `generator_status` readback (4) เก็บงาน security ก่อน production

---

## 1. สถาปัตยกรรมจริง (corrected — CLAUDE.md เดิมผิดหลายจุด)

```
📱 App (Expo/RN)
   │ REST + Socket.IO
   ▼
🖥️ Backend (Node/TS, 212.80.215.42:5000)
   │  ├─ cookie auth ──► 🐍 CSMS Flexxfast :8080 (HTTP API + /ws log stream)
   │  └─ MongoDB (212.80.215.42:27017)                    ▲
   │                                                       │ OCPP :9000/ocpp/TACT30KW
   │                                    📦 EdgeBox (Raspberry Pi) ──┘
   │                                       ├─ CP.py (ocpp.service)
   │                                       │    ├─HTTP CGI─► ⚙️ PLC 192.168.0.8 (คุม DC หัว1 + generator)
   │                                       │    └─Modbus ttyACM0─► ⚡ Energy Meter (DC)
   │                                       └─ gen_telemetry.py (tact-gen.service)
   └─ POST /api/telemetry/generator ◄────────  └─Modbus ttyUSB0─► DSE857 ─► 🔌 DSE4620 (generator)
```

**หัวใจที่ต้องเข้าใจ:**
- ตู้มี **หัวชาร์จ DC จริงหัวเดียว (connector 1)** + **เต้า AC** + **เครื่องปั่นไฟ 1 ตัว (จ่ายทั้งตู้)**
- **PLC (192.168.0.8) คุมแค่ DC หัว 1 + generator** — ไม่มี status ของ AC
- **connector 2 (AC) กำลังถูกตัดออกจาก OCPP** เพราะ AC ไม่มีสาย CP → ไม่มี Preparing/Charging/StopTransaction → ไม่เข้ากับ model ของ OCPP → AC = "เปิด/ปิดเครื่องปั่นไฟ" ควบคุมผ่าน **OCPP DataTransfer** แทน
- **PLC คุยนอกวง LAN ไม่ได้** → ทุกคำสั่งถึง PLC ต้องผ่าน CP.py (EdgeBox) เท่านั้น: `App → Backend → CSMS → CP.py → PLC`

---

## 2. สิ่งที่ deploy แล้ว & ทำงาน (verified 2026-07-23)

| ส่วน | ที่ตั้ง / service | สถานะ |
|---|---|---|
| **Backend** | server `212.80.215.42:5000` (Windows, `C:\Users\Administrator\Documents\TACTapp\tact-backend`, รันด้วย `npm run dev`) | ✅ online, ต่อ CSMS + Mongo ได้ |
| **CSMS** | Flexxfast `csms_web_ui_flexxfast.py` @ :8080 (web/API) + :9000 (OCPP) | ✅ (source อยู่ใน Downloads ไม่ใช่ repo) |
| **CP.py** | EdgeBox `ocpp.service` → `/home/pi/ocpp/CP.py` | ✅ ตู้ online, DC start ได้ |
| **gen_telemetry.py** | EdgeBox `tact-gen.service` → `/home/pi/gen_telemetry.py` | ✅ อ่าน DSE4620 → ส่งขึ้นแอป |
| **App** | Expo/RN, ชี้ `212.80.215.42:5000` | ✅ ตู้ online + gen real-time |

**Features ที่ทำงานแล้ว:**
- ✅ Backend ↔ CSMS **cookie login** (CSMS_USER/CSMS_PASS) — เดิมโดน 401 มาตลอดเพราะไม่เคยส่ง login
- ✅ ตู้ขึ้น **Online** + connector status ในแอป
- ✅ **Generator telemetry**: DSE4620 (Modbus page 4, BASE 1024) → gen_telemetry.py → backend → socket → แอป (fuel %, สถานะ Running/Stopped) — แสดงค่าจริง ไม่ปลอมแล้ว
- ✅ **DC RemoteStart**: กด start → `Start_Gen` (ค้าง 15 วิ) → `remote_start` → ชาร์จ → MeterValues real-time
- ✅ DSE probe ยืนยัน: DSE4620 model 4623, page 4 อ่านได้, มี fuel sender (อ่าน ~15%)

---

## 3. สิ่งที่ต้องทำต่อ (TODO)

### 🟥 A. ทำ AC ให้ครบ (กำลังทำ — CP.py เสร็จแล้ว เหลือ backend + app)

CP.py แก้แล้ว: ตัด connector 2 ออกจาก OCPP (comment ไว้) + เพิ่ม `@on(DataTransfer)` handler (`StartGen`/`StopGen` → คุม generator) + เพิ่ม `@on(TriggerMessage)` — **แต่ยังไม่ deploy** (ต้อง copy CP.py ตัวใหม่ขึ้น Pi)

เหลือ:
- [ ] **Backend**: เพิ่ม `dataTransfer(messageId)` ใน `ocppBridge.ts` (เรียก CSMS `/api/command` command `data_transfer`) → เปลี่ยน route AC จาก `RemoteStart(connector 2)` เป็น **DataTransfer(`StartGen`/`StopGen`)** + แก้ seed ให้ AC ไม่ใช่ OCPP connector
- [ ] **App**: ปุ่ม AC → เรียก gen control (ไม่ใช่ `startCharging`) + UI AC เป็น "เปิด/ปิดจ่ายไฟ AC" (ไม่มี charging session / ไม่มี SoC)
- [ ] **AC energy meter**: มีมิเตอร์ AC แยกแต่ยังไม่เคยดึงค่า — ต้องหา slave/port แล้วอ่าน (สำหรับคิดเงิน AC)
- [ ] ⚠️ **Safety**: gen ติด = ไฟเข้าเต้า AC ทันที **ไม่มี interlock** — ต้องคุยทีมไฟฟ้าเรื่อง relay กันไฟค้าง (ยัง defer)

### 🟧 B. เทสต์ & verify

- [ ] **DC Remote Stop end-to-end** (ยังไม่ได้เทสต์!) — จับตา log `## send_stop_transaction 1 Remote` (= StopTransaction ยิง) + จังหวะ `Start_Gen=0` (ยิงหลัง remote_stop; ถ้า gen ตัดกระทันหันตอนชาร์จยังไม่จบ → ย้ายคำสั่งหยุดไปหลัง StopTransaction)
- [ ] **Gen voltage word-order** — ตอน gen วิ่งจริง ดู `gen L1-N` ควร ~231V (ถ้าเลขบ้า ให้สลับ u32 low-word-first ใน gen_telemetry.py มี note ในโค้ด)
- [ ] **Deploy CP.py ตัวล่าสุด** (ตัด connector 2 + DataTransfer + TriggerMessage) ขึ้น Pi + restart

### 🟨 C. รอทีม PLC

- [x] Generator control ใช้ `Start_Gen` tag เดียวแบบ level: `1` = ทำงาน, `0` = หยุด
- [ ] `generator_status` readback tag — ไว้ทำ timeout handling closed-loop

### 🟦 D. Security (ก่อน production — ดูรายละเอียดใน `OPEN_QUESTIONS.md` §3)

- [ ] `forgot-password` ส่ง temp password กลับใน response = **account takeover** (`auth.ts:319`)
- [ ] `JWT_SECRET` ใช้ default `'default-secret'` ถ้าไม่ตั้ง .env → ปลอม token ได้
- [ ] `DEVICE_API_KEY` ไม่ได้ตั้ง → endpoint telemetry เปิดรับใครก็ได้ (public IP)
- [ ] Socket.IO handshake เชื่อ `userId` ดิบ ไม่ verify JWT (`index.ts:85`)
- [ ] admin routes: role enum เป็น lowercase แต่เช็ค `'Admin'` → admin route 403 ถาวร; `/admin/clear-all` ไม่มี authorize
- [ ] ย้าย backend จาก `npm run dev` (ts-node-dev) → production (`npm run build` + pm2)

### 🟩 E. Product decisions (ต้องการข้อมูลจากคน)

- [ ] **capacity → kWh คงเหลือ**: ต้องรู้ขนาดถัง (ลิตร) + kWh/ลิตร (ตอนนี้แสดง fuel % ตรง ๆ)
- [ ] **fuel calibration**: อ่านได้ 15% — เทียบกับถังจริง/จอ DSE ว่า sender calibrate ตรงมั้ย

---

## 4. โครงสร้าง repo & การ deploy

| โฟลเดอร์ | คืออะไร | git? | deploy ยังไง |
|---|---|---|---|
| `TACTAPP/` | Frontend (Expo/RN, TypeScript) | ✅ tracked | `eas build` (APK) / `npx expo start` (dev) |
| `tact-backend/` | Backend (Node/Express/TS) | ✅ tracked | server: `git pull` → `npm run build` → restart |
| `OCPP_TACT/` | สคริปต์ EdgeBox (CP.py, gen_telemetry.py, plc_function.py, dse_probe.py) | 🚫 **gitignored** | **copy มือขึ้น Pi** (มี secret: Telegram token, iMPS Mongo creds) |

**ปลายทางบน EdgeBox (Pi):**
- `/home/pi/ocpp/CP.py` + `/home/pi/ocpp/helpf/plc_function.py` (ocpp.service)
- `/home/pi/gen_telemetry.py` (tact-gen.service)
- deploy: copy ทับ → `python3 -m py_compile` เช็ค → `sudo systemctl restart ocpp.service` / `tact-gen.service`

**.env ที่ต้องมีบน server** (`tact-backend/.env`, gitignored):
```
CSMS_USER=admin
CSMS_PASS=<...>          # login CSMS
# ที่เหลือมี default ถูกต้องบน server แล้ว (MONGODB_URI, CSMS URL=127.0.0.1:8080, CP_ID)
# ควรตั้งก่อน production: JWT_SECRET, DEVICE_API_KEY
```

**Firewall**: server ต้องเปิด inbound TCP **5000** (ให้แอป+Pi เข้าถึง backend)

---

## 4.5 Code Map — ไฟล์ไหนทำอะไร

### Backend (`tact-backend/src/`)
| ไฟล์ | ทำอะไร | ฟังก์ชัน/จุดสำคัญ |
|---|---|---|
| `index.ts` | entry point, mount routes, Socket.IO, init services | `import 'dotenv/config'` (บรรทัดแรก!), `app.use('/api/...')`, `io.on('connection')` (~85 อ่าน userId ดิบ), `initCSMSListener(io)` + `initGeneratorState(io)` |
| `routes/auth.ts` | login/register/me/profile/**forgot-password**/change-password | forgot-password (~319, ช่องโหว่) |
| `routes/stations.ts` | GET stations (merge status จาก CSMS), admin CRUD, toggle | `GET /` (~12, `getChargePoints` + `withGeneratorFreshness`), `GET /:id`, `authorize('Admin')` (case ผิด) |
| `routes/charging.ts` | start/stop/active/history/fault | `POST /start` (~21, `initialState` AC ~86, `remoteStart` ~105), `POST /:id/stop` (**AC branch ~210**, `remoteStop` ~259) |
| `routes/telemetry.ts` | รับ gen telemetry จาก EdgeBox | `POST /generator` (`DEVICE_API_KEY` ~11) |
| `services/csmsAuth.ts` | **CSMS cookie login** + `csmsAxios` (แนบ cookie อัตโนมัติ) | `performLogin`, `getCsmsCookie`, `csmsAxios` |
| `services/ocppBridge.ts` | สั่ง CSMS ผ่าน HTTP (`/api/command`) | `remoteStart` (~70), `remoteStop` (~101), `addRfidCard`, `getChargePoints`, `triggerMessage` — **DataTransfer เพิ่มที่นี่** |
| `services/csmsListener.ts` | ฟัง CSMS `/ws` log → emit Socket.IO | `connect()` (WS + cookie), handler: StartTransaction/**MeterValues** (~129, regex parse)/StopTransaction/StatusNotification |
| `services/generatorState.ts` | เก็บค่า gen + staleness watchdog + persist | `buildSnapshot`, `ingestGenerator`, `withGeneratorFreshness` |
| `models/Station.ts` | schema สถานี + charger subdoc + **generator subdoc** + `cpId` | |
| `models/ChargingSession.ts` | schema session | `chargerType`, `transactionId` |
| `models/User.ts` | schema user | `role` enum lowercase (~61, ทำ admin 403) |
| `middleware/auth.ts` | JWT authenticate/authorize | `JWT_SECRET` fallback `'default-secret'` (~42, ~112) |
| `seeds/seed.ts` | seed users + stations (**destructive** deleteMany) | users (~26), chargers CCS2+AC (~62) |

### Frontend (`TACTAPP/`)
| ไฟล์ | ทำอะไร | จุดสำคัญ |
|---|---|---|
| `App.tsx` | navigation + socket listeners + start/stop handlers | `setupSocketListeners` (~169, `onGeneratorUpdate` ~296), `handleStartCharging` (~383, connectorId heuristic ~398), `handleStopCharging` (~490, AC branch) |
| `src/config/api.ts` | `API_BASE_URL` | `LOCAL_IP` (~12, = server) |
| `src/services/api.ts` | apiClient (REST) | `startCharging`/`stopCharging` (~196), `forgotPassword` — **AC gen control เพิ่มที่นี่** |
| `src/services/socket.ts` | socket events | `onMeterUpdate`, `onGeneratorUpdate`, `onConnectorStatus` |
| `src/screens/ChargerScreen.tsx` | หน้า station detail + charger list + gen | `isChargerSelectable` (~96, AC selectable), generator section (~186), Start button (~293) |
| `src/screens/ChargingScreen.tsx` | หน้าชาร์จ active + gen | generator section (~170) |
| `src/types/index.ts` | types | `Station`, `Charger`, `GeneratorLive` |
| `src/i18n/translations.ts` | strings TH/EN | |
| `src/utils/mapper.ts` | backend→frontend map | `mapStation` (มี `generator` field) |

### EdgeBox (`OCPP_TACT/` → deploy ไป `/home/pi/ocpp/` + `/home/pi/`)
| ไฟล์ | ทำอะไร | จุดสำคัญ |
|---|---|---|
| `CP.py` | OCPP client (ตู้) | `__init__` (state + `.txt` flags + `ac_gen_*`), `@on` handlers: RemoteStart(~1041)/RemoteStop(~1143)/**TriggerMessage**(~1180)/**DataTransfer**(~1186), `status_notification_cp/usiLink/emer` (guard connector 2), `main_run_program` (`Start_Gen=1` แล้วรอ 15s ตอน start, `Start_Gen=0` ตอน stop ถ้าอีก session ว่าง, AC gen block, finishing→StopTransaction), `main()` gather (connector 2 ถูก comment) |
| `CP(AC).py` | backup เท่านั้น | ห้าม deploy/แก้เป็นตัวหลัก; production ใช้ `CP.py` |
| `helpf/plc_function.py` | เขียน/อ่าน tag PLC (HTTP CGI) | `remote_start_plc`/`remote_stop_plc`/`write_start_gen`/`write_stop_gen` (มี print), `read_tag_status`, `Head1Finishing` |
| `gen_telemetry.py` | อ่าน DSE4620 → POST backend | `read()` (register map page 4), `u32()` (word order — สลับถ้าเลขเพี้ยน), `post_backend()` |
| `helpf/len_meter_test.py` | อ่าน energy meter (DC) | `get_meter_value_pilot`, `get_livemeasure_pilot` |
| `dse_probe.py` | diagnostic DSE (read-only) | รันตอน troubleshoot (stop tact-gen ก่อน กัน port ชน) |

---

## 4.6 TODO ← แก้ตรงไหน (mapping)

### A. AC via DataTransfer
| ทำอะไร | ไฟล์ | แก้ตรงไหน |
|---|---|---|
| เพิ่มฟังก์ชันส่ง DataTransfer | `tact-backend/src/services/ocppBridge.ts` | เพิ่ม `dataTransfer(messageId, data?)` — เรียก `csmsAxios.post('/api/command', {cp_id, command:'data_transfer', params:{vendor_id:'TACT', message_id, data}})` (แบบเดียวกับ `remoteStart`) |
| route AC → DataTransfer | `tact-backend/src/routes/charging.ts` | AC start: แทน `remoteStart` ด้วย `dataTransfer('StartGen')` / AC stop (branch ~210): แทนด้วย `dataTransfer('StopGen')` |
| seed เอา AC ออกจาก connector | `tact-backend/src/seeds/seed.ts` | ลบ charger `type:'AC'` (~70) หรือทำเป็น flag แยก (ไม่ใช่ OCPP connector) |
| ปุ่ม AC เรียก gen control | `TACTAPP/src/services/api.ts` + `App.tsx` + `ChargerScreen.tsx` | เพิ่ม `apiClient.acGenStart()/acGenStop()` → route ไป endpoint ใหม่ / UI AC เป็น "เปิด/ปิดจ่ายไฟ" |
| (CP.py ฝั่งรับ = **เสร็จแล้ว**) | `OCPP_TACT/CP.py` | `@on(DataTransfer)` ~1186 + AC gen block ~1783 — แค่ deploy |
| อ่าน AC meter | `OCPP_TACT/helpf/len_meter_test.py` หรือ gen_telemetry | หา slave/port ของมิเตอร์ AC แล้วอ่าน |

### B. เทสต์ / verify
| ทำอะไร | ไฟล์ |
|---|---|
| DC Remote Stop | `CP.py` main_run_program remote-stop (~1697) + finishing (~1750); `charging.ts` stop (~259) — เทสต์ + ดู log `send_stop_transaction 1 Remote` |
| gen voltage word-order | `gen_telemetry.py` `u32()` — ถ้า L1-N เพี้ยน สลับ `(r[i]<<16)|r[i+1]` เป็น `(r[i+1]<<16)|r[i]` |

### D. Security
| ช่องโหว่ | ไฟล์:จุด |
|---|---|
| forgot-password ส่ง temp password | `tact-backend/src/routes/auth.ts` ~319 |
| JWT default secret | `tact-backend/src/middleware/auth.ts` ~42, ~112 + ตั้ง `.env` |
| telemetry endpoint เปิด | `tact-backend/src/routes/telemetry.ts` ~11 + ตั้ง `DEVICE_API_KEY` |
| Socket.IO ไม่ verify JWT | `tact-backend/src/index.ts` ~85 |
| admin role case + missing authorize | `models/User.ts` ~61, `routes/stations.ts` (authorize), `routes/charging.ts` ~438 (`/admin/clear-all`) |

---

## 5. ⚠️ กับดัก / สิ่งที่ต้องรู้ก่อนแตะโค้ด

1. **`CLAUDE.md` ผิดหลายจุด** (generator tag, ลำดับ start, PLC IP/connector, CSMS URL, status board) — **verify กับโค้ดก่อนเชื่อ** รายการเต็มใน `OPEN_QUESTIONS.md` §3
2. **CSMS ต้อง login (cookie)** — source อยู่ `C:\Users\Asus\Downloads\csms_web_ui_flexxfast.py` (ไม่อยู่ใน repo) ใช้ cookie-session, รองรับ `DataTransfer`, session หมด 8 โมงเช้า (backend re-login เองแล้ว)
3. **`import 'dotenv/config'` ต้องเป็น import แรกสุด** ใน `index.ts` — ไม่งั้น service ที่อ่าน env ตอน import (เช่น csmsAuth) จะได้ค่าว่าง
4. **CP.py เปราะ**: PLC HTTP call ไม่มี timeout/try-except, `time.sleep` แบบ sync ใน async loop (บล็อก event loop ~17 วิตอน start), state เก็บใน `.txt` ~40 ไฟล์ (พังตอนไฟดับกลางเขียน → crash loop เคยเกิด 336 ครั้ง)
5. **`OCPP_TACT/CP.py` ใน 3 ไฟล์**: `CP.py` = ตัวจริง, `CP1.py`/`CP_nomal.py` = กับดัก (ต่อ CSMS ผิด / รันไม่ได้) — mtime แยกไม่ออก
6. **connector 2 = ghost** (อ่าน PLC tag เดียวกับหัว 1 → status ล็อกกัน) — กำลังตัดออก
7. **AC ไม่ใช่ charging session** — มันคือ generator on/off ผ่าน DataTransfer อย่ายัดกลับเข้า OCPP connector

---

## 6. เอกสารอ้างอิงในโปรเจกต์

| ไฟล์ | เนื้อหา |
|---|---|
| `OPEN_QUESTIONS.md` | ปัญหาค้าง + จุดที่ CLAUDE.md ผิด + AC design decisions + สถานะ AC prototype |
| `CHARGER_REQUIREMENTS.md` / `_EN.md` | สเปกให้ผู้ผลิตตู้ (ตู้ต้องรองรับอะไรถึงเชื่อม TACT ได้) |
| `CLAUDE.md` | context เดิม — **บางส่วนอัปเดตแล้ว (§7.4, §8) บางส่วนยังผิด** ใช้คู่กับ OPEN_QUESTIONS |
| `OCPP_TACT/dse_probe.py` | diagnostic อ่าน DSE4620 (read-only) ใช้ตอน troubleshoot Modbus |

---

## 7. สรุป flow ปัจจุบัน (ทำงานยังไงตอนนี้)

**DC (ทำงาน):** เสียบสาย CCS2 → PLC ขึ้น Preparing → แอปกด Start → `RemoteStart(1)` → CP.py: `Start_Gen=1` → รอ 15 วิ → `remote_start` → ชาร์จ → MeterValues → กด Stop → `RemoteStop` → `remote_stop` + `Start_Gen=0` (ถ้าอีก session ว่าง) → PLC ยก Head1Finishing → StopTransaction → หน้า Finishing

**AC (เป้าหมาย — ยังไม่ครบ):** แอปกด "เปิดจ่ายไฟ AC" → Backend → CSMS `DataTransfer(StartGen)` → CP.py → `Start_Gen=1` → ไฟเข้าเต้า AC · กด "หยุด" → `DataTransfer(StopGen)` → `Start_Gen=0` (ถ้า DC ไม่ชาร์จ)

**Generator display (ทำงาน):** gen_telemetry.py อ่าน DSE ทุก 5 วิ → POST backend → socket → แอปแสดง fuel% + สถานะ

---

## 8. Production Deployment — เสร็จแล้ว deploy ยังไง

มี **3 ส่วนต้อง deploy** (CSMS + MongoDB รันเป็น service อยู่แล้วบน server 212.80.215.42)

> ⚠️ ตอนนี้ backend รันด้วย `npm run dev` (ts-node-dev) = dev mode ชั่วคราว — production ต้องเปลี่ยนเป็น build + pm2

### 8.1 Backend → server (Windows, 212.80.215.42)

```bash
cd C:\Users\Administrator\Documents\TACTapp\tact-backend
git pull origin main
npm ci                      # ติดตั้ง dependency ตาม lockfile
npm run build               # tsc → dist/

# รันด้วย pm2 (auto-restart + boot)
npm i -g pm2
pm2 start dist/index.js --name tact-backend
pm2 save
# Windows boot: npm i -g pm2-windows-startup && pm2-startup install
```

**`.env` บน server ต้องครบ** (ดู §4):
```
PORT=5000
NODE_ENV=production
MONGODB_URI=mongodb://admin:<pass>@212.80.215.42:27017/tact_db?authSource=admin
JWT_SECRET=<สุ่มยาว ๆ ห้ามใช้ default>
CSMS_USER=admin
CSMS_PASS=<...>
DEVICE_API_KEY=<สุ่ม — ต้องตรงกับ TACT_DEVICE_KEY ที่ Pi>
CSMS_HTTP_URL=http://127.0.0.1:8080
CSMS_WS_URL=ws://127.0.0.1:8080/ws
```
**Firewall**: เปิด inbound TCP **5000** · เช็ค: `curl http://212.80.215.42:5000/api/health` จากข้างนอกได้ JSON
เช็ค log: `pm2 logs tact-backend` → ต้องเห็น `✅ [CSMS] login สำเร็จ` + `WebSocket connected`

### 8.2 App → Android APK / Play Store

```bash
cd TACTAPP
# 1) ชี้ backend production
#    src/config/api.ts → LOCAL_IP = '212.80.215.42' (หรือใช้ domain+HTTPS ถ้ามี)
#    app.json → ใส่ Google Maps API key จริง + usesCleartextTraffic (ถ้ายัง HTTP)

npm ci
npm i -g eas-cli && eas login

eas build -p android --profile preview      # → APK (แจกตรง/ติดตั้งเอง)
eas build -p android --profile production    # → AAB (ขึ้น Play Store)
```
- APK: โหลดจาก link ที่ eas ให้ → ติดตั้งบนมือถือ
- Play Store: อัป AAB ใน Play Console
- ⚠️ ถ้ายังใช้ HTTP (ไม่ใช่ HTTPS) ต้องมี `usesCleartextTraffic: true` ใน app.json (Android 9+ block HTTP)

### 8.3 EdgeBox → Raspberry Pi (copy มือ ไม่ผ่าน git)

```bash
# copy 4 ไฟล์ขึ้น Pi (จาก OCPP_TACT/ ในเครื่อง dev)
#   CP.py            → /home/pi/ocpp/CP.py
#   helpf/plc_function.py → /home/pi/ocpp/helpf/plc_function.py
#   gen_telemetry.py → /home/pi/gen_telemetry.py
#   dse_probe.py     → /home/pi/dse_probe.py (diagnostic)

# บน Pi:
cd /home/pi/ocpp && python3 -m py_compile CP.py helpf/plc_function.py && echo OK
python3 -m py_compile /home/pi/gen_telemetry.py && echo OK

# services (ตั้งไว้แล้ว — enable ให้ boot ขึ้นเอง)
sudo systemctl enable ocpp.service tact-gen.service
sudo systemctl restart ocpp.service tact-gen.service
sudo systemctl status ocpp.service tact-gen.service
```
- `gen_telemetry.py` env (ถ้าตั้ง DEVICE_API_KEY): แก้ใน `tact-gen.service` เพิ่ม `Environment=TACT_DEVICE_KEY=<...>` แล้ว `daemon-reload`
- เช็ค: `journalctl -u ocpp.service -f` (ตู้ online) + `journalctl -u tact-gen.service -f` (gen ส่งค่า)

### 8.4 CSMS + MongoDB (รันอยู่แล้ว)

- **CSMS** (`csms_web_ui_flexxfast.py`): รันเป็น service บน server — ต้องตั้ง env `CSMS_USER`/`CSMS_PASS` (ค่าเดียวกับที่ backend ใช้ login) · เปิด :8080 (web), :9000 (OCPP ให้ตู้ต่อ)
- **MongoDB** (:27017): ตั้ง auth + **backup สม่ำเสมอ** (data ลูกค้า/transaction)

### 8.5 ✅ ต้องทำก่อน production จริง (checklist)

- [ ] backend: build + pm2 (ไม่ใช่ `npm run dev`) + `.env` ครบ (JWT_SECRET, DEVICE_API_KEY จริง)
- [ ] แก้ security 5 ข้อใน §4.6-D (forgot-password, JWT, telemetry, socket auth, admin routes)
- [ ] (แนะนำ) HTTPS + domain + reverse proxy (nginx) แทน HTTP+IP เปล่า
- [ ] MongoDB backup + firewall (ตอนนี้ :27017 เปิด public — ควรจำกัด)
- [ ] ลบ station demo ออกจาก DB (seed มี 3 station ปลอม) เหลือสถานีจริง + ตั้ง `cpId` ให้ตรง
- [ ] Google Maps API key restrict เฉพาะ package `com.tact.charger`
- [ ] deploy CP.py ตัวล่าสุด (ตัด connector 2 + DataTransfer) + ทำ AC ให้ครบ (§4.6-A)

### 8.6 ลำดับ deploy เวลา update (หลังจากนี้)

| แก้ส่วนไหน | ทำอะไร |
|---|---|
| Backend | `git push` → บน server `git pull && npm run build && pm2 restart tact-backend` |
| App | แก้โค้ด → `eas build` → แจก APK ใหม่ / อัป Play Store |
| EdgeBox (CP.py/gen) | copy ไฟล์ขึ้น Pi → `py_compile` เช็ค → `systemctl restart <service>` |
