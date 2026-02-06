# TACT Mobile Charger Application

แอปพลิเคชัน Mobile สำหรับค้นหาและใช้งานสถานีชาร์จ EV ที่ใช้เครื่องปั่นไฟ

## 📁 โครงสร้างโปรเจค

```
src/
├── App.tsx                 # Main app component พร้อม navigation
├── global.css              # Tailwind CSS
├── components/
│   └── BottomTabs.tsx      # Bottom tab navigation
├── contexts/
│   ├── AuthContext.tsx     # Authentication state management
│   ├── LanguageContext.tsx # Multi-language support (TH/EN)
│   └── index.ts
├── i18n/
│   └── translations.ts     # Translation strings
├── screens/
│   ├── LoadingScreen.tsx   # Boot/splash screen
│   ├── LoginScreen.tsx     # Login page
│   ├── RegisterScreen.tsx  # Registration page
│   ├── MainScreen.tsx      # Map view with station pins
│   ├── ChargerScreen.tsx   # Station detail & charger info
│   ├── ChargingScreen.tsx  # Real-time charging status
│   ├── FinishingScreen.tsx # Charging summary
│   ├── ContactScreen.tsx   # Help center
│   ├── ProfileScreen.tsx   # User profile
│   ├── FaultScreen.tsx     # Error popup modal
│   └── index.ts
└── types/
    └── index.ts            # TypeScript interfaces
```

## 🚀 วิธีการติดตั้ง

### 1. คัดลอกไฟล์ไปยังโปรเจคของคุณ

คัดลอกโฟลเดอร์ `src/` ทั้งหมดไปยังโปรเจค Expo ของคุณ

### 2. ติดตั้ง Dependencies เพิ่มเติม

```bash
npx expo install @expo/vector-icons expo-location react-native-maps
```

### 3. อัพเดท App.tsx ที่ root

แก้ไข `App.tsx` ที่ root ของโปรเจค:

```tsx
export { default } from './src/App';
```

### 4. รันแอป

```bash
npx expo start
```

## 📱 หน้าจอตาม TOR

| หน้าจอ | รายละเอียด |
|--------|-----------|
| Loading | แสดงโลโก้ TACT และโหลดคอนฟิก |
| Login | เข้าสู่ระบบ พร้อม Remember me |
| Register | สมัครสมาชิก พร้อม validation |
| Main (Map) | แผนที่พร้อมหมุดสถานี, ค้นหา, เลือกภาษา |
| Charger | ข้อมูลสถานี, Generator, หัวชาร์จ |
| Charging | สถานะ real-time: Power, SOC, Time, Energy |
| Finishing | สรุปการชาร์จ |
| Contact | ช่องทางติดต่อ |
| Profile | ข้อมูลผู้ใช้ |

## 🌐 รองรับ 2 ภาษา

- ไทย (th)
- English (en)

สามารถเปลี่ยนภาษาได้ที่ dropdown บนหน้า Map

## 🔧 TODO สำหรับการพัฒนาต่อ

- [ ] เชื่อมต่อกับ MongoDB API จริง
- [ ] ใช้ react-native-maps แทน placeholder
- [ ] เพิ่ม Forgot Password functionality
- [ ] เพิ่ม AsyncStorage สำหรับ Remember me
- [ ] เชื่อมต่อกับฮาร์ดแวร์/อุปกรณ์ภาคสนาม
- [ ] ทดสอบกับ Google Maps API

## 📝 หมายเหตุ

- ไม่มีการคิดเงินจริง/ชำระเงินจริงในเวอร์ชันนี้
- ข้อมูลสถานีเป็น mock data สำหรับการพัฒนา
