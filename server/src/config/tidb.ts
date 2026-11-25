// server/src/config/tidb.ts
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

// TiDB Cloud บังคับ TLS; pool ไม่เชื่อมต่อจนกว่าจะมี query แรก
const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
  connectionLimit: 5,
});

export const db = drizzle(pool);
