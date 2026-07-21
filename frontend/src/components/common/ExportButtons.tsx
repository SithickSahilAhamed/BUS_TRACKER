import React from 'react';
import { exportToPdf, exportToExcel } from '../../utils/export';

interface ExportButtonsProps {
  title: string;
  columns: string[];
  rows: (string | number)[][];
}

/** PDF/Excel export (PROJECT_SPEC.md section 8), dropped into any report-like panel. */
export const ExportButtons: React.FC<ExportButtonsProps> = ({ title, columns, rows }) => (
  <div style={{ display: 'flex', gap: '.5rem' }}>
    <button className="btn btn-secondary btn-sm" onClick={() => exportToPdf(title, columns, rows)} disabled={rows.length === 0}>
      📄 PDF
    </button>
    <button className="btn btn-secondary btn-sm" onClick={() => exportToExcel(title, columns, rows)} disabled={rows.length === 0}>
      📊 Excel
    </button>
  </div>
);
