import * as XLSX from 'xlsx';
import type { DashboardResponse } from '@/types';

export function exportDashboardToExcel(
  data: DashboardResponse,
  dateFrom: string,
  dateTo: string,
) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: KPIs operativos
  const kpis = data.kpis;
  const kpiRows = [
    ['Métrica', 'Valor'],
    ['Total Leads', kpis.totalLeads],
    ['Llamadas realizadas', kpis.callsMade],
    ['Contestadas', kpis.contestadas],
    ['Tasa de contestación', kpis.answerRate],
    ['Citas agendadas', kpis.meetingsBooked],
    ['Citas asistidas', kpis.meetingsAttended],
    ['Citas canceladas', kpis.meetingsCanceled],
    ['No shows', kpis.noShows],
    ['Citas cerradas', kpis.meetingsClosed],
    ['Tasa de cierre', kpis.tasaCierre],
    ['Tasa de agendamiento', kpis.tasaAgendamiento],
    ['Revenue', kpis.revenue],
    ['Cash Collected', kpis.cashCollected],
    ['Ticket promedio', kpis.avgTicket],
    ['Speed to lead (min)', kpis.speedToLeadAvg],
    ['Intentos promedio', kpis.avgAttempts],
  ];

  const metricasDelPanel = (data.metricasComputadas ?? []).filter((m) => {
    if (Array.isArray(m.paneles)) return m.paneles.includes('panel_ejecutivo');
    return m.ubicacion === 'panel_ejecutivo' || m.ubicacion === 'ambos' || !m.ubicacion;
  });
  for (const m of metricasDelPanel) {
    kpiRows.push([m.nombre, typeof m.valor === 'number' ? m.valor : String(m.valor)]);
  }

  const wsKpis = XLSX.utils.aoa_to_sheet(kpiRows);
  wsKpis['!cols'] = [{ wch: 28 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsKpis, 'KPIs');

  // Sheet 2: Ranking por asesor
  const rankingHeaders = [
    'Asesor', 'Leads trabajados', 'Leads nuevos', 'Leads reactivados', 'Con actividad',
    'Llamadas', 'Speed to lead (min)', 'Citas agendadas', 'Citas asistidas',
    'Facturación', 'Efectivo', 'Tasa contacto', 'Tasa agend.',
  ];

  const webhookFields = new Set<string>();
  for (const a of data.advisorRanking) {
    for (const f of Object.keys(a.metricasWebhook ?? {})) webhookFields.add(f);
  }
  const webhookCols = Array.from(webhookFields).sort();
  rankingHeaders.push(...webhookCols);

  const rankingRows: (string | number | null)[][] = [rankingHeaders];
  for (const a of data.advisorRanking) {
    const row: (string | number | null)[] = [
      a.advisorName,
      a.totalLeads,
      a.leadsGenerados,
      a.leadsReactivados,
      a.leadsConActividad,
      a.callsMade,
      a.speedToLeadAvg,
      a.meetingsBooked,
      a.meetingsAttended,
      a.revenue,
      a.cashCollected,
      a.contactRate,
      a.bookingRate,
    ];
    for (const col of webhookCols) {
      row.push(a.metricasWebhook?.[col] ?? null);
    }
    rankingRows.push(row);
  }

  const wsRanking = XLSX.utils.aoa_to_sheet(rankingRows);
  wsRanking['!cols'] = rankingHeaders.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, wsRanking, 'Ranking Asesores');

  // Sheet 3: Volumen por día
  if (data.volumeByDay.length > 0) {
    const volRows: (string | number)[][] = [['Fecha', 'Llamadas', 'Citas', 'Cierres']];
    for (const d of data.volumeByDay) {
      volRows.push([d.date, d.llamadas, d.citasPresentaciones, d.cierres]);
    }
    const wsVol = XLSX.utils.aoa_to_sheet(volRows);
    wsVol['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsVol, 'Volumen Diario');
  }

  // Sheet 4: Objeciones
  if (data.objeciones.length > 0) {
    const objRows: (string | number)[][] = [['Objeción', 'Cantidad', 'Porcentaje']];
    for (const o of data.objeciones) {
      objRows.push([o.name, o.count, o.percent]);
    }
    const wsObj = XLSX.utils.aoa_to_sheet(objRows);
    wsObj['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsObj, 'Objeciones');
  }

  // Sheet 5: Metas
  if (data.alertasMetas && data.alertasMetas.length > 0) {
    const metaRows: (string | number | boolean)[][] = [
      ['Meta', 'Canal', 'Actual', 'Objetivo', 'Cumplimiento %', 'Cumple'],
    ];
    for (const a of data.alertasMetas) {
      metaRows.push([a.label, a.canal, a.actual, a.meta, a.pct, a.cumple]);
    }
    const wsMetas = XLSX.utils.aoa_to_sheet(metaRows);
    wsMetas['!cols'] = [{ wch: 24 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, wsMetas, 'Metas');
  }

  const filename = `LeadMaster_Dashboard_${dateFrom}_${dateTo}.xlsx`;
  XLSX.writeFile(wb, filename);
}
