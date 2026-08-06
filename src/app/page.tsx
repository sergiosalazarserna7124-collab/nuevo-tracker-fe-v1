"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Play,
  Video,
  Phone,
  MessageSquare,
  Brain,
  BarChart3,
  Zap,
  Shield,
  Globe,
  Server,
  Clock,
  Star,
  CheckCircle2,
} from "lucide-react";
import DemoModal from "@/components/landing/DemoModal";

const LOGO_URL =
  "https://i.postimg.cc/pXJdGQmv/Gemini-Generated-Image-4vedz84vedz84ved.png";

const NAV_LINKS = [
  { label: "Funcionalidades", href: "#features" },
  { label: "Cómo funciona", href: "#como-funciona" },
  { label: "Integraciones", href: "/integraciones" },
  { label: "Casos de éxito", href: "#testimonios" },
];

const STATS = [
  { value: "+340%", label: "Visibilidad del proceso de ventas" },
  { value: "2.8x", label: "Más cierres con IA" },
  { value: "-67%", label: "Tiempo en reportes manuales" },
  { value: "100%", label: "Conversaciones analizadas" },
];

const FEATURES = [
  {
    icon: Video,
    title: "Citas analizadas con IA",
    description:
      "Cada cita de ventas es transcrita, analizada y puntuada automáticamente. Detecta objeciones, sentimiento y oportunidades de mejora.",
    color: "blue",
    gradient: "from-blue-500/20",
    iconBg: "text-blue-400",
    borderColor: "border-blue-500/20",
  },
  {
    icon: Phone,
    title: "Llamadas telefónicas medidas",
    description:
      "Registra y analiza cada llamada de tu equipo. Métricas de duración, tasa de conversión y calidad de la conversación.",
    color: "violet",
    gradient: "from-violet-500/20",
    iconBg: "text-violet-400",
    borderColor: "border-violet-500/20",
  },
  {
    icon: MessageSquare,
    title: "Chats y conversaciones en un solo lugar",
    description:
      "WhatsApp, email, chat web — todo centralizado. Nunca más pierdas contexto entre canales de comunicación.",
    color: "cyan",
    gradient: "from-cyan-500/20",
    iconBg: "text-cyan-400",
    borderColor: "border-cyan-500/20",
  },
  {
    icon: Brain,
    title: "IA aplicada",
    description:
      "Modelos entrenados específicamente para ventas B2B. Identifica patrones ganadores y replica lo que funciona en todo tu equipo.",
    color: "emerald",
    gradient: "from-emerald-500/20",
    iconBg: "text-emerald-400",
    borderColor: "border-emerald-500/20",
  },
  {
    icon: BarChart3,
    title: "Métricas en tiempo real",
    description:
      "Dashboards actualizados al segundo. Pipeline, actividad del equipo, tasas de conversión y predicciones de cierre.",
    color: "amber",
    gradient: "from-amber-500/20",
    iconBg: "text-amber-400",
    borderColor: "border-amber-500/20",
  },
  {
    icon: Zap,
    title: "Automatizaciones",
    description:
      "Flujos automáticos que se disparan según eventos. Follow-ups, alertas de deals en riesgo y asignación inteligente de leads.",
    color: "pink",
    gradient: "from-pink-500/20",
    iconBg: "text-pink-400",
    borderColor: "border-pink-500/20",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Conectas tu stack comercial",
    description:
      "Integra tu CRM, herramientas de citas, teléfono y canales de chat en menos de 10 minutos. Sin código, sin fricción.",
  },
  {
    number: "02",
    title: "La IA procesa cada interacción",
    description:
      "Cada conversación es transcrita, categorizada y analizada automáticamente. La IA detecta patrones, objeciones y oportunidades.",
  },
  {
    number: "03",
    title: "Tomas decisiones con datos reales",
    description:
      "Dashboards en tiempo real con las métricas que importan. Sabes exactamente qué funciona, qué no, y dónde actuar.",
  },
];

const TESTIMONIALS = [
  {
    name: "Carlos Mendoza",
    role: "VP de Ventas, TechCorp",
    initials: "CM",
    quote:
      "Antes solo veíamos los números finales. Ahora entendemos exactamente por qué se cierran o se pierden los deals. LeadMaster cambió completamente nuestra forma de gestionar el equipo.",
  },
  {
    name: "Laura Fernández",
    role: "Head of Revenue, ScaleUp",
    initials: "LF",
    quote:
      "En 3 meses duplicamos nuestra tasa de cierre. La IA nos mostró que nuestros mejores vendedores hacían algo que el resto no — ahora todos lo hacen.",
  },
  {
    name: "Andrés Vargas",
    role: "CEO, DataSales",
    initials: "AV",
    quote:
      "El ROI fue inmediato. Dejamos de perder horas en reportes manuales y ahora el equipo se enfoca en vender. La visibilidad que da LeadMaster no tiene comparación.",
  },
];

