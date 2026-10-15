import Link from 'next/link'
import { ShieldCheck, Code2, HelpCircle, ArrowRight } from 'lucide-react'
import { HowItWorks, ExampleQuestion, MiniQuiz, Reveal } from './components/landing-interactions'
import { HeroVisual, InteractiveComparison } from './components/landing-showcase'
import ScrollToTop from './components/scroll-to-top'
import styles from './components/landing.module.css'

export default function LandingPage() {
  return (
    <main className="max-w-6xl mx-auto px-6 py-12 space-y-16 md:space-y-24">
      <ScrollToTop />
      <Reveal className={`${styles.heroScene} grid lg:grid-cols-[1.2fr_1fr] items-center gap-10 lg:gap-12 pt-8 pb-10`}>
        <div className="text-center lg:text-left space-y-6 min-w-0">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-950/80 border border-blue-800 text-blue-400 text-xs font-semibold uppercase tracking-wider">
            <ShieldCheck aria-hidden="true" className="w-4 h-4" /> Grupo 4 - IA para Programación
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight max-w-4xl mx-auto leading-tight">
            Practica con tu código Python y <span className="text-blue-500">prepara tu sustentación</span>.
          </h1>
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto">
            Practica con preguntas similares a las que podrían hacerte en una sustentación sobre código que desarrollaste con apoyo de IA. Detecta qué necesitas repasar y explica lo que entregas con más confianza.
          </p>
          <p className="text-sm text-slate-400">Este MVP usa preguntas de ejemplo para simular una sustentación.</p>
          <div className="pt-4 flex flex-col justify-center items-center lg:items-start gap-3">
            <Link href="/simulador" className={`${styles.primaryAction} group w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30`}>
              Simular mi código ahora <ArrowRight aria-hidden="true" className="w-5 h-5 shrink-0 motion-safe:group-hover:translate-x-1 motion-safe:transition-transform" />
            </Link>
            <p className="text-sm text-slate-400">Práctica rápida de sustentación</p>
          </div>
        </div>
        <HeroVisual />
      </Reveal>

      <Reveal><InteractiveComparison /></Reveal>

      <Reveal className="space-y-8">
        <div className="text-center space-y-3">
          <h2 className="text-3xl font-bold">Cómo funciona PyDefense</h2>
        </div>
        <HowItWorks />
      </Reveal>

      <Reveal className={styles.previewSection}>
        <div className="text-center space-y-3 mb-10">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest">Vista previa</p>
          <h2 className="text-3xl font-bold">Así se ve una práctica</h2>
        </div>
        <ProductPreview />
      </Reveal>

      <Reveal><MiniQuiz /></Reveal>
      <Reveal><ExampleQuestion /></Reveal>

      <footer className="border-t border-slate-800 pt-8 text-center text-xs text-slate-500">
        PyDefense · MVP académico · Grupo 4
      </footer>
    </main>
  )
}

function ProductPreview() {
  const code = [
    <><span className="text-blue-400">def</span> calcular_promedio(notas):</>,
    <>    <span className="text-blue-400">if not</span> notas:</>,
    <>        <span className="text-blue-400">return</span> <span className="text-green-300">0</span></>,
    <>    <span className="text-blue-400">return</span> sum(notas) / len(notas)</>,
  ]

  return (
    <figure className={styles.productPreview} aria-label="Vista ilustrativa de PyDefense">
      <figcaption className={styles.previewToolbar}>
        <span className="flex items-center gap-2 font-semibold text-sm"><ShieldCheck aria-hidden="true" className="w-4 h-4 text-blue-400" /> PyDefense</span>
        <span className="text-xs text-slate-400">Vista ilustrativa · preguntas de ejemplo</span>
      </figcaption>
      <div className={styles.previewWorkspace}>
        <div className={styles.editorPane}>
          <div className={styles.editorTab}><Code2 aria-hidden="true" className="w-4 h-4 text-blue-400" /> codigo.py <span className={styles.editorDot} aria-hidden="true" /></div>
          <pre className={styles.codeEditor}><code>{code.map((line, index) => (
            <span key={index} className={styles.codeLine}><span className={styles.lineNumber} aria-hidden="true">{index + 1}</span><span>{line}</span>{index < code.length - 1 && '\n'}</span>
          ))}</code></pre>
          <p className="text-xs text-slate-500 px-5 pb-5">Python · tu punto de partida</p>
        </div>
        <div className={styles.questionPane}>
          <p className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider"><HelpCircle aria-hidden="true" className="w-4 h-4" /> Pregunta de sustentación</p>
          <blockquote className="text-xl sm:text-2xl font-semibold leading-relaxed text-slate-100">¿Por qué verificas que la lista no esté vacía antes de dividir?</blockquote>
          <div className={styles.sampleAnswer}>
            <p className="text-xs font-semibold uppercase tracking-wider text-green-400 mb-2">Una respuesta de ejemplo</p>
            <p className="text-sm text-slate-300 leading-relaxed">Esta validación evita dividir entre cero cuando la lista está vacía.</p>
          </div>
        </div>
      </div>
    </figure>
  )
}
