# PTC Smart Schedule (server + เว็บ)

```bash
cd server
cp .env.example .env   # ใส่ GEMINI_API_KEY และ DATABASE_URL ของ TiDB
npm install
npm run dev            # เปิด http://localhost:3000
npm test               # ทดสอบตัวกรอง SQL
```

- `POST /api/ai-chat` `{ question, runId }` – ถาม-ตอบตารางเรียน (Text-to-SQL แบบ SELECT อย่างเดียว)
- `POST /api/export/excel` / `POST /api/export/pdf` `{ title, subtitle, items[] }`
- ควรให้ `DATABASE_URL` ใช้ผู้ใช้ที่มีสิทธิ์ SELECT อย่างเดียว เพื่อป้องกันอีกชั้นหนึ่งนอกจากตัวกรอง SQL
