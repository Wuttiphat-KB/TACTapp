# TACT — คำถามค้าง & ความไม่ตรงกันระหว่างเอกสารกับโค้ด

> สร้างเมื่อ 2026-07-17 จากการ audit โค้ดจริงทั้ง 4 ส่วน (TACTAPP / tact-backend / OCPP_TACT / CLAUDE.md)
> **CLAUDE.md ผิดในหลายจุดที่ทำให้วางแผนงานผิด** — ดูหัวข้อ 3 ก่อนเชื่ออะไรใน CLAUDE.md

---

## 1. ต้องได้คำตอบจากทีม PLC vendor (blocking)

| # | คำถาม | ทำไมถึงสำคัญ |
|---|---|---|
| 1 | **`GV.Start_Gen` — PLC latch rising edge หรือ sample level?** | pulse ปัจจุบันกว้างแค่ ~1 HTTP round-trip (`CP.py:1466-1468` ไม่มี sleep คั่น) ต่างจาก `remote_start` (ค้าง 2s) และ `remote_stop` (ค้าง 3s) โดยสิ้นเชิง **ถ้า PLC sample level → gen อาจไม่เคยติดจาก path นี้เลย** เป็นสมมติฐานอันดับ 1 ถ้าเจออาการ "gen ไม่ติด" |
| 2 | **PLC ดับ generator เองมั้ย?** ถ้าไม่ ใครดับ (คนที่หน้างาน?) | ไม่มี tag `Stop_Gen` ทั้ง tree ⇒ วันนี้ EdgeBox สั่งติดเครื่องแล้ว**ไม่เคยสั่งดับ** |
| 3 | **ขอ tag `Stop_Gen`** | ต้องมีถึงจะปิด flow ตาม §9.2 ได้ และจำเป็นกับ AC (idle timeout) |
| 4 | **ขอ tag `generator_status`** (running / voltage / freq / 3-phase ready) | ถ้าไม่มี → timeout handling ทำไม่ได้เลยในหลักการ วันนี้ EdgeBox `sleep(15)` แบบ open-loop ไม่อ่านอะไรกลับ |
| 5 | **`Head1Done` / `Head1Finishing` / `Head2Done` / `Head2Finishing` หมายถึงอะไรกันแน่?** | เป็น tag **ชุดเดียวที่แยก connector ได้จริง** (`plc_function.py:196-216, 247-266`) — ถ้าหัวที่ 2 หมายถึงหัว AC จริง อาจใช้เป็นจุดยึด AC ได้ |
| 6 | **ตู้มีหัวชาร์จกี่หัวจริง ๆ ตอนนี้?** | โค้ดบอกได้แค่ว่า software แยกไม่ออก (IP/tag/meter เดียวกันหมด) ต้องยืนยันด้วยตา |
| 7 | ✅ **ตอบแล้ว (2026-07-21): gen ติด = ไฟเข้าเต้า AC ทันที** (ไม่ต้อง `remote_start`) | ⇒ AC start = แค่สั่ง `Start_Gen`. **แต่ sharpen 2 เรื่อง:** (ก) ปิด AC = ต้องดับ gen → **ต้องมี `Stop_Gen`** (ข้อ 3) (ข) ⚠️ **safety: เต้า AC มีไฟทันทีที่ gen ติด แม้ไม่เสียบอะไร + ไม่มี CP line เช็ค** ⇒ power ไม่ถูก gate ด้วย session เลย ใครเสียบตอน gen ติดก็ได้ไฟ — ต้องคุยทีมไฟฟ้าเรื่อง interlock/authorization |
| 8 | **มี energy meter ตัวที่สองบน RS485 bus จริงมั้ย?** | `len_meter_test.py:14-19` มี branch `slaveaddr = 1 if ttyACM0 else 2` = คน**เคยตั้งใจ**ให้มี 2 ตัว แต่ port ถูก hardcode ทับ ⇒ ตอบไม่ได้จากโค้ด ต้องดู hardware |

## 2. Design decision ที่ต้องมีคนตัดสิน (ยังไม่มีใครตัดสิน)

