"use client";

import { useState, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Video,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  Calendar,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, isBefore, startOfDay, getDay, eachDayOfInterval } from "date-fns";
import { es } from "date-fns/locale";

interface DemoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const DAY_HEADERS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

const TIME_SLOTS = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "16:00", "16:30", "17:00", "17:30", "18:00",
];

function mondayIndex(date: Date) {
  const d = getDay(date);
  return d === 0 ? 6 : d - 1;
}

export default function DemoModal({ open, onOpenChange }: DemoModalProps) {
  const [step, setStep] = useState(1);
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState("");
  const [formData, setFormData] = useState({ name: "", email: "", company: "" });

  const resetAll = useCallback(() => {
    setStep(1);
    setCurrentMonth(startOfMonth(new Date()));
    setSelectedDate(null);
    setSelectedTime("");
    setFormData({ name: "", email: "", company: "" });
  }, []);

  const handleOpenChange = (value: boolean) => {
    if (!value) resetAll();
    onOpenChange(value);
  };

  const today = startOfDay(new Date());

  const calendarDays = (() => {
    const first = startOfMonth(currentMonth);
    const last = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: first, end: last });
    const offset = mondayIndex(first);
    const blanks: (Date | null)[] = Array.from({ length: offset }, () => null);
    return [...blanks, ...days];
  })();

  const isUnavailable = (date: Date) => {
    const day = getDay(date);
    return day === 0 || day === 6 || isBefore(date, today);
  };

  const formatSelectedDate = () => {
    if (!selectedDate) return "";
    return format(selectedDate, "d 'de' MMMM yyyy", { locale: es });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl bg-slate-950 border-slate-800 text-white p-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-600/20">
              <Video className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Demo en Vivo — LeadMaster</h2>
              <p className="text-sm text-slate-400">
                30 minutos · Cita · Sin compromiso
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500 mt-2">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> 30 min
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Zona horaria: Madrid (CET)
            </span>
          </div>
        </div>

        {/* Steps */}
        <div className="px-6 pb-6 pt-4 min-h-[360px]">
          {/* STEP 1 — Calendar */}
          {step === 1 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="font-medium text-sm">
                  {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </span>
                <button
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500 mb-2">
                {DAY_HEADERS.map((d) => (
                  <span key={d} className="py-1">{d}</span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-sm">
                {calendarDays.map((day, i) => {
                  if (!day) return <span key={`blank-${i}`} />;
                  const unavailable = isUnavailable(day);
                  const isSelected =
                    selectedDate?.toDateString() === day.toDateString();
                  return (
                    <button
                      key={day.toISOString()}
                      disabled={unavailable}
                      onClick={() => {
                        setSelectedDate(day);
                        setStep(2);
                      }}
                      className={`py-2 rounded-md transition-colors ${
                        unavailable
                          ? "text-slate-700 cursor-not-allowed"
                          : isSelected
                          ? "bg-blue-600 text-white"
                          : "text-slate-300 hover:bg-blue-600/20 hover:text-white"
                      }`}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>

              <p className="text-xs text-slate-600 mt-4 text-center">
                Los días en gris no tienen disponibilidad.
              </p>
            </div>
          )}

          {/* STEP 2 — Time slots */}
          {step === 2 && (
            <div>
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 mb-4 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Volver al calendario
              </button>

              <h3 className="font-semibold mb-1 capitalize">
                {formatSelectedDate()}
              </h3>
              <p className="text-sm text-slate-400 mb-4">
                Elige un horario disponible
              </p>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {TIME_SLOTS.map((slot) => {
                  const isActive = selectedTime === slot;
                  return (
                    <button
                      key={slot}
                      onClick={() => {
                        setSelectedTime(slot);
                        setStep(3);
                      }}
                      className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                        isActive
                          ? "bg-blue-600 text-white border-blue-600"
                          : "border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-600 hover:text-white hover:border-blue-600"
                      }`}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 3 — Form */}
          {step === 3 && (
            <div>
              <button
                onClick={() => setStep(2)}
                className="text-sm text-blue-400 hover:text-blue-300 mb-4 transition-colors"
              >
                Cambiar horario
              </button>

              <p className="text-sm text-slate-400 mb-5">
                <span className="capitalize">{formatSelectedDate()}</span> a las{" "}
                <span className="text-white font-medium">{selectedTime}</span>
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (formData.name && formData.email) setStep(4);
                }}
                className="space-y-4"
              >
                <div>
                  <label className="text-sm text-slate-300 mb-1.5 block">
                    Nombre completo <span className="text-red-400">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Tu nombre"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, name: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 text-white px-3 py-2.5 text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="text-sm text-slate-300 mb-1.5 block">
                    Email de trabajo <span className="text-red-400">*</span>
                  </label>
                  <input
                    required
                    type="email"
                    placeholder="tu@empresa.com"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, email: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 text-white px-3 py-2.5 text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="text-sm text-slate-300 mb-1.5 block">
                    Empresa
                  </label>
                  <input
                    type="text"
                    placeholder="Nombre de tu empresa"
                    value={formData.company}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, company: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 text-white px-3 py-2.5 text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition-colors"
                >
                  Confirmar Reserva
                </button>
              </form>
            </div>
          )}

          {/* STEP 4 — Confirmation */}
          {step === 4 && (
            <div className="flex flex-col items-center text-center py-4">
              <CheckCircle2 className="w-14 h-14 text-green-500 mb-4" />
              <h3 className="text-xl font-semibold mb-2">
                ¡Reserva confirmada!
              </h3>
              <p className="text-slate-400 text-sm mb-2 capitalize">
                {formatSelectedDate()} a las {selectedTime}
              </p>
              <p className="text-slate-400 text-sm mb-4 max-w-sm">
                Recibirás un email de confirmación en{" "}
                <span className="text-white font-medium">{formData.email}</span>{" "}
                con el enlace de cita.
              </p>
              <p className="text-slate-500 text-xs mb-6 max-w-sm">
                Prepárate para ver en vivo cómo LeadMaster puede transformar la
                visibilidad de tu proceso comercial.
              </p>
              <button
                onClick={() => handleOpenChange(false)}
                className="px-6 py-2.5 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 transition-colors"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
