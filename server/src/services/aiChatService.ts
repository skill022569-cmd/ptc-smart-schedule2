// server/src/services/aiChatService.ts
import { GoogleGenAI } from '@google/genai';
import { db } from '../config/tidb';
import { sql } from 'drizzle-orm';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const DB_SCHEMA_CONTEXT = `
ฐานข้อมูล TiDB (MySQL Dialect) ของระบบจัดตารางเรียนวิทยาลัยการอาชีพโพนทอง:
1. schedules (id, run_id, offering_id, day [1=จันทร์..5=ศุกร์], start_period [1..9], duration, room_id, status ['SCHEDULED','UNPLACED_PARKED'], conflict_reason)
2. course_offerings (id, semester, subject_id, group_ids JSON array, teacher_ids JSON array, sub_group_label, total_students)
3. subjects (id, subject_code, subject_name, theory_hours, practice_hours, total_periods, required_room_type)
4. teachers (id, teacher_code, full_name, position, department_id, day_off, unavailable_slots JSON)
5. rooms (id, room_code, room_name, building_code, capacity, room_type)
6. student_groups (id, group_code, department_id, student_count, program_type)
7. departments (id, code, name, education_level)

หมายเหตุ: ใน TiDB สามารถใช้ JSON_CONTAINS(course_offerings.teacher_ids, JSON_QUOTE(teachers.id)) เพื่อ Join ตารางได้
`;

// ตรวจสอบความปลอดภัยของ SQL ป้องกัน SQL Injection และคำสั่งแก้ไขข้อมูล
export function validateSafeSelectQuery(rawSql: string): string {
  const cleaned = rawSql
    .replace(/```sql/gi, '')
    .replace(/```/g, '')
    .trim()
    .replace(/;\s*$/, '');

  if (!/^SELECT\s/i.test(cleaned)) {
    throw new Error('อนุญาตเฉพาะคำสั่ง SELECT เท่านั้น');
  }

  // ; กลางคำสั่ง = multi-statement, คอมเมนต์ใช้ซ่อนคำสั่งได้
  if (/;|--|\/\*|#/.test(cleaned)) {
    throw new Error('ไม่อนุญาตหลายคำสั่งหรือคอมเมนต์ใน SQL Query');
  }

  const forbiddenKeywords =
    /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|GRANT|REVOKE|EXEC|UNION|INTO|OUTFILE|DUMPFILE|LOAD_FILE|SLEEP|BENCHMARK|LOCK|CALL|HANDLER)\b/i;
  if (forbiddenKeywords.test(cleaned)) {
    throw new Error('ตรวจพบคำสั่งที่ไม่ได้รับอนุญาตใน SQL Query');
  }

  // บังคับ LIMIT ไม่เกิน 50 แถวเพื่อป้องกันการดึงข้อมูลหนักเกินไป
  if (!/\bLIMIT\b/i.test(cleaned)) {
    return `${cleaned} LIMIT 50`;
  }
  return cleaned;
}

export async function askScheduleAssistant(userQuestion: string, currentRunId: string) {
  try {
    // runId ถูกฝังลงใน SQL ที่ AI สร้าง จึงต้องเป็นรูปแบบปลอดภัยเท่านั้น
    if (!/^[\w-]{1,64}$/.test(currentRunId || '')) {
      throw new Error('runId ไม่ถูกต้อง');
    }

    // ขั้นที่ 1: แปลงคำถามภาษาไทยเป็น SQL Query สำหรับ TiDB
    const sqlPrompt = `
คุณคือผู้เชี่ยวชาญฐานข้อมูล TiDB (MySQL) จงแปลงคำถามของผู้ใช้เป็นคำสั่ง SQL SELECT 1 คำสั่งเท่านั้น
โดยกรองเฉพาะตารางเรียนล่าสุด run_id = '${currentRunId}' (หากเกี่ยวข้องกับตารางเรียน)
ตอบกลับเฉพาะโค้ด SQL ห้ามอธิบายเพิ่มเติม

${DB_SCHEMA_CONTEXT}

คำถามผู้ใช้: "${userQuestion}"
`;

    const sqlResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: sqlPrompt,
      config: { temperature: 0.1 },
    });

    const safeSql = validateSafeSelectQuery(sqlResponse.text || '');

    // รันคำสั่ง SQL บน TiDB
    const queryResult = await db.execute(sql.raw(safeSql));
    const rows = Array.isArray(queryResult) ? queryResult[0] : queryResult;

    // ขั้นที่ 2: สรุปผลลัพธ์เป็นคำตอบภาษาธรรมชาติที่เข้าใจง่าย
    const answerPrompt = `
คุณคือผู้ช่วย AI ประจำระบบจัดตารางเรียนตารางสอน "PTC Smart Schedule" วิทยาลัยการอาชีพโพนทอง
จงตอบคำถามของผู้ใช้โดยอ้างอิงจากข้อมูลผลลัพธ์ฐานข้อมูลด้านล่างนี้ให้กระชับ ชัดเจน สุภาพ และเข้าใจง่าย
(แปลงตัวเลข day: 1=วันจันทร์, 2=วันอังคาร, 3=วันพุธ, 4=วันพฤหัสบดี, 5=วันศุกร์ และระบุช่วงคาบเรียนให้ชัดเจน เช่น คาบที่ 3-4)
หากไม่พบข้อมูล ให้แจ้งอย่างสุภาพและแนะนำวิธีค้นหาเพิ่มเติม

คำถามผู้ใช้: "${userQuestion}"
ข้อมูลจากฐานข้อมูล: ${JSON.stringify(rows)}
`;

    const finalResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: answerPrompt,
      config: { temperature: 0.3 },
    });

    return {
      answer: finalResponse.text,
      executedSql: safeSql, // ส่งกลับไปแสดงในโหมด Debug/กรรมการตรวจสอบได้
      recordCount: Array.isArray(rows) ? rows.length : 0,
    };
  } catch (error: any) {
    return {
      answer: 'ขออภัยครับ ระบบไม่สามารถประมวลผลคำถามนี้ได้ กรุณาระบุชื่อครู รหัสวิชา ชื่อห้อง หรือกลุ่มเรียนให้ชัดเจนอีกครั้งครับ',
      error: error.message,
    };
  }
}