const TRUST_BADGES = [
  { icon: Shield, label: "Datos 100% seguros" },
  { icon: Globe, label: "GDPR Compliant" },
  { icon: Server, label: "Multi-tenant by design" },
  { icon: Clock, label: "Uptime 99.9%" },
];

const DASHBOARD_CARDS = [
  { label: "Citas hoy", value: "24", change: "+12%", positive: true },
  { label: "Cerradas", value: "9", change: "+33%", positive: true },
  {
    label: "Cash collected",
    value: "€18.400",
    change: "+21%",
    positive: true,
  },
  { label: "No shows", value: "3", change: "-40%", positive: true },
];

const NOTIFICATIONS = [
  {
    text: "Nuevo deal cerrado por María — €4.200",
    time: "hace 2 min",
    dot: "bg-emerald-400",
  },
  {
    text: "Cita analizada: score 92/100",
    time: "hace 8 min",
    dot: "bg-blue-400",
  },
  {
    text: "Alerta: 3 deals sin follow-up hace +48h",
    time: "hace 15 min",
    dot: "bg-amber-400",
  },
];

export default function LandingPage() {
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-white font-[Inter,sans-serif]">
      {/* ───────── HEADER ───────── */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white p-0.5">
              <Image
                src={LOGO_URL}
                alt="LeadMaster"
                width={40}
                height={40}
                className="scale-110 object-contain"
              />
            </span>
            <span className="text-lg font-bold">LeadMaster</span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm text-slate-400 transition-colors hover:text-white"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setDemoOpen(true)}
              className="hidden text-sm text-slate-400 transition-colors hover:text-white sm:inline-block"
            >
              Solicitar demo
            </button>
            <Link
              href="/login"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition-colors hover:bg-blue-500"
            >
              Iniciar Sesión
            </Link>
          </div>
        </div>
      </header>

      {/* ───────── HERO ───────── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="h-[600px] w-[600px] rounded-full bg-blue-600/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6 pb-20 pt-24 text-center md:pt-32">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-sm text-blue-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-400" />
            </span>
            La plataforma que mide todo lo que pasa en tu equipo de ventas
          </div>

          <h1 className="mx-auto max-w-4xl text-5xl font-black leading-[1.1] md:text-7xl">
            Conoce exactamente
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent">
              por qué pierdes deals
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400 md:text-xl">
            LeadMaster centraliza cada cita, llamada telefónica y chat de
            tu equipo comercial. La IA analiza cada conversación y te dice dónde
            se están cayendo las ventas — en tiempo real.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button
              onClick={() => setDemoOpen(true)}
              className="group inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-medium transition-all hover:bg-blue-500 hover:shadow-[0_0_40px_rgba(59,130,246,0.4)]"
            >
              Quiero conocer más
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-6 py-3 font-medium transition-colors hover:bg-white/10"
            >
              Iniciar Sesión
            </Link>
          </div>

          <p className="mt-6 text-sm text-slate-600">
            Sin tarjeta de crédito · Demo en 30 minutos · Setup en un día
          </p>

          {/* Dashboard mockup */}
          <div className="mx-auto mt-16 max-w-4xl rounded-2xl border border-white/10 bg-slate-900/80 p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex gap-1.5">
                <span className="h-3 w-3 rounded-full bg-red-500" />
                <span className="h-3 w-3 rounded-full bg-yellow-500" />
                <span className="h-3 w-3 rounded-full bg-green-500" />
              </div>
              <div className="flex-1 rounded-lg bg-slate-800 px-4 py-1.5 text-xs text-slate-500">
                app.leadmaster.com.co/dashboard
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {DASHBOARD_CARDS.map((c) => (
                <div
                  key={c.label}
                  className="rounded-xl border border-white/10 bg-slate-800/60 p-4 text-left"
                >
                  <p className="text-xs text-slate-500">{c.label}</p>
                  <p className="mt-1 text-2xl font-bold">{c.value}</p>
                  <p className="mt-1 text-xs text-emerald-400">{c.change}</p>
                </div>
              ))}
            </div>

            <div className="relative mt-4 space-y-2">
              {NOTIFICATIONS.map((n, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg border border-white/5 bg-slate-800/40 px-4 py-2.5 text-sm"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${n.dot}`} />
                  <span className="flex-1 text-left text-slate-300">
                    {n.text}
                  </span>
                  <span className="text-xs text-slate-600">{n.time}</span>
                </div>
              ))}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-900/80 to-transparent" />
            </div>
          </div>
        </div>
      </section>

      {/* ───────── STATS ───────── */}
      <section className="border-y border-white/10 bg-slate-900/40 py-14">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-6 md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.value} className="text-center">
              <p className="text-4xl font-black text-blue-400">{s.value}</p>
              <p className="mt-2 text-sm text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ───────── PAIN POINT ───────── */}
      <section className="py-24">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="text-3xl font-black leading-tight md:text-5xl">
            ¿Tu equipo vende, pero no sabes{" "}
            <span className="text-slate-500">exactamente por qué</span> algunos
            cierran y otros no?
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
            La mayoría de equipos comerciales operan a ciegas. Ven los
            resultados, pero no entienden el proceso. LeadMaster ilumina cada paso
            del ciclo de ventas para que sepas exactamente dónde intervenir.
          </p>
        </div>
      </section>

      {/* ───────── FEATURES ───────── */}
      <section id="features" className="pb-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-sm text-violet-400">
              Funcionalidades
            </span>
            <h2 className="mt-6 text-3xl font-black md:text-5xl">
              Todo tu proceso comercial,
              <br />
              <span className="text-slate-400">medido y analizado</span>
            </h2>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className={`rounded-2xl border ${f.borderColor} bg-gradient-to-br ${f.gradient} to-transparent p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl`}
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900/60">
                  <f.icon className={`h-6 w-6 ${f.iconBg}`} />
                </div>
                <h3 className="text-lg font-bold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── HOW IT WORKS ───────── */}
      <section id="como-funciona" className="bg-slate-900/40 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-1.5 text-sm text-cyan-400">
              Cómo funciona
            </span>
            <h2 className="mt-6 text-3xl font-black md:text-5xl">
              En funcionamiento
              <br />
              <span className="text-slate-400">en menos de un día</span>
            </h2>
          </div>

          <div className="mt-16 grid items-start gap-8 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.number} className="relative flex flex-col items-center text-center">
                {i < STEPS.length - 1 && (
                  <div className="pointer-events-none absolute right-0 top-8 hidden translate-x-1/2 md:block">
                    <ArrowRight className="h-6 w-6 text-slate-700" />
                  </div>
                )}
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600/20">
                  <span className="text-2xl font-black text-blue-400">
                    {step.number}
                  </span>
                </div>
                <h3 className="text-lg font-bold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── TESTIMONIALS ───────── */}
      <section id="testimonios" className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-sm text-emerald-400">
              Casos de éxito
            </span>
            <h2 className="mt-6 text-3xl font-black md:text-5xl">
              Equipos que ya
              <br />
              <span className="text-slate-400">venden diferente</span>
            </h2>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.name}
                className="rounded-2xl border border-white/10 bg-slate-900/60 p-6"
              >
                <div className="mb-4 flex gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className="h-4 w-4 fill-amber-400 text-amber-400"
                    />
                  ))}
                </div>
                <p className="text-sm leading-relaxed text-slate-300">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700 text-sm font-bold">
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── TRUST BADGES ───────── */}
      <section className="border-y border-white/10 bg-slate-900/30 py-12">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-10 px-6">
          {TRUST_BADGES.map((b) => (
            <div
              key={b.label}
              className="flex items-center gap-2 text-sm text-slate-400"
            >
              <b.icon className="h-5 w-5" />
              {b.label}
            </div>
          ))}
        </div>
      </section>

      {/* ───────── CTA FINAL ───────── */}
      <section className="relative overflow-hidden py-24">
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="h-[500px] w-[500px] rounded-full bg-blue-600/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-black md:text-5xl">
            ¿Listo para ver
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-cyan-400 bg-clip-text text-transparent">
              todo lo que pasa?
            </span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg text-slate-400">
            Agenda una demo personalizada y descubre cómo LeadMaster puede
            transformar la gestión de tu equipo comercial.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button
              onClick={() => setDemoOpen(true)}
              className="group inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-medium transition-all hover:bg-blue-500 hover:shadow-[0_0_40px_rgba(59,130,246,0.4)]"
            >
              <Play className="h-4 w-4" />
              Quiero ver la demo
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-6 py-3 font-medium transition-colors hover:bg-white/10"
            >
              Ya tengo cuenta — Entrar
            </Link>
          </div>
        </div>
      </section>

      {/* ───────── FOOTER ───────── */}
      <footer className="border-t border-white/10 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 md:flex-row">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-white/70 p-0.5">
              <Image
                src={LOGO_URL}
                alt="LeadMaster"
                width={26}
                height={26}
                className="object-contain opacity-70"
              />
            </span>
            LeadMaster · Todos los derechos reservados{" "}
            {new Date().getFullYear()}
          </div>

          <div className="flex items-center gap-6 text-sm">
            <Link
              href="/login"
              className="text-slate-400 transition-colors hover:text-white"
            >
              Iniciar Sesión
            </Link>
            <button
              onClick={() => setDemoOpen(true)}
              className="text-slate-400 transition-colors hover:text-white"
            >
              Solicitar demo
            </button>
          </div>
        </div>
      </footer>

      {/* ───────── DEMO MODAL ───────── */}
      <DemoModal open={demoOpen} onOpenChange={setDemoOpen} />
    </div>
  );
}
