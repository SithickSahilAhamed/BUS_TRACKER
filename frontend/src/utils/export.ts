/**
 * PDF/Excel export (PROJECT_SPEC.md section 8). Pure client-side —
 * jsPDF/xlsx run entirely in the browser, no backend involved, consistent
 * with the rest of this app.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

type CellValue = string | number;

const filenameSafe = (s: string) => s.replace(/[^a-z0-9]+/gi, '_');

export function exportToPdf(title: string, columns: string[], rows: CellValue[][]): void {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(title, 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`ACT To Go — Agni College of Technology · Generated ${new Date().toLocaleString()}`, 14, 21);
  autoTable(doc, {
    head: [columns],
    body: rows.map((r) => r.map(String)),
    startY: 26,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [15, 93, 143] },
  });
  doc.save(`${filenameSafe(title)}.pdf`);
}

export function exportToExcel(title: string, columns: string[], rows: CellValue[][]): void {
  const worksheet = XLSX.utils.aoa_to_sheet([columns, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, title.slice(0, 31)); // Excel sheet-name limit
  XLSX.writeFile(workbook, `${filenameSafe(title)}.xlsx`);
}
