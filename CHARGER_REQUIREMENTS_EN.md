# Charge Point Requirements — for Integration with the TACT App

> For charge point manufacturers: a charger must support the following to work with the TACT system (App + CSMS).
> Last updated: 2026-07-23

---

## 1. Protocol

- **OCPP 1.6J** (JSON over WebSocket) — WebSocket subprotocol = `ocpp1.6`
- **The charger initiates the connection** outbound to the CSMS at:
  `ws://<CSMS-host>:9000/ocpp/{ChargePointID}`
- Must auto-reconnect on connection loss

## 2. Charge Point ID

- The `ChargePointID` must be **agreed with the TACT team in advance** and registered in the CSMS with status = **Accepted**
- If the ID does not match / is not Accepted → the App will not see the charger (shows Offline)

## 3. Messages the charger MUST send (Charge Point → CSMS)

| Message | Purpose |
|---|---|
| `BootNotification` | Announce identity (vendor / model / firmware) at power-up |
| `Heartbeat` | Keep-alive / online indication (periodic) |
| `StatusNotification` | Connector status (see §6) |
| `StartTransaction` | Begin charging (connectorId, idTag, meterStart, timestamp) |
| `StopTransaction` | End charging (transactionId, meterStop, timestamp, reason) |
| `MeterValues` | Live meter readings during a transaction (see §5) |
| `Authorize` | Validate an idTag |

## 4. Messages the charger MUST accept and act on (CSMS → Charge Point)

| Message | Purpose |
|---|---|
| `RemoteStartTransaction` | **App starts charging** (sends idTag + connectorId) |
| `RemoteStopTransaction` | **App stops charging** (sends transactionId) |
| `TriggerMessage` | Request the charger to send a StatusNotification |

## 5. MeterValues — measurands the App requires

Sent periodically during a transaction (**recommended every 5–10 seconds**), including at least:

| measurand | Unit | Displayed as |
|---|---|---|
| `Energy.Active.Import.Register` | kWh | Cumulative energy / billing |
| `Power.Active.Import` | kW | Current power output |
| `Voltage` | V | Voltage |
| `Current.Import` | A | Current |
| `SoC` | Percent | Vehicle battery % (**DC only**) |

## 6. Connectors & Status

- Report status per `connectorId` (1, 2, …) — `connectorId = 0` = the whole charge point
- `status` values the App uses: **Available / Preparing / Charging / Finishing / Faulted**
- **DC (CCS2)** connectors: must detect cable insertion (CP line) → report `Preparing` when plugged in

## 7. idTag / RFID

- Accept `RemoteStartTransaction` carrying an `idTag` of **up to 20 characters**
- The charger does not need its own card database (the CSMS handles authorization)

## 8. Network

- The charger (or its OCPP client / edge device) must reach the CSMS host over the internet/network
- **No inbound ports required** — the charger connects outbound only

---

### One-line summary
The charger must speak **OCPP 1.6J over WebSocket**, connect outbound to the CSMS on port 9000, use an agreed & Accepted ChargePointID, send Boot/Heartbeat/Status/Start/Stop/MeterValues, accept RemoteStart/RemoteStop/Trigger, and provide the 5 measurands in §5.

> Note: Generator control is a TACT-specific function handled by a separate edge device — it is **not** a standard charge-point requirement.