| # | คำถาม | บริบท |
|---|---|---|
| 9 | **ช่องทางสั่ง gen จาก CSMS → EdgeBox** | OCPP 1.6J ไม่มี verb generator เลือกได้: `DataTransfer` (อยู่ในสเปก แต่ต้องแก้ CSMS ซึ่ง **source ไม่อยู่ใน workspace**) หรือ EdgeBox เปิด HTTP API เอง (เลี่ยง OCPP แต่เพิ่มช่องทางที่ต้องดูแล) **ต้องเลือกก่อนถึงจะออกแบบ backend route ได้** |
| 10 | **AC session จะจบยังไง?** | ไม่มี CP line ⇒ ไม่มี `Head1Finishing` ⇒ StopTransaction จะ trigger จากอะไร? วันนี้ยิงจาก `Head1Finishing == '1'` (`CP.py:1729-1766`) |
| 11 | **รู้ได้ไงว่ารถถอดปลั๊ก AC แล้ว?** | ทั้งการ finalize session และ safety ขึ้นกับข้อนี้ |
| 12 | **AC idle timeout?** ถ้า user กด start-gen แล้วไม่เสียบสาย gen จะเผาน้ำมันไปเรื่อย ๆ นานเท่าไหร่ถึงดับ? | ต่อกับข้อ 2/3 — ไม่มี `Stop_Gen` ⇒ ตอบไม่ได้ |
| 13 | **AC วัดพลังงานจาก meter ไหน? คิดเงินยังไงถ้าไม่มี meter แยก?** | `/dev/ttyACM0` slave 1 คือ meter ของ DC ถ้าอ่านค่ารวม → บิลผิด |
| 14 | **connector 2 จะเอายังไง?** ปิดทิ้ง (register หัวเดียว) หรือทำให้ AC เป็น connector 2 จริง ๆ? | ต้องใช้ tag ที่มี suffix จาก PLC + meter ตัวที่สอง **ตัดสินใจก่อนทำ AC เพราะ AC จะไปยึด connector 2 พอดี** — วันนี้แอป route ทั้ง CCS2 และ AC ไป connector 2 อยู่แล้วโดยบังเอิญ (`App.tsx:391-413`) |
| 15 | **EdgeBox ยัง offline อยู่มั้ย?** | `MDBlog.txt` เงียบตั้งแต่ **2026-05-22** (~2 เดือน) ต้องรู้ก่อนวางแผน test |
| 16 | **จะเอา `OCPP_TACT/` เข้า git มั้ย?** | ถ้าเอา ต้องถอน Telegram token (`CP.py:51-52`) + iMPS MongoDB creds (`plc_function.py.bak:12`) ออกก่อน commit แรก ไม่งั้นติด history ถาวร **ตอนนี้ยังไม่ committed แต่ก็ไม่ได้ gitignore** ⇒ `git add .` ครั้งเดียวหลุด |

---

## 2.5 AC prototype — สถานะ (2026-07-21)

ทำแล้ว (option B — prototype ปุ่ม AC, start ผ่าน `Start_Gen` ที่มีอยู่):

| Layer | ทำอะไร | ไฟล์ |
|---|---|---|
| EdgeBox | เพิ่ม `write_stop_gen()` (ส่ง `GV.Stop_Gen`) | `helpf/plc_function.py` |
| EdgeBox | เรียก `write_stop_gen` ใน remote-stop path ทั้ง 2 connector | `CP.py` (my_remote_stop) |
| Backend | AC start → session `state='Charging'` เลย (ไม่รอ StartTransaction) + RemoteStart best-effort | `charging.ts` /start |
| Backend | AC stop → finalize ตรง ๆ (ไม่ต้องมี transactionId) | `charging.ts` /:id/stop |
| App | AC charger กดได้ตั้งแต่ `Available` (ไม่ต้องรอ Preparing) | `ChargerScreen.tsx` |
| App | AC start → เข้าหน้า Charging เลย / AC stop → ไป Finishing เลย (ไม่ค้าง "รอถอดสาย") | `App.tsx` |

**ผลข้างเคียงที่ตั้งใจ:** ตอนนี้ DC stop ก็ส่ง `Stop_Gen` ด้วย (ตรงกับ §9.2 "หยุดชาร์จแล้วดับ gen") — **harmless จนกว่า PLC เพิ่ม tag** (เขียนไป tag ที่ไม่มี = ไม่มีผล)

**ยังทำงานจริงไม่ได้จนกว่า:**
1. 🔴 ทีม PLC เพิ่ม tag `Stop_Gen` (ฝั่งเราส่งแล้ว)
2. backend รันบน server (local โดน CSMS 401 → RemoteStart/getChargePoints ไปไม่ถึงตู้ → ตู้ขึ้น Offline → ปุ่มกดไม่ได้)
3. gen ต่อกับตู้จริง
4. (ถ้าจะให้ AC stop ส่ง Stop_Gen ถึง CP.py จริง) ต้องมี connector/transaction path ของ AC — ผูกกับ decision #14

