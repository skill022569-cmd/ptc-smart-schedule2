// server/src/routes/utilityRoutes.ts
import { Router } from 'express';
import { askScheduleAssistant } from '../services/aiChatService';
import { generateTimetableExcel, generateTimetablePdf, validateItems } from '../services/exportService';

const router = Router();

// Endpoint สำหรับ AI Chatbot ถาม-ตอบตารางเรียน
router.post('/ai-chat', async (req, res) => {
  const { question, runId } = req.body;
  if (!question || typeof question !== 'string' || question.length > 500) {
    return res.status(400).json({ error: 'กรุณาระบุคำถาม (ไม่เกิน 500 ตัวอักษร)' });
  }

  const response = await askScheduleAssistant(question, runId);
  res.json(response);
});

// Endpoint ดาวน์โหลดไฟล์ Excel (.xlsx)
router.post('/export/excel', async (req, res) => {
  try {
    const { title = '', subtitle = '', items } = req.body;
    const buffer = await generateTimetableExcel(String(title), String(subtitle), validateItems(items));

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="ptc-timetable.xlsx"');
    res.send(buffer);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Endpoint ดาวน์โหลดไฟล์ PDF
router.post('/export/pdf', async (req, res) => {
  try {
    const { title = '', subtitle = '', items } = req.body;
    const buffer = await generateTimetablePdf(String(title), String(subtitle), validateItems(items));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="ptc-timetable.pdf"');
    res.send(buffer);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
