// server/src/config/tidb.ts
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL || '';
// URL ผิดรูปแบบไม่ควรทำให้ทั้งเว็บล้ม: export Excel/PDF ไม่ต้องใช้ DB ส่วนแชทจะแจ้ง error เอง
const pool = url.startsWith('mysql://')
  ? mysql.createPool({
      uri: url,
      ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }, // TiDB Cloud บังคับ TLS
      connectionLimit: 5,
    })
  : mysql.createPool({ host: 'invalid.local', connectionLimit: 1 });

if (!url.startsWith('mysql://')) console.warn('DATABASE_URL ไม่ได้ตั้งค่า: AI Chat จะใช้งานไม่ได้');

export const db = drizzle(pool);