**ยัง defer ตามที่ตกลง:** AC meter (บิล), relay/interlock (safety), logic "ดับ gen เมื่อไม่มี session เหลือ"

---

## 3. CLAUDE.md ผิดตรงไหนบ้าง (อย่าเชื่อจนกว่าจะแก้)

### 🔴 CRITICAL

| หัวข้อ | CLAUDE.md บอก | โค้ดจริง | evidence |
|---|---|---|---|
| **Gen GV tag** | §7.4 "ยังไม่มี GV tag (TODO) ต้องรอทีม PLC เพิ่ม `start_generator`" | **`GV.Start_Gen` มีจริง live ตั้งแต่ 2026-04-01** ชื่อที่ doc แต่งขึ้นไม่มีที่ไหนเลย (grep = 0 hit) | `plc_function.py:382-386`; `CP.py:1466-1469, 1502-1505`; `MDBlog.txt @2026-04-01T10:34:52` |
| **ลำดับสตาร์ท** | §9.1 step 6-7: pulse `remote_start` ก่อน → PLC สตาร์ท gen เอง | **กลับกัน** — EdgeBox: `Start_Gen` → `sleep(15)` → `remote_start` | `CP.py:1464-1475` |
| **PLC IP** | §2: Connector 1 = .8, Connector 2 = **.9** | **PLC ตัวเดียว `.8`** — `.9` ไม่มีใน CP.py เลย มีแต่ใน comment | `CP.py:84, 163, 222` |
| **2 connectors** | §2 "TACT30KW (2 connectors)" | **connector 2 = ผี** IP/tag/meter เดียวกันหมด ⇒ `iCpStateCss1 == iCpStateCss2` ตลอด แต่โค้ดยัง register 2 ตัวให้ CSMS | `plc_function.py:55-56`; `CP.py:163, 222, 166, 225, 2139-2140` |
| **AC support** | §4.4/§5.5 `type: 'CCS2'\|'AC'` | **ศูนย์ทุก layer** — grep `\bAC\b\|type2\|connector_type` บน CP.py = 0 hit; `charging.ts:85` default เป็น `'CCS2'` ⇒ session AC ถูกบันทึกเป็น CCS2 | `charging.ts:80-85` |
| **Gen stop** | §9.2 "หยุดชาร์จ → แล้วดับ gen" | **ไม่มี stop gen ที่ไหนเลย** `write_start_gen(0)` เป็น falling edge ของ pulse ไม่ใช่คำสั่งดับ | `CP.py:1697-1704` |
| **CSMS_WS_URL** | §5.2/§2: `ws://…:9000` | `.env` จริง = `ws://…:8080/ws` = **debug log stream** ไม่ใช่ OCPP endpoint. ใครตั้งตาม §5.2 = real-time path พังทั้งระบบ | `csmsListener.ts:8, 48`; `CP.py:2130` |
| **role enum** | §4.4/§5.5 `role: 'User'\|'Admin'` | Mongoose enum เป็น **lowercase** `['admin','user']` แต่ `authorize('Admin')` เช็ค case-sensitive ⇒ **admin route ทั้ง 6 ตัว 403 ถาวร** | `User.ts:61-65`; `auth.ts:94`; `stations.ts:249,270,290,321,356,391` |
| **Start/Stop wiring** | §13 "ค้าง: Charger Start/Stop เชื่อม API จริง" | **เสร็จแล้ว** real API ทั้งคู่ ไม่มี mock ในเส้นทาง | `App.tsx:427-431, 494`; `api.ts:196-207` |
| **forgot-password** | §13 "ยังไม่เสร็จ" | **ทำครึ่งทางและอันตราย** — reset รหัสจริงแล้ว**ส่ง temp password กลับใน HTTP response** โดยรู้แค่ email = account takeover. comment "DEV ONLY" ไม่ได้ gate ด้วย `NODE_ENV` และ `.env` ชี้ **production MongoDB** | `auth.ts:319-340` |
| **DSE4620 telemetry** | §0 "งานที่กำลังทำอยู่"; §13 "✅ ยืนยัน Modbus params" | **ไม่มีโค้ด DSE ใน repo เลย** — ไม่มี 19200 / slave 11 / ttyUSB0 Instrument. Modbus ที่มีคือ energy meter @9600 บน ttyACM0 เท่านั้น ⇒ §8.9 step 5 ยังไม่เริ่ม | `len_meter_test.py:19-25` |
| **MQTT** | **ไม่มีในเอกสารเลย** | CP.py connect broker `212.80.215.42:1883` **ที่ import time** publish `OCPP/TACT30KW/heartbeat` + `OCPP/TACT30KW/meter` ⇒ broker ล่ม = CP.py start ไม่ขึ้น | `CP.py:16-29, 1038, 1180, 1238` |
| **Socket.IO auth** | §5.4 ไม่พูดถึง | handshake เชื่อ `auth.userId` ดิบ ๆ ไม่ verify JWT ⇒ join ห้อง `user:<id>` ใครก็ได้ | `index.ts:85-89` |
| **`/admin/clear-all`** | comment เขียน "Admin" | **ไม่มี `authorize()`** — user คนไหนก็ล้าง Active session ของทุกคนได้ | `charging.ts:438-441` |
| **seed data** | §13 "✅ Seed data" | charger **ไม่มี `connectorId`** และ id เป็น `'ladprao-ccs2-01'` ไม่ match `connector-N` ⇒ พัง 3 ทาง: price/type default เงียบ ๆ, csmsListener updateOne ไม่ match, stations คืน `'Available'` ให้ทุกหัว | `seed.ts:62-127` |

