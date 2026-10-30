'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ShieldCheck, CheckCircle2, MessageSquare, HelpCircle, ClipboardList, Code2, BookOpen, ChevronDown, X } from 'lucide-react'
import styles from './landing-showcase.module.css'

const comparison = [
  {
    id: 'without', label: 'Sin PyDefense', title: 'Antes de practicar...', icon: AlertTriangle,
    items: [
      { id: 'silence', title: 'Una pregunta te sorprende', description: 'Cuesta explicar una línea.', icon: MessageSquare,
        example: <><p><span className="font-semibold text-slate-200">Profesor:</span> “¿Por qué verificaste que la lista estuviera vacía antes de dividir?”</p><p className="mt-3"><span className="font-semibold text-slate-200">Respuesta:</span> “...no estoy seguro.”</p></> },
      { id: 'confidence', title: 'Quieres explicar tus decisiones', description: 'Tu código funciona; quieres explicar por qué.', icon: HelpCircle,
        example: <p>“Sé que el código funciona, pero no sabría explicar por qué tomé esta decisión.”</p> },
      { id: 'preparation', title: 'Aún no has ensayado', description: 'Falta practicar tu explicación.', icon: ClipboardList,
        example: <p>“El programa corre correctamente, pero nunca practiqué cómo defender mis decisiones.”</p> },
    ],
  },
  {
    id: 'with', label: 'Con PyDefense', title: 'Con PyDefense...', icon: CheckCircle2,
    items: [
      { id: 'questions', title: 'Practicas posibles preguntas', description: 'Ensaya una sustentación simulada.', icon: HelpCircle,
        example: <p><span className="font-semibold text-slate-200">Pregunta:</span> “¿Qué ocurriría si intentaras calcular el promedio de una lista vacía?”</p> },
      { id: 'review', title: 'Revisas tu propia entrega', description: 'Explica el propósito de cada decisión.', icon: Code2,
        example: <p>“Uso esta validación para evitar una división entre cero.”</p> },
      { id: 'gaps', title: 'Detectas tus dudas', description: 'Identifica qué necesitas repasar antes de presentar.', icon: BookOpen,
        example: <p>“Debo repasar manejo de listas antes de sustentar.”</p> },
    ],
  },
]

function PreparationBridge() {
  return (
    <div className={styles.bridge} role="img" aria-label="Antes, PyDefense, después">
      <span className={styles.bridgeEndpoint}>Antes</span>
      <span className={styles.bridgeLine} />
      <span className={styles.bridgeCore}><span className={styles.bridgeShield}><ShieldCheck aria-hidden="true" className="h-12 w-12" strokeWidth={1.4} /></span></span>
      <span className="text-sm font-semibold text-blue-300 tracking-wide">PyDefense</span>
      <span className={styles.bridgeLine} />
      <span className={styles.bridgeEndpoint}>Después</span>
    </div>
  )
}

