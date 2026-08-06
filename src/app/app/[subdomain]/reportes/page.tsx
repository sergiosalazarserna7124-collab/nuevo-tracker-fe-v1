"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
} from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
} from 'lucide-react';
import PageHeader from '@/components/dashboard/PageHeader';
import {
  SectionPortadaKPIs,
  SectionNarrativa,
  SectionFunnel,
  SectionEstadoFinal,
  SectionOrigen,
  SectionHigieneCRM,
  SectionPorCanal,
  SectionDemografia,
  SectionComparativo,
  SectionCobertura,
  SectionConversaciones,
  SectionRankingAsesores,
  SectionObjeciones,
  SectionFrasesRepetitivas,
  SectionConclusiones,
} from '@/components/report-v2';
import PremiumGate from '@/components/dashboard/PremiumGate';
import type { ReportV2Data } from '@/types/report-v2';
import type { ReportV2 } from '@/types/reportV2';
import { adaptReportV2 } from '@/lib/adapters/reportV2Adapter';

// ─── Month helpers ───────────────────────────────────────────────────────────

const MONTHS_TO_SHOW = 12;

function buildMonthOptions(): { value: string; label: string; from: string; to: string }[] {
  const today = new Date();
  const options: { value: string; label: string; from: string; to: string }[] = [];
  for (let i = 1; i <= MONTHS_TO_SHOW; i++) {
    const d = subMonths(today, i);
    const monthStart = startOfMonth(d);
    const monthEnd = endOfMonth(d);
    const label = format(d, 'MMMM yyyy', { locale: es });
    options.push({
      value: format(d, 'yyyy-MM'),
      label: label.charAt(0).toUpperCase() + label.slice(1),
      from: format(monthStart, 'yyyy-MM-dd'),
      to: format(monthEnd, 'yyyy-MM-dd'),
    });
  }
  return options;
}

type PeriodMode = 'month' | 'personalizado';

function periodLabel(mode: PeriodMode, monthLabel: string, from: string, to: string) {
  if (mode === 'personalizado') return `${from} → ${to}`;
  return monthLabel;
}

// ─── Loading skeleton ────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="p-3 md:p-4 space-y-3 animate-pulse">
      <div className="h-32 rounded-xl bg-[#111A2A]" />
      <div className="h-40 rounded-xl bg-[#111A2A]" />
      <div className="h-52 rounded-xl bg-[#111A2A]" />
      <div className="h-40 rounded-xl bg-[#111A2A]" />
      <div className="h-32 rounded-xl bg-[#111A2A]" />
    </div>
  );
}

// ─── PDF export ──────────────────────────────────────────────────────────────