### 🟠 IMPORTANT

| หัวข้อ | doc | จริง | evidence |
|---|---|---|---|
| Heartbeat | §6.1 "30s" | **120s** (`HeartbeatInterval_cfg.txt`) | `CP.py:1039` |
| MeterValues interval | §6.1 "4s" | 4s จริงแต่ **hardcode** `time.sleep(4)`; `MeterValueSampleInterval_cfg.txt=6` ถูกโฆษณาให้ CSMS แต่ไม่ขับอะไร ⇒ ChangeConfiguration key นี้ = no-op | `CP.py:2027, 2033, 2039` |
| BootNotification identity | ตู้ TACT 30kW | ยังเป็นเครื่อง EGAT: model **`FD150A`**, vendor `Flexxfast by EDS`, `vendor_id='EgatDimomdService'`, Power.Offered = **150 kW** จาก `limit.txt=150000` | `CP.py:936-942, 1296-1308` |
| `Head1Done`/`Head2Done` | §7.1 ไม่มีในตาราง | เป็น **suppression gate ของทุก StatusNotification** — `if finish_one_c1(...) == '1': pass` = ไม่ส่ง **น่าจะเป็นต้นเหตุอาการ "แอปโชว์สถานะค้าง"** | `CP.py:1550-1551, 1573-1574` |
| PLC HTTP helper | §7.3 มี `read_plc_value`/`write_plc_value` พร้อม `timeout=5` | **ทั้งสองฟังก์ชันไม่มีอยู่จริง §7.3 เป็น doc ที่แต่งขึ้น** ของจริง = ~30 ฟังก์ชัน copy-paste ต่อ tag, **32 requests calls / timeout=0 / try=0 / except=0** ⇒ PLC ค้าง = แช่แข็ง event loop ทั้ง client รวม heartbeat | `plc_function.py` ทั้งไฟล์ |
| in-memory maps | §12 พูดถึงแต่ session restore ฝั่งแอป | `idTagToUser`/`txnToSession` เป็น Map ใน RAM ⇒ **restart backend = session ที่วิ่งอยู่กำพร้าทั้งหมด** ค้าง `Active` ตลอดกาล → ชน guard "already have active session" = user ล็อกตัวเองออกถาวร | `csmsListener.ts:11, 14, 17` |
| csmsListener | §13 "✅ CSMS + EdgeBox ใช้งานได้" | reconnect 10 ครั้งแล้วเลิกถาวร ไม่ alert ไม่ exit ⇒ backend เป็นซอมบี้: health ยัง 200 แต่ไม่มี session ไหนพ้น Preparing | `csmsListener.ts:42-43, 373-381` |
| `socketService.ts` | §5.1 ระบุไฟล์นี้ | **ไม่มีไฟล์นี้** Socket.IO อยู่ inline ใน `index.ts:81-113` | `src/services/` |
| IDOR ×2 | comment "@access Private" | `GET /api/charging/:id` และ `POST /:id/fault` **ไม่เช็ค ownership** | `charging.ts:338-362, 367-402` |
| `trigger-status` | ไม่มีใน §5.3 | ไม่มี `authenticate` ⇒ ใครก็ยิง TriggerMessage ใส่ตู้จริงได้ | `stations.ts:419-446` |
| Energy 32-bit combine | ไม่มีใน doc | **สูตรผิด** scale hi ด้วย 0.01 ก่อน shift ⇒ hi 1 count = 655.36 kWh ที่ถูกคือ `((hi<<16)+lo)*0.01` ไม่พังตราบใดที่ hi ยัง 0 **แต่จะทำบิลเพี้ยนเงียบ ๆ เมื่อ meter ล้น low word** | `len_meter_test.py:29-31` |
| import-time side effects | §6.4 บอกมี try/except กัน | 3 อย่างรัน**ก่อน** try/except: MQTT connect (`CP.py:27`), `read_tag_status()` ×2 = 4 blocking HTTP POST (`CP.py:86-87`), live Modbus read ตอน import (`len_meter_test.py:67-68`) ⇒ meter/broker ไม่อยู่ = CP.py ตายตั้งแต่ import ไม่ retry | |
| flag file corruption | §12 ไม่มี | `MDBlog.txt` มี `invalid literal for int() with base 10: ''` **336 ครั้ง** (2026-02-19→02-25) = flag file 0 byte จากไฟดับกลางเขียน (ไม่มี fsync/tmp+rename) → crash loop ต้องไปแก้ที่หน้างาน | `CP.py:203-217` |

