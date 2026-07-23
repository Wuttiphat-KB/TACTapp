# ข้อกำหนดตู้ชาร์จ — สำหรับเชื่อมต่อกับ TACT App

> เอกสารสำหรับผู้ผลิตตู้ชาร์จ: ตู้ต้องรองรับสิ่งต่อไปนี้จึงจะใช้กับระบบ TACT (App + CSMS) ได้
> Last updated: 2026-07-23

---

## 1. Protocol

- **OCPP 1.6J** (JSON over WebSocket) — WebSocket subprotocol = `ocpp1.6`
- **ตู้เป็นฝ่ายเชื่อมต่อออก** ไปหา CSMS ที่:
  `ws://<CSMS-host>:9000/ocpp/{ChargePointID}`
- รองรับ auto-reconnect เมื่อสายหลุด

## 2. Charge Point ID

- ต้อง **ตกลง `ChargePointID` กับทีม TACT ล่วงหน้า** และลงทะเบียนใน CSMS ให้สถานะ = **Accepted**
- ถ้า ID ไม่ตรง / ยังไม่ถูก Accept → App จะมองไม่เห็นตู้ (แสดง Offline)

## 3. Message ที่ตู้ต้อง "ส่ง" ได้ (Charge Point → CSMS)

| Message | ใช้ทำอะไร |
|---|---|
| `BootNotification` | แจ้งตัวตน (vendor / model / firmware) ตอนเปิดเครื่อง |
| `Heartbeat` | บอกว่ายัง online (เป็นระยะ) |
| `StatusNotification` | สถานะ connector (ดูข้อ 6) |
| `StartTransaction` | เริ่มชาร์จ (connectorId, idTag, meterStart, timestamp) |
| `StopTransaction` | หยุดชาร์จ (transactionId, meterStop, timestamp, reason) |
| `MeterValues` | ค่ามิเตอร์ระหว่างชาร์จ (ดูข้อ 5) |
| `Authorize` | ตรวจสิทธิ์ idTag |

## 4. Message ที่ตู้ต้อง "รับและทำตาม" ได้ (CSMS → Charge Point)

| Message | ใช้ทำอะไร |
|---|---|
| `RemoteStartTransaction` | **App สั่งเริ่มชาร์จ** (ส่ง idTag + connectorId มา) |
| `RemoteStopTransaction` | **App สั่งหยุดชาร์จ** (ส่ง transactionId มา) |
| `TriggerMessage` | ขอให้ตู้ส่ง StatusNotification กลับ |

## 5. MeterValues — measurand ที่ App ต้องใช้แสดงผล

ส่งเป็นระยะระหว่าง transaction (**แนะนำทุก 5–10 วินาที**) โดยมี measurand อย่างน้อย:

| measurand | หน่วย | ใช้แสดง |
|---|---|---|
| `Energy.Active.Import.Register` | kWh | พลังงานสะสม / คิดเงิน |
| `Power.Active.Import` | kW | กำลังที่จ่ายอยู่ |
| `Voltage` | V | แรงดัน |
| `Current.Import` | A | กระแส |
| `SoC` | Percent | % แบตเตอรี่รถ (**เฉพาะ DC**) |

## 6. Connector & Status

- รายงานสถานะแยกตาม `connectorId` (1, 2, …) — `connectorId = 0` = ทั้งตู้
- ค่า `status` ที่ App ใช้: **Available / Preparing / Charging / Finishing / Faulted**
- หัว **DC (CCS2)**: ต้องตรวจการเสียบสาย (CP line) → รายงาน `Preparing` เมื่อเสียบ

## 7. idTag / RFID

- รับ `RemoteStartTransaction` ที่มี `idTag` ยาว **ไม่เกิน 20 ตัวอักษร**
- ตู้ไม่ต้องมีฐานข้อมูลบัตรเอง (CSMS จัดการสิทธิ์ให้)

## 8. Network

- ตู้ (หรือ OCPP client/Edge device ของตู้) ต้องต่อ internet ถึง CSMS host ได้
- **ไม่ต้อง** เปิด port ขาเข้า — ตู้เป็นฝ่ายต่อออกอย่างเดียว

---

### สรุป 1 บรรทัด
ตู้ต้องพูด **OCPP 1.6J over WebSocket**, ต่อออกไป CSMS ที่ port 9000, ตกลง ChargePointID ให้ Accept, ส่ง Boot/Heartbeat/Status/Start/Stop/MeterValues และรับ RemoteStart/RemoteStop/Trigger ได้ พร้อม MeterValues 5 ตัวตามข้อ 5

> หมายเหตุ: การควบคุมเครื่องปั่นไฟ (generator) เป็นส่วนเฉพาะของ TACT ผ่าน Edge device แยกต่างหาก — **ไม่ใช่ข้อกำหนดของตู้ชาร์จมาตรฐาน**
