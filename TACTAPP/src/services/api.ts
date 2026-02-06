/**
 * API Service - เชื่อมต่อ Backend จริง
 * 
 * ใช้ pattern เดิม (apiClient class) เพื่อไม่ต้องแก้ไฟล์อื่น
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, API_TIMEOUT } from '../config/api';

// ===== Types =====
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  count?: number;
  cancelledCount?: number;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface LoginRequest {
  username: string;
  password: string;
}

interface LoginResponse {
  user: {
    id: string;
    username: string;
    email: string;
    phone: string;
    whatsapp: string;
    line: string;
    role: string;
  };
  token: string;
}

interface RegisterRequest {
  username: string;
  email: string;
  phone: string;
  password: string;
  whatsapp?: string;
  line?: string;
}

// ===== Token Storage Key =====
const TOKEN_KEY = 'tact_auth_token';

// ===== API Client =====
class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor() {
    this.baseUrl = API_BASE_URL;
    // โหลด token จาก storage เมื่อสร้าง instance
    this.loadToken();
  }

  // โหลด token จาก AsyncStorage
  private async loadToken() {
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (token) {
        this.token = token;
      }
    } catch (error) {
      console.error('Error loading token:', error);
    }
  }

  // เซ็ต token และเก็บใน AsyncStorage
  async setToken(token: string) {
    this.token = token;
    try {
      await AsyncStorage.setItem(TOKEN_KEY, token);
    } catch (error) {
      console.error('Error saving token:', error);
    }
  }

  // ลบ token
  async clearToken() {
    this.token = null;
    try {
      await AsyncStorage.removeItem(TOKEN_KEY);
    } catch (error) {
      console.error('Error removing token:', error);
    }
  }

  // ===== Base Request =====
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(this.token && { Authorization: `Bearer ${this.token}` }),
      ...options.headers,
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.message || 'Request failed',
          message: data.message,
        };
      }

      return data; // Backend ส่ง { success, data, message } มาแล้ว
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: 'Request timeout',
          message: 'การเชื่อมต่อหมดเวลา กรุณาลองใหม่',
        };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
        message: 'ไม่สามารถเชื่อมต่อ Server ได้',
      };
    }
  }

  // ===== Auth Methods =====

  async login(credentials: LoginRequest): Promise<ApiResponse<LoginResponse>> {
    return this.request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  }

  async register(userData: RegisterRequest): Promise<ApiResponse<LoginResponse>> {
    return this.request<LoginResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async getMe(): Promise<ApiResponse<{ user: LoginResponse['user'] }>> {
    return this.request('/auth/me');
  }

  async updateProfile(data: { phone?: string; whatsapp?: string; line?: string }): Promise<ApiResponse<{ user: LoginResponse['user'] }>> {
    return this.request('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async logout(): Promise<ApiResponse<void>> {
    await this.clearToken();
    return { success: true };
  }

  // ===== Station Methods =====

  async getStations(): Promise<ApiResponse<any[]>> {
    return this.request('/stations');
  }

  async getStationById(id: string): Promise<ApiResponse<any>> {
    return this.request(`/stations/${id}`);
  }

  // ===== Charging Methods =====

  async startCharging(stationId: string, chargerId: string): Promise<ApiResponse<any>> {
    return this.request('/charging/start', {
      method: 'POST',
      body: JSON.stringify({ stationId, chargerId }),
    });
  }

  async stopCharging(sessionId: string, data: {
    energyCharged: number;
    totalPrice: number;
    chargingTime: number;
    carbonReduce: number;
    fuelUsed: number;
  }): Promise<ApiResponse<any>> {
    return this.request(`/charging/${sessionId}/stop`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async updateCharging(sessionId: string, data: {
    soc?: number;
    powerKw?: number;
    chargingTime?: number;
    energyCharged?: number;
    totalPrice?: number;
  }): Promise<ApiResponse<any>> {
    return this.request(`/charging/${sessionId}/update`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async reportFault(sessionId: string, errorCode: string, errorMessage: string): Promise<ApiResponse<any>> {
    return this.request(`/charging/${sessionId}/fault`, {
      method: 'PUT',
      body: JSON.stringify({ errorCode, errorMessage }),
    });
  }

  async getActiveSession(): Promise<ApiResponse<any>> {
    return this.request('/charging/active');
  }

  async getChargingHistory(page: number = 1, limit: number = 10): Promise<ApiResponse<any>> {
    return this.request(`/charging/history?page=${page}&limit=${limit}`);
  }

  // ===== NEW: Cancel all active sessions (DEV USE) =====
  async cancelAllSessions(): Promise<ApiResponse<{ cancelledCount: number }>> {
    return this.request('/charging/cancel-all', {
      method: 'DELETE',
    });
  }

  // ===== Password Reset Methods =====

  async forgotPassword(email: string): Promise<ApiResponse<{ tempPassword?: string; expiresIn?: string }>> {
    return this.request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse<void>> {
    return this.request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
export type { ApiResponse, LoginRequest, LoginResponse, RegisterRequest };