---

## 4. CP.py / CP1.py / CP_nomal.py — ตัวไหน live

**`CP.py` = LIVE** (LF line endings ตัวเดียว = ไฟล์เดียวที่ถูกแก้บน EdgeBox; URL ชี้ TACT30KW; เป็นไฟล์เดียวที่เรียก `write_start_gen`)

⚠️ **mtime ใช้ตัดสินไม่ได้** — ทุกไฟล์เป็น `2026-07-16 13:32` จาก bulk copy ใช้ pyc header + line endings แทน

| ไฟล์ | ต่างจาก CP.py | สถานะ |
|---|---|---|
| `CP1.py` | 16 บรรทัด / 3 hunks — ตัด `Start_Gen` block ทั้ง C1/C2 + URL → `wss://ev-ocpp.egat.co.th/ocpp/EDS_150_3` | 🪤 **กับดัก** รันได้ปกติ แต่ต่อ CSMS ของ EGAT และไม่มี generator control |
| `CP_nomal.py` | 47 บรรทัด — ตัด gen block + เพิ่ม MongoDB block 35 บรรทัด | 💀 **รันไม่ได้** เรียก `start_ocpp_watcher()` / `read_ocpp_config()` ที่อยู่ใน `plc_function.py.bak` เท่านั้น (`.bak` import ไม่ได้) → NameError ก่อนต่อ WS ชื่อ "nomal" หลอกคนอ่านหนักมาก |
| `helpf/plc_function1.py` | — | 💀 **ของตาย** ไม่มีใคร import และ map `iCpStateCcs=='6'→Preparing` ขณะที่ตัว live ใช้ `'2'` ⇒ ใครฟื้นไฟล์นี้ = Preparing พัง |

**การเลือก variant ไม่ช่วยเรื่อง connector 2** — 3 hunk ที่ต่างกันไม่แตะ connector count / IP / meter / BootNotification เลย

---

## 5. หลักฐานอ่อน / ตอบไม่ได้จาก workspace นี้

- **CSMS source ไม่มีในเครื่อง** — envelope `{type:'log', data:{action, cp_id, data, direction}}` ที่ real-time path ทั้งระบบพึ่งอยู่ **verify ไม่ได้ / pin version ไม่ได้** ถ้า CSMS เปลี่ยน format logging → charging state พังเงียบ ๆ (catch กลืนที่ `csmsListener.ts:365-367`)
- **`myid_tag_c2.txt = 'U5B8F1D3A2C209CD6A78'`** = หลักฐานว่า session จริงจากแอปเคยวิ่งบน connector 2 — เป็น inference จาก format (ตรงกับ `generateIdTag` เป๊ะ) ไม่ใช่ log ตรง ๆ
- **มี meter ตัวที่สองบนบัสจริงมั้ย** — ตอบไม่ได้จากโค้ด ต้องดู hardware