async function exportPdf(
  element: HTMLElement,
  companyName: string,
  subdomain: string,
  periodoStr: string,
) {
  const html2canvas = (await import('html2canvas')).default;
  const { jsPDF } = await import('jspdf');
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: '#0A101B',
    useCORS: true,
    logging: false,
  });
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  const marginX = 10;
  const headerH = 22;
  const footerH = 12;
  const gapAboveContent = 4;
  const gapBelowContent = 4;
  const contentW = pdfW - marginX * 2;
  const contentAreaH = pdfH - headerH - gapAboveContent - gapBelowContent - footerH;
  const pxToMm = contentW / canvas.width;
  const totalContentH = canvas.height * pxToMm;
  const pageCount = Math.ceil(totalContentH / contentAreaH);
  const generatedDate = new Date().toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const displayName = companyName;

  for (let page = 0; page < pageCount; page++) {
    if (page > 0) pdf.addPage();

    // Header — dark bg with cyan accent
    pdf.setFillColor(10, 16, 27); // #0A101B
    pdf.rect(0, 0, pdfW, headerH, 'F');
    pdf.setFillColor(34, 211, 238); // #22D3EE
    pdf.rect(0, headerH - 0.5, pdfW, 0.5, 'F');
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(231, 239, 248); // #E7EFF8
    pdf.text(displayName, marginX, 9);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(34, 211, 238); // #22D3EE
    pdf.text(`Reporte Ejecutivo Comercial · ${periodoStr}`, marginX, 17);
    pdf.setFontSize(7);
    pdf.setTextColor(141, 162, 184); // #8DA2B8
    const dateText = `Generado: ${generatedDate}`;
    pdf.text(dateText, pdfW - marginX - pdf.getTextWidth(dateText), 9);
    if (pageCount > 1) {
      const pageText = `Página ${page + 1} / ${pageCount}`;
      pdf.text(pageText, pdfW - marginX - pdf.getTextWidth(pageText), 17);
    }

    // Content slice
    const srcYMm = page * contentAreaH;
    const srcYPx = Math.round(srcYMm / pxToMm);
    const sliceHeightMm = Math.min(contentAreaH, totalContentH - srcYMm);
    const sliceHeightPx = Math.round(sliceHeightMm / pxToMm);
    if (sliceHeightPx > 0) {
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sliceHeightPx;
      const ctx = slice.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0A101B';
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, -srcYPx);
        const imgData = slice.toDataURL('image/jpeg', 0.92);
        pdf.addImage(imgData, 'JPEG', marginX, headerH + gapAboveContent, contentW, sliceHeightMm);
      }
    }

    // Footer
    pdf.setFillColor(10, 16, 27); // #0A101B
    pdf.rect(0, pdfH - footerH, pdfW, footerH, 'F');
    pdf.setFillColor(30, 43, 64); // #1E2B40
    pdf.rect(0, pdfH - footerH, pdfW, 0.4, 'F');
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(95, 114, 136); // #5F7288
    pdf.text('Generado por LeadMaster — leadmaster.com.co', marginX, pdfH - footerH + 7);
    const confText = 'Reporte confidencial · uso interno';
    pdf.text(confText, pdfW - marginX - pdf.getTextWidth(confText), pdfH - footerH + 7);
  }

  pdf.save(`reporte-${subdomain}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function ReportesPage() {
  const params = useParams();
  const subdomain = typeof params?.subdomain === 'string' ? params.subdomain : '';

  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);
  const [mode, setMode] = useState<PeriodMode>('month');
  const [customFrom, setCustomFrom] = useState(monthOptions[0].from);
  const [customTo, setCustomTo] = useState(monthOptions[0].to);
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [reportData, setReportData] = useState<ReportV2Data | null>(null);
  const [enriquecimientoParcial, setEnriquecimientoParcial] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const reportRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentMonthOption = useMemo(
    () => monthOptions.find((m) => m.value === selectedMonth) ?? monthOptions[0],
    [monthOptions, selectedMonth],
  );

  const { from, to } = useMemo(() => {
    if (mode === 'personalizado') return { from: customFrom, to: customTo };
    return { from: currentMonthOption.from, to: currentMonthOption.to };
  }, [mode, customFrom, customTo, currentMonthOption]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMonthDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch company name
  useEffect(() => {
    fetch('/api/data/mis-cuentas')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { accounts?: Array<{ subdominio: string; nombre_cuenta: string }> } | null) => {
        const match = d?.accounts?.find((a) => a.subdominio === subdomain);
        if (match) setCompanyName(match.nombre_cuenta);
      })
      .catch(() => {});
  }, [subdomain]);

  useEffect(() => {
    setLoading(true);
    setReportData(null);
    setFetchError(null);
    setEnriquecimientoParcial(false);

    const qs = new URLSearchParams({
      from,
      to,
      period_type: mode === 'personalizado' ? 'custom' : 'monthly',
    });

    const controller = new AbortController();

    fetch(`/api/data/report-v2?${qs.toString()}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json() as Promise<ReportV2>;
      })
      .then((apiData) => {
        setEnriquecimientoParcial(apiData.meta.enriquecimientoParcial);
        setReportData(adaptReportV2(apiData));
        if (!companyName && apiData.meta.nombre) {
          setCompanyName(apiData.meta.nombre);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('Error al cargar reporte v2:', err);
        setFetchError('No se pudo cargar el reporte. Intenta de nuevo.');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [from, to, mode, subdomain, companyName]);

  const downloadPdf = useCallback(async () => {
    if (!reportRef.current || !reportData) return;
    setGeneratingPdf(true);
    try {
      await exportPdf(
        reportRef.current,
        reportData.cuenta.nombre,
        subdomain,
        periodLabel(mode, currentMonthOption.label, from, to),
      );
    } catch (err) {
      console.error('Error al exportar PDF:', err);
      alert('No se pudo exportar el PDF. Por favor intenta de nuevo.');
    } finally {
      setGeneratingPdf(false);
    }
  }, [reportData, subdomain, mode, currentMonthOption.label, from, to]);

  return (
    <>
      <PageHeader
        title="Reporte Mensual"
        subtitle={`Periodo: ${periodLabel(mode, currentMonthOption.label, from, to)}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* Mode toggle: Mensual vs Personalizado */}
            <div className="flex rounded-lg bg-[#111A2A] p-0.5 border border-[#1E2B40]">
              <button
                type="button"
                onClick={() => setMode('month')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  mode === 'month'
                    ? 'bg-accent-cyan text-black'
                    : 'text-[#8DA2B8] hover:text-white hover:bg-[#152238]'
                }`}
              >
                Mensual
              </button>
              <button
                type="button"
                onClick={() => setMode('personalizado')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  mode === 'personalizado'
                    ? 'bg-accent-cyan text-black'
                    : 'text-[#8DA2B8] hover:text-white hover:bg-[#152238]'
                }`}
              >
                Personalizado
              </button>
            </div>

            {/* Month dropdown */}
            {mode === 'month' && (
              <div ref={dropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => setMonthDropdownOpen((prev) => !prev)}
                  className="flex items-center gap-2 rounded-lg bg-[#111A2A] border border-[#1E2B40] px-3 py-1.5 text-sm text-white hover:border-accent-cyan/50 transition-colors"
                >
                  <Calendar className="w-3.5 h-3.5 text-accent-cyan shrink-0" />
                  {currentMonthOption.label}
                  <ChevronDown className="w-3.5 h-3.5 text-[#5F7288] shrink-0" />
                </button>
                {monthDropdownOpen && (
                  <div className="absolute top-full mt-1 left-0 z-50 w-56 max-h-64 overflow-y-auto rounded-lg bg-[#111A2A] border border-[#1E2B40] shadow-xl">
                    {monthOptions.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => {
                          setSelectedMonth(m.value);
                          setMonthDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                          m.value === selectedMonth
                            ? 'bg-accent-cyan/10 text-accent-cyan font-medium'
                            : 'text-[#8DA2B8] hover:bg-[#152238] hover:text-white'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Custom date range */}
            {mode === 'personalizado' && (
              <div className="flex items-center gap-1 rounded-lg bg-[#111A2A] border border-[#1E2B40] px-2 py-1 text-sm text-[#8DA2B8]">
                <Calendar className="w-3.5 h-3.5 text-accent-cyan shrink-0" />
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  onFocus={(e) => e.currentTarget.showPicker?.()}
                  className="bg-transparent text-sm text-white border-none focus:ring-0 cursor-pointer w-32"
                />
                <ChevronRight className="w-3.5 h-3.5 text-[#5F7288] shrink-0" />
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  onChange={(e) => setCustomTo(e.target.value)}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  onFocus={(e) => e.currentTarget.showPicker?.()}
                  className="bg-transparent text-sm text-white border-none focus:ring-0 cursor-pointer w-32"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => void downloadPdf()}
              disabled={generatingPdf || loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-cyan text-black text-sm font-semibold hover:shadow-glow-cyan disabled:opacity-50 transition-all"
            >
              {generatingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {generatingPdf ? 'Generando...' : 'Descargar PDF'}
            </button>
          </div>
        }
      />

      {loading ? (
        <LoadingSkeleton />
      ) : fetchError ? (
        <div className="flex items-center justify-center min-h-[300px] text-accent-red text-sm">
          {fetchError}
        </div>
      ) : !reportData ? (
        <div className="flex items-center justify-center min-h-[300px] text-[#5F7288] text-sm">
          No hay datos para el periodo seleccionado.
        </div>
      ) : (
        <div
          ref={reportRef}
          className="p-3 md:p-5 space-y-4 max-w-6xl mx-auto min-w-0 overflow-x-hidden"
          style={{ backgroundColor: '#0A101B' }}
        >
          {enriquecimientoParcial && (
            <div className="rounded-lg bg-accent-amber/10 border border-accent-amber/20 px-4 py-3 text-xs text-accent-amber flex items-center gap-2">
              <span className="font-semibold">Análisis IA parcial:</span>
              <span className="text-[#8DA2B8]">
                Algunos bloques cualitativos (conversaciones, demografía IA, narrativas) pueden estar incompletos
                porque el análisis IA aún no cubre todo el periodo.
              </span>
            </div>
          )}

          {/* Portada + KPIs */}
          <SectionPortadaKPIs
            data={reportData.kpis}
            companyName={reportData.cuenta.nombre}
            periodo={`${reportData.periodo.from} → ${reportData.periodo.to}`}
          />

          {/* Resumen ejecutivo narrativo */}
          <SectionNarrativa data={reportData.narrativa} />

          {/* Embudo */}
          <SectionFunnel data={reportData.funnel} />

          {/* Estado final */}
          <SectionEstadoFinal data={reportData.estadoFinal} />

          {/* Origen nuevos/reactivados */}
          <SectionOrigen data={reportData.origen} />

          {/* Higiene CRM */}
          <SectionHigieneCRM data={reportData.higieneCRM} from={from} to={to} />

          {/* Desglose por canal (narrativa es premium) */}
          {!reportData.hasGeminiKey ? (
            <PremiumGate hasGeminiKey={false} premiumStatus={reportData.geminiPremiumStatus}>
              <></>
            </PremiumGate>
          ) : (
            <PremiumGate hasGeminiKey={reportData.hasGeminiKey} premiumStatus={reportData.geminiPremiumStatus}>
              <SectionPorCanal
                llamadas={reportData.porCanal.llamadas}
                chats={reportData.porCanal.chats}
                video={reportData.porCanal.video}
              />
            </PremiumGate>
          )}

          {/* Demografía */}
          <SectionDemografia data={reportData.demografia} />

          {/* Comparativo */}
          <SectionComparativo data={reportData.comparativo} />

          {reportData.hasGeminiKey && (
            <>
              {/* Cobertura / respuesta */}
              <PremiumGate hasGeminiKey={reportData.hasGeminiKey} premiumStatus={reportData.geminiPremiumStatus}>
                <SectionCobertura data={reportData.cobertura} />
              </PremiumGate>

              {/* Análisis de conversaciones por canal */}
              <PremiumGate hasGeminiKey={reportData.hasGeminiKey} premiumStatus={reportData.geminiPremiumStatus}>
                <SectionConversaciones
                  llamadas={reportData.conversaciones.llamadas}
                  chats={reportData.conversaciones.chats}
                  video={reportData.conversaciones.video}
                />
              </PremiumGate>

              {/* Ranking de asesores (narrativa es premium) */}
              <PremiumGate hasGeminiKey={reportData.hasGeminiKey} premiumStatus={reportData.geminiPremiumStatus}>
                <SectionRankingAsesores data={reportData.rankingAsesores} />
              </PremiumGate>

              {/* Objeciones */}
              <PremiumGate hasGeminiKey={reportData.hasGeminiKey} premiumStatus={reportData.geminiPremiumStatus}>
                <SectionObjeciones data={reportData.objeciones} />
              </PremiumGate>

              {/* Frases repetitivas */}
              <PremiumGate hasGeminiKey={reportData.hasGeminiKey} premiumStatus={reportData.geminiPremiumStatus}>
                <SectionFrasesRepetitivas data={reportData.frasesRepetitivas} />
              </PremiumGate>

              {/* Conclusiones */}
              <PremiumGate hasGeminiKey={reportData.hasGeminiKey} premiumStatus={reportData.geminiPremiumStatus}>
                <SectionConclusiones data={reportData.conclusiones} />
              </PremiumGate>
            </>
          )}
        </div>
      )}
    </>
  );
}
