// server/src/services/exportService.ts
import ExcelJS from 'exceljs';
import PdfPrinter from 'pdfmake';
import path from 'path';

export interface ExportScheduleRow {
  day: number;         // 1..5
  startPeriod: number; // 1..9
  duration: number;
  subjectCode: string;
  subjectName: string;
  teacherNames: string;
  groupNames: string;
  roomCode: string;
}

const DAY_NAMES = ['', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์'];
const PERIOD_TIMES = [
  '',
  '08.00-09.00',
  '09.00-10.00',
  '10.00-11.00',
  '11.00-12.00',
  '12.00-13.00',
  '13.00-14.00',
  '14.00-15.00',
  '15.00-16.00',
  '16.00-17.00',
];

// ข้อมูลมาจาก client: ตรวจช่วงวัน/คาบ และห้ามคาบซ้อนกัน (merge ซ้อนทำให้ exceljs throw / pdf เพี้ยน)
export function validateItems(items: unknown): ExportScheduleRow[] {
  if (!Array.isArray(items)) throw new Error('items ต้องเป็น array');
  const used = new Set<string>();
  for (const i of items as ExportScheduleRow[]) {
    const ok =
      Number.isInteger(i?.day) && i.day >= 1 && i.day <= 5 &&
      Number.isInteger(i.startPeriod) && i.startPeriod >= 1 &&
      Number.isInteger(i.duration) && i.duration >= 1 &&
      i.startPeriod + i.duration - 1 <= 9;
    if (!ok) throw new Error(`ข้อมูลวัน/คาบไม่ถูกต้อง: ${i?.subjectCode ?? ''}`);
    for (let p = i.startPeriod; p < i.startPeriod + i.duration; p++) {
      const key = `${i.day}-${p}`;
      if (used.has(key)) throw new Error(`คาบซ้อนกัน: วัน${DAY_NAMES[i.day]} คาบ ${p}`);
      used.add(key);
    }
  }
  return items as ExportScheduleRow[];
}

/**
 * 1. สร้างไฟล์ Excel (.xlsx) ตารางเรียน/ตารางสอน พร้อมผสานเซลล์คาบต่อเนื่อง
 */
export async function generateTimetableExcel(
  title: string,
  subtitle: string,
  items: ExportScheduleRow[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('ตารางเรียน-ตารางสอน', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
  });

  // หัวกระดาษวิทยาลัยการอาชีพโพนทอง
  sheet.mergeCells('A1:J1');
  sheet.getCell('A1').value = `วิทยาลัยการอาชีพโพนทอง — ${title}`;
  sheet.getCell('A1').font = { name: 'TH Sarabun New', size: 18, bold: true };
  sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:J2');
  sheet.getCell('A2').value = subtitle;
  sheet.getCell('A2').font = { name: 'TH Sarabun New', size: 14 };
  sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

  // หัวตาราง (คาบที่ 1 - 9)
  const headerRow = sheet.getRow(4);
  headerRow.values = [
    'วัน / คาบ',
    ...Array.from({ length: 9 }, (_, i) => `คาบ ${i + 1}\n(${PERIOD_TIMES[i + 1]})`),
  ];
  headerRow.height = 32;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'TH Sarabun New', size: 13, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  // เติมข้อมูลรายวัน (จันทร์ - ศุกร์)
  for (let day = 1; day <= 5; day++) {
    const rowIndex = 4 + day;
    const row = sheet.getRow(rowIndex);
    row.height = 55;
    row.getCell(1).value = DAY_NAMES[day];
    row.getCell(1).font = { name: 'TH Sarabun New', size: 14, bold: true };
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(1).border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };

    for (let p = 1; p <= 9; p++) {
      const cell = row.getCell(p + 1);
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.font = { name: 'TH Sarabun New', size: 12 };
    }

    // ใส่รายวิชาและ Merge Cells ตาม duration
    const dayItems = items.filter((i) => i.day === day);
    for (const item of dayItems) {
      const startCol = item.startPeriod + 1;
      const endCol = startCol + item.duration - 1;

      if (item.duration > 1) {
        sheet.mergeCells(rowIndex, startCol, rowIndex, endCol);
      }

      const targetCell = row.getCell(startCol);
      targetCell.value = `${item.subjectCode} ${item.subjectName}\nครู: ${item.teacherNames} | ห้อง: ${item.roomCode}`;
      targetCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
    }
  }

  // ปรับความกว้างคอลัมน์
  sheet.getColumn(1).width = 14;
  for (let c = 2; c <= 10; c++) {
    sheet.getColumn(c).width = 18;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * 2. สร้างไฟล์ PDF ตารางเรียน/ตารางสอน แบบฟอร์มราชการพร้อมช่องลงนาม
 */
export function generateTimetablePdf(
  title: string,
  subtitle: string,
  items: ExportScheduleRow[]
): Promise<Buffer> {
  // ฟอนต์ภาษาไทย TH Sarabun New ในโฟลเดอร์ server/assets/fonts
  const fonts = {
    Sarabun: {
      normal: path.resolve(__dirname, '../../assets/fonts/THSarabunNew.ttf'),
      bold: path.resolve(__dirname, '../../assets/fonts/THSarabunNew-Bold.ttf'),
    },
  };

  const printer = new PdfPrinter(fonts);

  const tableBody: any[][] = [
    [
      { text: 'วัน / คาบ', style: 'tableHeader' },
      ...Array.from({ length: 9 }, (_, i) => ({
        text: `คาบ ${i + 1}\n${PERIOD_TIMES[i + 1]}`,
        style: 'tableHeader',
      })),
    ],
  ];

  for (let day = 1; day <= 5; day++) {
    const rowCells: any[] = [{ text: DAY_NAMES[day], style: 'dayCell' }];
    let skip = 0;

    for (let p = 1; p <= 9; p++) {
      if (skip > 0) {
        rowCells.push({}); // เซลล์ว่างรองรับ colSpan ของ pdfmake
        skip--;
        continue;
      }

      const found = items.find((i) => i.day === day && i.startPeriod === p);
      if (found) {
        skip = found.duration - 1;
        rowCells.push({
          text: `${found.subjectCode}\n${found.subjectName}\n(${found.roomCode})`,
          colSpan: found.duration,
          style: 'subjectCell',
        });
      } else {
        rowCells.push({ text: '', style: 'emptyCell' });
      }
    }
    tableBody.push(rowCells);
  }

  const docDefinition: any = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [25, 25, 25, 25],
    defaultStyle: { font: 'Sarabun', fontSize: 12 },
    content: [
      { text: `วิทยาลัยการอาชีพโพนทอง — ${title}`, style: 'header' },
      { text: subtitle, style: 'subheader' },
      {
        table: {
          headerRows: 1,
          widths: [58, '*', '*', '*', '*', '*', '*', '*', '*', '*'],
          body: tableBody,
        },
      },
      // ส่วนลงนามท้ายตารางตามมาตรฐานสถานศึกษา
      {
        margin: [0, 25, 0, 0],
        columns: [
          { text: 'ลงชื่อ...........................................\n(หัวหน้าแผนกวิชา)', alignment: 'center' },
          { text: 'ลงชื่อ...........................................\n(หัวหน้างานพัฒนาหลักสูตรการเรียนการสอน)', alignment: 'center' },
          { text: 'ลงชื่อ...........................................\n(รองผู้อำนวยการฝ่ายวิชาการ)', alignment: 'center' },
        ],
      },
    ],
    styles: {
      header: { fontSize: 18, bold: true, alignment: 'center', margin: [0, 0, 0, 2] },
      subheader: { fontSize: 14, alignment: 'center', margin: [0, 0, 0, 12] },
      tableHeader: { bold: true, fontSize: 11, alignment: 'center', fillColor: '#E2E8F0' },
      dayCell: { bold: true, fontSize: 13, alignment: 'center', fillColor: '#F8FAFC' },
      subjectCell: { fontSize: 10, alignment: 'center', fillColor: '#EEF2FF' },
      emptyCell: { fontSize: 10 },
    },
  };

  return new Promise((resolve, reject) => {
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const chunks: Buffer[] = [];
    pdfDoc.on('data', (chunk) => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });
}