export function InteractiveComparison() {
  const [openId, setOpenId] = useState(null)
  const triggers = useRef({})

  function closeExample() {
    triggers.current[openId]?.focus()
    setOpenId(null)
  }

  return (
    <div className={styles.comparison} onKeyDown={event => {
      if (event.key === 'Escape' && openId) {
        event.preventDefault()
        closeExample()
      }
    }}>
      {comparison.map(({ id, label, title, icon: Icon, items }, column) => (
        <div key={id} className="contents">
          {column === 1 && <PreparationBridge />}
          <article className={`${styles.compareCard} ${column === 0 ? styles.negative : styles.positive}`} aria-labelledby={`comparison-${id}`}>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
              <span className={styles.statusDot} /><span className="text-slate-300">{column === 0 ? 'Antes' : 'Después'}</span><span className="text-slate-600">/</span>{label}
            </div>
            <h2 id={`comparison-${id}`} className="text-xl font-bold flex items-start gap-3 mb-6">
              <Icon aria-hidden="true" className={`${styles.headingIcon} w-6 h-6 shrink-0`} />{title}
            </h2>
            <ul className="space-y-3">
              {items.map(({ id: itemId, title: itemTitle, description, icon: ItemIcon, example }) => {
                const isOpen = openId === itemId
                return (
                  <li key={itemId}>
                    <button ref={element => { triggers.current[itemId] = element }} id={`comparison-trigger-${itemId}`} type="button" aria-label={itemTitle} aria-expanded={isOpen} aria-controls={`comparison-example-${itemId}`} onClick={() => setOpenId(isOpen ? null : itemId)} className={styles.comparePoint}>
                      <span className={styles.pointIcon}><ItemIcon aria-hidden="true" className="w-6 h-6" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-100">{itemTitle}</span>
                        <span className="block text-sm text-slate-400 mt-1 leading-relaxed">{description}</span>
                        <span className="block text-xs mt-2 font-medium">{isOpen ? 'Ocultar ejemplo' : 'Ver ejemplo'}</span>
                      </span>
                      <ChevronDown aria-hidden="true" className={`${styles.pointChevron} w-4 h-4 shrink-0 mt-1 ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <div id={`comparison-example-${itemId}`} role="region" aria-labelledby={`comparison-trigger-${itemId}`} hidden={!isOpen} className={styles.examplePanel}>
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <span className="text-xs uppercase tracking-wider text-slate-400">Ejemplo de sustentación</span>
                        <button type="button" aria-label={`Cerrar ejemplo: ${itemTitle}`} onClick={closeExample} className={styles.closeExample}><X aria-hidden="true" className="w-4 h-4" /></button>
                      </div>
                      <div className="text-sm text-slate-300 leading-relaxed">{example}</div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </article>
        </div>
      ))}
    </div>
  )
}

export function HeroVisual() {
  const artRef = useRef(null)

  function resetTilt() {
    artRef.current.style.removeProperty('--tilt-x')
    artRef.current.style.removeProperty('--tilt-y')
  }

  function tiltShield(event) {
    if (!window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches) return
    const bounds = event.currentTarget.getBoundingClientRect()
    artRef.current.style.setProperty('--tilt-x', `${((event.clientY - bounds.top) / bounds.height - 0.5) * -8}deg`)
    artRef.current.style.setProperty('--tilt-y', `${((event.clientX - bounds.left) / bounds.width - 0.5) * 8}deg`)
  }

  return (
    <div className={styles.heroVisual}>
      <div ref={artRef} className={styles.heroArt} onPointerMove={tiltShield} onPointerLeave={resetTilt} aria-hidden="true">
        <div className={styles.artGrid} />
        <div className={styles.artHalo} />
        <span className={`${styles.symbol} ${styles.symbolCode}`}>{'</>'}</span>
        <span className={`${styles.symbol} ${styles.symbolBraces}`}>{'{ }'}</span>
        <span className={`${styles.symbol} ${styles.symbolQuestion}`}>?</span>
        <span className={`${styles.symbol} ${styles.symbolCheck}`}>✓</span>
        <div className={styles.shieldFloat}>
          <div className={styles.shieldTilt}>
            <div className={`${styles.shieldLayer} ${styles.shieldBack}`} />
            <div className={`${styles.shieldLayer} ${styles.shieldMid}`} />
            <div className={`${styles.shieldLayer} ${styles.shieldRim}`} />
            <div className={`${styles.shieldLayer} ${styles.shieldEdge}`} />
            <div className={`${styles.shieldLayer} ${styles.shieldFace}`}>
              <span className={`${styles.shieldLayer} ${styles.shieldInset}`} />
              <ShieldCheck strokeWidth={1.25} className="w-20 h-20 text-blue-300" />
              <span className="text-base font-bold tracking-wider text-slate-100">PyDefense</span>
            </div>
          </div>
        </div>
        <div className={styles.shieldShadow} />
      </div>
      <TerminalPreview />
    </div>
  )
}

function TerminalPreview() {
  const terminalRef = useRef(null)

  useEffect(() => {
    const terminal = terminalRef.current
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (preference.matches || !('IntersectionObserver' in window)) return
    terminal.dataset.playing = 'pending'
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        terminal.dataset.playing = 'true'
        observer.disconnect()
      }
    }, { threshold: 0.2 })
    observer.observe(terminal)
    const showImmediately = () => {
      if (preference.matches) {
        terminal.dataset.playing = 'complete'
        observer.disconnect()
      }
    }
    preference.addEventListener('change', showImmediately)
    return () => {
      observer.disconnect()
      preference.removeEventListener('change', showImmediately)
      delete terminal.dataset.playing
    }
  }, [])

  return (
      <figure ref={terminalRef} className={styles.terminal} aria-label="Ejemplo de una práctica en la web">
        <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
          <span className="flex gap-1.5" aria-hidden="true"><span className="h-2 w-2 rounded-full bg-slate-600" /><span className="h-2 w-2 rounded-full bg-slate-600" /><span className="h-2 w-2 rounded-full bg-blue-500/60" /></span>
          <span className="text-xs text-slate-400">Así avanza una práctica (ejemplo)</span>
        </figcaption>
        <div className="text-xs sm:text-sm leading-relaxed p-4 sm:p-5 space-y-3 break-words">
          <p className={`${styles.terminalLine} text-slate-200`} style={{ '--line-delay': '0ms' }}>1. Pegas tu código y eliges los temas que has visto.</p>
          <p className={`${styles.terminalLine} text-slate-400`} style={{ '--line-delay': '500ms' }}>2. Indicas qué tan seguro te sientes con esa parte.</p>
          <p className={`${styles.terminalLine} text-blue-300`} style={{ '--line-delay': '1100ms' }}>3. Pregunta: ¿qué representa el resultado de tu función?</p>
          <p className={`${styles.terminalLine} text-green-300`} style={{ '--line-delay': '1700ms' }}>4. Lo que explicaste, lo que falta y un siguiente paso.</p>
          <p className={`${styles.terminalLine} text-slate-300`} style={{ '--line-delay': '2300ms' }}>5. Sigues o cierras. Hasta tres preguntas.</p>
        </div>
      </figure>
  )
}
