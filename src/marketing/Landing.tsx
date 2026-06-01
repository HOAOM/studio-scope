import { useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform, MotionValue } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import Scene3D from "./Scene3D";
import { MARKETING_TIERS } from "./tiers";

/* ── Reusable pinned chapter ─────────────────────────────── */
function Chapter({
  children,
  height = "260vh",
  id,
}: {
  children: (p: MotionValue<number>) => React.ReactNode;
  height?: string;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  return (
    <section ref={ref} id={id} style={{ height }} className="relative">
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        {children(scrollYProgress)}
      </div>
    </section>
  );
}

const ease = [0.16, 1, 0.3, 1] as const;

export default function Landing() {
  const isMobile = useIsMobile();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: heroScroll } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  return (
    <div className="marketing min-h-screen w-full overflow-x-hidden">
      <div className="m-grain" />

      {/* Fixed nav */}
      <header className="fixed top-0 inset-x-0 z-50">
        <div className="mx-auto max-w-7xl px-6 md:px-10 h-20 flex items-center justify-between">
          <span className="m-display text-2xl tracking-tight">Studio<span style={{ color: "hsl(var(--m-accent))" }}>Scope</span></span>
          <nav className="hidden md:flex items-center gap-10 text-sm" style={{ color: "hsl(var(--m-ink-dim))" }}>
            <a href="#workflow" className="hover:opacity-70 transition-opacity">Metodo</a>
            <a href="#tiers" className="hover:opacity-70 transition-opacity">Piani</a>
            <Link to="/auth" className="hover:opacity-70 transition-opacity">Accedi</Link>
          </nav>
          <Link to="/onboarding" className="m-btn m-btn-primary px-5 py-2.5 text-sm rounded-full">
            Inizia ora
          </Link>
        </div>
      </header>

      {/* ── CH.1 — HERO ─────────────────────────────── */}
      <div ref={heroRef} className="relative h-screen w-full">
        <div className="absolute inset-0 z-0">
          {isMobile ? (
            <div
              className="h-full w-full"
              style={{ background: "radial-gradient(circle at 50% 40%, hsl(38 60% 30% / 0.5), transparent 60%)" }}
            />
          ) : (
            <Scene3D scroll={heroScroll} />
          )}
        </div>
        <motion.div
          style={{ opacity: useTransform(heroScroll, [0, 0.7], [1, 0]), y: useTransform(heroScroll, [0, 1], [0, -120]) }}
          className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6"
        >
          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 1, ease }} className="m-kicker mb-8">
            Il sistema operativo degli studi di interior design
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 1.1, ease }} className="m-display text-[14vw] md:text-[8.5vw] max-w-6xl">
            Ogni dettaglio,<br />sotto controllo.
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9, duration: 1, ease }} className="m-body mt-8 max-w-xl text-lg">
            Dalla distinta alla consegna in cantiere. Un'unica regia per progetti che non lasciano nulla al caso.
          </motion.p>
        </motion.div>
        <motion.div
          style={{ opacity: useTransform(heroScroll, [0, 0.3], [1, 0]) }}
          className="absolute bottom-10 inset-x-0 z-10 flex justify-center"
        >
          <span className="m-kicker" style={{ color: "hsl(var(--m-ink-faint))" }}>Scorri</span>
        </motion.div>
      </div>

      {/* ── CH.2 — THE PROBLEM ─────────────────────────────── */}
      <Chapter height="300vh">
        {(p) => {
          const lines = [
            "Fogli di calcolo che si moltiplicano.",
            "Email che seppelliscono le decisioni.",
            "Margini che si scoprono troppo tardi.",
          ];
          return (
            <div className="h-full flex flex-col items-center justify-center px-6 max-w-4xl mx-auto">
              <motion.p style={{ opacity: useTransform(p, [0, 0.1, 0.85, 1], [0, 1, 1, 0]) }} className="m-kicker mb-12">Il caos invisibile</motion.p>
              {lines.map((l, i) => {
                const start = 0.12 + i * 0.22;
                return (
                  <motion.h2
                    key={i}
                    style={{
                      opacity: useTransform(p, [start, start + 0.08, start + 0.18, start + 0.26], [0.15, 1, 1, 0.15]),
                    }}
                    className="m-display text-4xl md:text-6xl text-center my-4"
                  >
                    {l}
                  </motion.h2>
                );
              })}
            </div>
          );
        }}
      </Chapter>

      {/* ── CH.3 — WORKFLOW (horizontal) ─────────────────────────────── */}
      <Chapter height="420vh" id="workflow">
        {(p) => {
          const phases = [
            ["01", "Planning", "Struttura, team e milestone in un colpo d'occhio."],
            ["02", "Design", "Opzioni A/B/C/D, approvazioni e firma del cliente."],
            ["03", "Procurement", "Preventivi a confronto, margini e ordini."],
            ["04", "Production", "Tempi di produzione e proforma sotto traccia."],
            ["05", "Installation", "Cantiere, consegne e installazioni in tempo reale."],
            ["06", "Closing", "Chiusura, audit e revisioni storicizzate."],
          ];
          const x = useTransform(p, [0.05, 0.95], ["2vw", "-86vw"]);
          return (
            <div className="h-full flex flex-col justify-center overflow-hidden">
              <div className="px-6 md:px-10 mb-12 max-w-7xl mx-auto w-full">
                <p className="m-kicker mb-4">Un metodo, sei fasi</p>
                <h2 className="m-display text-4xl md:text-6xl">Il ciclo di vita di ogni elemento.</h2>
              </div>
              <motion.div style={{ x }} className="flex gap-6 md:gap-10 pl-6 md:pl-10">
                {phases.map(([n, t, d]) => (
                  <div key={n} className="m-card shrink-0 w-[78vw] md:w-[34vw] h-[42vh] rounded-2xl p-8 md:p-10 flex flex-col justify-between">
                    <span className="m-display text-7xl" style={{ color: "hsl(var(--m-accent))" }}>{n}</span>
                    <div>
                      <h3 className="m-display text-3xl md:text-4xl mb-3">{t}</h3>
                      <p className="m-body">{d}</p>
                    </div>
                  </div>
                ))}
              </motion.div>
            </div>
          );
        }}
      </Chapter>

      {/* ── CH.4 — BOQ / GANTT IN ACTION ─────────────────────────────── */}
      <Chapter height="280vh">
        {(p) => (
          <div className="h-full flex items-center justify-center px-6">
            <motion.div
              style={{
                scale: useTransform(p, [0, 0.5], [0.85, 1]),
                opacity: useTransform(p, [0, 0.25, 0.85, 1], [0, 1, 1, 0]),
              }}
              className="max-w-5xl w-full"
            >
              <p className="m-kicker mb-6 text-center">Dati, non sensazioni</p>
              <h2 className="m-display text-4xl md:text-6xl text-center mb-12">BOQ e Gantt, finalmente vivi.</h2>
              <div className="m-card rounded-2xl p-2 md:p-3">
                <div className="rounded-xl overflow-hidden" style={{ background: "hsl(var(--m-bg))" }}>
                  <div className="grid grid-cols-12 gap-px text-xs" style={{ background: "hsl(var(--m-line))" }}>
                    {Array.from({ length: 48 }).map((_, i) => (
                      <div key={i} className="py-3 px-2" style={{ background: "hsl(var(--m-bg-soft))", color: "hsl(var(--m-ink-faint))" }}>
                        {i % 6 === 0 ? "▮" : ""}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </Chapter>

      {/* ── CH.5 — MARGINS / COST CONTROL ─────────────────────────────── */}
      <Chapter height="260vh">
        {(p) => (
          <div className="h-full flex items-center justify-center px-6 max-w-4xl mx-auto text-center">
            <div>
              <motion.p style={{ opacity: useTransform(p, [0.05, 0.2], [0, 1]) }} className="m-kicker mb-8">Il margine non è un'opinione</motion.p>
              <motion.h2 style={{ opacity: useTransform(p, [0.1, 0.3], [0, 1]), y: useTransform(p, [0.1, 0.3], [40, 0]) }} className="m-display text-5xl md:text-7xl">
                Prezzo di vendita = <span style={{ color: "hsl(var(--m-accent))" }}>(Costo + Landed) × (1 + Margine)</span>
              </motion.h2>
              <motion.p style={{ opacity: useTransform(p, [0.3, 0.5], [0, 1]) }} className="m-body mt-8 text-lg">
                Calcolato in automatico, nascosto a chi non deve vederlo. Designer e clienti non vedono mai i costi.
              </motion.p>
            </div>
          </div>
        )}
      </Chapter>

      {/* ── CH.6 — TIERS (horizontal) ─────────────────────────────── */}
      <Chapter height="360vh" id="tiers">
        {(p) => {
          const x = useTransform(p, [0.1, 0.9], ["8vw", "-58vw"]);
          return (
            <div className="h-full flex flex-col justify-center overflow-hidden">
              <div className="px-6 md:px-10 mb-12 max-w-7xl mx-auto w-full text-center">
                <p className="m-kicker mb-4">Scegli la tua scala</p>
                <h2 className="m-display text-4xl md:text-6xl">Tre piani. Nessun compromesso.</h2>
              </div>
              <motion.div style={{ x }} className="flex gap-6 md:gap-8 pl-6 md:pl-10 items-stretch">
                {MARKETING_TIERS.map((t) => (
                  <div
                    key={t.id}
                    className="m-card shrink-0 w-[80vw] md:w-[30vw] rounded-2xl p-8 md:p-10 flex flex-col"
                    style={t.highlight ? { borderColor: "hsl(var(--m-accent))" } : undefined}
                  >
                    {t.highlight && <span className="m-kicker mb-4">Più scelto</span>}
                    <h3 className="m-display text-4xl mb-2">{t.name}</h3>
                    <p className="m-body mb-6">{t.tagline}</p>
                    <div className="flex items-baseline gap-2 mb-8">
                      <span className="m-display text-5xl" style={{ color: "hsl(var(--m-ink))" }}>{t.price}</span>
                      <span className="m-body">{t.cadence}</span>
                    </div>
                    <ul className="space-y-3 mb-8 flex-1">
                      {t.features.map((f) => (
                        <li key={f} className="m-body flex items-center gap-3 text-sm">
                          <span style={{ color: "hsl(var(--m-accent))" }}>—</span> {f}
                        </li>
                      ))}
                    </ul>
                    <Link to={`/onboarding?tier=${t.id}`} className={`m-btn ${t.highlight ? "m-btn-primary" : "m-btn-ghost"} text-center py-3 rounded-full`}>
                      Scegli {t.name}
                    </Link>
                  </div>
                ))}
              </motion.div>
            </div>
          );
        }}
      </Chapter>

      {/* ── CH.7 — CTA ─────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center px-6 text-center">
        <div className="max-w-3xl">
          <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 1 }} className="m-kicker mb-8">
            Il tuo spazio, pronto in pochi minuti
          </motion.p>
          <motion.h2 initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 1, ease }} className="m-display text-6xl md:text-8xl mb-10">
            Inizia oggi.
          </motion.h2>
          <Link to="/onboarding" className="m-btn m-btn-primary inline-block px-10 py-4 rounded-full text-lg">
            Crea il tuo spazio
          </Link>
          <div className="m-rule my-16" />
          <p className="m-body text-sm" style={{ color: "hsl(var(--m-ink-faint))" }}>
            StudioScope — Ogni cliente, il proprio spazio isolato. © {new Date().getFullYear()}
          </p>
        </div>
      </section>
    </div>
  );
}
