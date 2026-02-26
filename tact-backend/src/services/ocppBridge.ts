// C:\Users\Asus\Documents\TACT\tact-backend\src\services\ocppBridge.ts
import axios from 'axios';

const CSMS_URL = process.env.CSMS_HTTP_URL || 'http://212.80.215.42:8080';
const CP_ID = process.env.CSMS_CP_ID || 'TACT30KW';

interface CommandResponse {
  success: boolean;
  result?: {
    status: 'Accepted' | 'Rejected' | 'Pending';
  };
  error?: string;
}

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
 * เพิ่ม RFID card ใน CSMS (ต้องทำก่อน RemoteStart)
 */
export async function addRfidCard(
  idTag: string,
  description?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[OCPP] Adding RFID card: ${idTag}`);
    
    const response = await axios.post(`${CSMS_URL}/api/rfid/add`, {
      id_tag: idTag.toUpperCase(),
      status: 'Accepted',
      description: description || `App user: ${idTag}`,
    });

    console.log(`[OCPP] RFID add response:`, response.data);
    return { success: true };
  } catch (error: any) {
    console.error('[OCPP] Add RFID error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * ลบ RFID card ออกจาก CSMS
 */
export async function removeRfidCard(
  idTag: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await axios.post(`${CSMS_URL}/api/rfid/delete`, {
      id_tag: idTag.toUpperCase(),
    });

    return { success: true };
  } catch (error: any) {
    console.error('[OCPP] Remove RFID error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * สั่ง Remote Start Transaction
 */
export async function remoteStart(
  connectorId: number,
  idTag: string
): Promise<CommandResponse> {
  try {
    console.log(`[OCPP] RemoteStart: connector=${connectorId}, idTag=${idTag}`);
    
    const response = await axios.post(`${CSMS_URL}/api/command`, {
      cp_id: CP_ID,
      command: 'remote_start',
      params: {
        id_tag: idTag.toUpperCase(),
        connector_id: connectorId,
      },
    });

    console.log(`[OCPP] RemoteStart response:`, response.data);
    
    return {
      success: response.data?.success ?? true,
      result: response.data?.result || { status: 'Accepted' },
    };
  } catch (error: any) {
    console.error('[OCPP] RemoteStart error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * สั่ง Remote Stop Transaction
 */
export async function remoteStop(transactionId: number): Promise<CommandResponse> {
  try {
    console.log(`[OCPP] RemoteStop: transactionId=${transactionId}`);
    
    const response = await axios.post(`${CSMS_URL}/api/command`, {
      cp_id: CP_ID,
      command: 'remote_stop',
      params: {
        transaction_id: transactionId,
      },
    });

    console.log(`[OCPP] RemoteStop response:`, response.data);
    
    return {
      success: response.data?.success ?? true,
      result: response.data?.result || { status: 'Accepted' },
    };
  } catch (error: any) {
    console.error('[OCPP] RemoteStop error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * ดูสถานะ Charge Points ทั้งหมด
 */
export async function getChargePoints(): Promise<ChargePointStatus[]> {
  try {
    const response = await axios.get(`${CSMS_URL}/api/charge_points`);
    return response.data || [];
  } catch (error: any) {
    console.error('[OCPP] GetChargePoints error:', error.message);
    return [];
  }
}

/**
 * ดูสถานะ Connector เฉพาะ
 */
export async function getConnectorStatus(
  connectorId: number
): Promise<string | null> {
  try {
    const chargePoints = await getChargePoints();
    const cp = chargePoints.find(c => c.id === CP_ID);
    
    if (cp && cp.status) {
      return cp.status[connectorId.toString()] || null;
    }
    
    return null;
  } catch (error: any) {
    console.error('[OCPP] GetConnectorStatus error:', error.message);
    return null;
  }
}

/**
 * Reset Charger
 */
export async function resetCharger(type: 'Soft' | 'Hard' = 'Soft'): Promise<CommandResponse> {
  try {
    const response = await axios.post(`${CSMS_URL}/api/command`, {
      cp_id: CP_ID,
      command: 'reset',
      params: { type },
    });

    return {
      success: response.data?.success ?? true,
      result: response.data?.result,
    };
  } catch (error: any) {
    console.error('[OCPP] Reset error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Unlock Connector
 */
export async function unlockConnector(connectorId: number): Promise<CommandResponse> {
  try {
    const response = await axios.post(`${CSMS_URL}/api/command`, {
      cp_id: CP_ID,
      command: 'unlock',
      params: { connector_id: connectorId },
    });

    return {
      success: response.data?.success ?? true,
      result: response.data?.result,
    };
  } catch (error: any) {
    console.error('[OCPP] Unlock error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * สร้าง idTag จาก userId
 * - OCPP 1.6 max 20 chars
 * - ต้อง UPPERCASE
 */
export function generateIdTag(userId: string): string {
  const tag = `U${userId.toString().slice(-19)}`.toUpperCase();
  return tag;
}

/**
 * Trigger Message - ขอให้ Charger ส่ง message กลับมา
 * @param message - ประเภท message เช่น 'StatusNotification', 'MeterValues', 'Heartbeat', 'BootNotification'
 * @param connectorId - connector ID (0 = ทั้งหมด, 1 หรือ 2 = เฉพาะ connector)
 */
export async function triggerMessage(
  message: 'StatusNotification' | 'MeterValues' | 'Heartbeat' | 'BootNotification',
  connectorId: number = 0
): Promise<CommandResponse> {
  try {
    console.log(`[OCPP] TriggerMessage: ${message}, connector=${connectorId}`);
    
    const params: any = { message };
    if (connectorId > 0) {
      params.connector_id = connectorId;
    }
    
    const response = await axios.post(`${CSMS_URL}/api/command`, {
      cp_id: CP_ID,
      command: 'trigger',
      params,
    });

    console.log(`[OCPP] TriggerMessage response:`, response.data);
    
    return {
      success: response.data?.success ?? true,
      result: response.data?.result || { status: 'Accepted' },
    };
  } catch (error: any) {
    console.error('[OCPP] TriggerMessage error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * ขอ StatusNotification จาก Charger
 * @param connectorId - 0 = ทุก connector, 1 หรือ 2 = เฉพาะ connector
 */
export async function triggerStatusNotification(connectorId: number = 0): Promise<CommandResponse> {
  return triggerMessage('StatusNotification', connectorId);
}

/**
 * ขอ StatusNotification จากทุก connector
 */
export async function triggerAllConnectorStatus(): Promise<void> {
  console.log('[OCPP] Triggering StatusNotification for all connectors...');
  
  // Trigger connector 1 และ 2
  await triggerStatusNotification(1);
  await triggerStatusNotification(2);
  
  console.log('[OCPP] StatusNotification triggered for all connectors');
}