import * as XLSX from 'xlsx';
import type { ApiVideollamada, ApiLlamadaLog, LlamadaLead, ApiChatLead } from '@/types';

function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename);
}

export function exportVideollamadas(
  registros: ApiVideollamada[],
  dateFrom: string,
  dateTo: string,
  advisorFilter?: string,
) {
  const wb = XLSX.utils.book_new();

  const headers = [
    'Fecha', 'Lead', 'Email', 'Asesor', 'Asistió', 'Calificada',
    'Cancelada', 'Resultado', 'Facturación', 'Efectivo cobrado',
    'Origen', 'Tags', 'Resumen IA',
  ];
  const rows: (string | number | boolean)[][] = [headers];

  for (const r of registros) {
    rows.push([
      r.datetime,
      r.leadName ?? '',
      r.leadEmail ?? '',
      r.closer ?? '',
      r.attended ? 'Sí' : 'No',
      r.qualified ? 'Sí' : 'No',
      r.canceled ? 'Sí' : 'No',
      r.outcome ?? '',
      r.facturacion,
      r.cashCollected,
      r.origen ?? '',
      r.tags ?? '',
      r.resumenIa ?? '',
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Videollamadas');

  const suffix = advisorFilter ? `_${advisorFilter.replace(/[^a-zA-Z0-9]/g, '_')}` : '_todos';
  downloadWorkbook(wb, `LeadMaster_Videollamadas${suffix}_${dateFrom}_${dateTo}.xlsx`);
}

export function exportLlamadas(
  leads: LlamadaLead[],
  registros: ApiLlamadaLog[],
  dateFrom: string,
  dateTo: string,
  advisorFilter?: string,
) {
  const wb = XLSX.utils.book_new();

  const leadHeaders = [
    'ID Registro', 'Nombre', 'Email', 'Teléfono', 'Asesor',
    'Estado', 'Speed to lead (min)', 'Fecha evento', 'ID GHL',
  ];
  const leadRows: (string | number | null)[][] = [leadHeaders];

  for (const l of leads) {
    leadRows.push([
      l.id_registro,
      l.nombre_lead ?? '',
      l.mail_lead ?? '',
      l.phone ?? '',
      l.closer_mail ?? '',
      l.estado ?? '',
      l.speed_to_lead_min,
      l.fecha_evento ?? '',
      l.id_user_ghl ?? '',
    ]);
  }

  const wsLeads = XLSX.utils.aoa_to_sheet(leadRows);
  wsLeads['!cols'] = leadHeaders.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, wsLeads, 'Leads');

  const callHeaders = [
    'Fecha', 'Lead', 'Email', 'Teléfono', 'Asesor',
    'Tipo evento', 'Resultado', 'Speed to lead (min)',
    'Transcripción', 'Análisis IA',
  ];
  const callRows: (string | number | null)[][] = [callHeaders];

  for (const c of registros) {
    callRows.push([
      c.datetime,
      c.leadName ?? '',
      c.leadEmail ?? '',
      c.phone ?? '',
      c.closerName ?? c.closerMail ?? '',
      c.tipoEvento ?? '',
      c.outcome ?? '',
      c.speedToLeadMinutes,
      c.transcripcion ?? '',
      c.iaDescripcion ?? '',
    ]);
  }

  const wsCalls = XLSX.utils.aoa_to_sheet(callRows);
  wsCalls['!cols'] = callHeaders.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, wsCalls, 'Llamadas');

  const suffix = advisorFilter ? `_${advisorFilter.replace(/[^a-zA-Z0-9]/g, '_')}` : '_todos';
  downloadWorkbook(wb, `LeadMaster_Llamadas${suffix}_${dateFrom}_${dateTo}.xlsx`);
}

export function exportChats(
  chats: ApiChatLead[],
  dateFrom: string,
  dateTo: string,
  advisorFilter?: string,
) {
  const wb = XLSX.utils.book_new();

  const headers = [
    'Fecha', 'Lead', 'Email', 'Teléfono', 'Asesor asignado',
    'Total mensajes', 'Msgs lead', 'Msgs agente',
    'Speed to lead (s)', 'Estado', 'Interés IA',
    'Objeciones IA', 'Contactado',
  ];
  const rows: (string | number | boolean | null)[][] = [headers];

  for (const c of chats) {
    rows.push([
      c.datetime,
      c.leadName ?? '',
      c.leadEmail ?? '',
      c.leadPhone ?? '',
      c.asesorAsignado ?? c.agentName ?? '',
      c.totalMessages,
      c.leadMessages,
      c.agentMessages,
      c.speedToLeadSeconds,
      c.estado ?? '',
      c.iaCategoria ?? '',
      c.iaObjeciones?.map((o) => o.categoria).join(', ') ?? '',
      c.humanTookOver ? 'Sí' : 'No',
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Chats');

  const suffix = advisorFilter ? `_${advisorFilter.replace(/[^a-zA-Z0-9]/g, '_')}` : '_todos';
  downloadWorkbook(wb, `LeadMaster_Chats${suffix}_${dateFrom}_${dateTo}.xlsx`);
}
