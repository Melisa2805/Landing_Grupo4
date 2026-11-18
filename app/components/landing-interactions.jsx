'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Code2, HelpCircle, Lightbulb, ChevronDown, ArrowRight, X } from 'lucide-react'
import styles from './landing.module.css'

const steps = [
  {
    title: 'Pega tu código', icon: Code2,
    description: 'Selecciona el código que quieres practicar.',
    detail: 'Puedes usar un fragmento o un script de tu entrega.',
  },
  {
    title: 'Responde hasta tres preguntas', icon: HelpCircle,
    description: 'Antes de cada una indicas qué tan seguro te sientes.',
    detail: 'Explica con tus palabras. Puedes cerrar después de cada retroalimentación o decir que aún no has visto un tema.',
  },
  {
    title: 'Detecta qué debes repasar', icon: Lightbulb,
    description: 'Recibes lo que explicaste, lo que falta y un siguiente paso.',
    detail: 'No hay nota ni porcentaje. Si el tutor se equivoca, puedes pedir que lo revise.',
  },
]

export function HowItWorks() {
  const [expanded, setExpanded] = useState(null)

  return (
    <ol className={styles.stepsProcess}>
      {steps.map(({ title, icon: Icon, description, detail }, index) => {
        const isExpanded = expanded === index
        return (
          <li key={title} className={styles.processStep}>
            <span className={styles.processNode} data-active={isExpanded} aria-hidden="true">0{index + 1}</span>
            <article className={`${styles.interactiveCard} ${styles.processCard}`} data-expanded={isExpanded}>
              <h3>
                <button type="button" onClick={() => setExpanded(isExpanded ? null : index)} aria-expanded={isExpanded} aria-controls={`step-detail-${index}`} className={`${styles.focusable} group w-full rounded-lg text-left`}>
                  <span className="flex items-center justify-between mb-5">
                    <span className={styles.processIcon}><Icon aria-hidden="true" className="w-8 h-8" /></span>
                  </span>
                  <span className="block font-bold text-lg text-white">{title}</span>
                  <span className="block font-normal text-slate-400 text-sm mt-2">{description}</span>
                  <span className="flex items-center justify-between text-blue-400 text-sm mt-5">
                    {isExpanded ? 'Ver menos' : 'Explorar paso'}
                    <ChevronDown aria-hidden="true" className={`${styles.chevron} w-4 h-4 ${isExpanded ? 'rotate-180' : ''}`} />
                  </span>
                </button>
              </h3>
              <div id={`step-detail-${index}`} className={styles.expansion} data-expanded={isExpanded} aria-hidden={!isExpanded}>
                <div className="overflow-hidden"><p className="text-sm text-slate-300 pt-4 mt-4 border-t border-blue-900/60">{detail}</p></div>
              </div>
            </article>
          </li>
        )
      })}
    </ol>
  )
}

export function ExampleQuestion() {
  const dialogRef = useRef(null)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [isOpen])

  function openDialog() {
    dialogRef.current.showModal()
    setIsOpen(true)
  }

  function closeOnBackdrop(event) {
    if (event.target !== event.currentTarget) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
      dialogRef.current.close()
    }
  }

  return (
    <>
      <div className={`${styles.exampleInvite} p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6`}>
        <div className="space-y-3">
          <h2 className="text-2xl font-bold">Practica con tu propio código</h2>
          <p className="text-sm text-slate-400">Hasta tres preguntas sobre tu programa y un cierre con lo que descubriste.</p>
        </div>
        <div className="flex flex-col items-center gap-3 md:shrink-0">
          <Link href="/simulador" className={`${styles.primaryAction} flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-5 py-3 text-center font-semibold`}>Quiero probar con mi código <ArrowRight aria-hidden="true" className="w-5 h-5 shrink-0" /></Link>
          <button type="button" onClick={openDialog} className={`${styles.focusable} rounded-md px-2 py-1 text-sm text-blue-300 hover:text-blue-200 underline underline-offset-4`}>Ver pregunta de ejemplo</button>
        </div>
      </div>
      <dialog ref={dialogRef} aria-labelledby="example-title" aria-describedby="example-question" onClose={() => setIsOpen(false)} onClick={closeOnBackdrop} className={`${styles.dialog} bg-slate-900 text-slate-100 rounded-2xl border border-slate-700 p-0 shadow-2xl`}>
        <div className="p-6 sm:p-8 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id="example-title" className="text-2xl font-bold">Pregunta de sustentación</h2>
            <button type="button" aria-label="Cerrar pregunta de ejemplo" onClick={() => dialogRef.current.close()} className={`${styles.focusable} p-2 -mr-2 -mt-1 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white`}><X aria-hidden="true" className="w-5 h-5" /></button>
          </div>
          <pre className="overflow-x-auto rounded-xl bg-slate-950 border border-slate-800 p-4 text-sm text-blue-300"><code>{'if len(aprobados) == 0:\n    return 0'}</code></pre>
          <p id="example-question" className="text-slate-200 leading-relaxed">¿Por qué necesitas comprobar que la lista está vacía antes de calcular el promedio?</p>
          <div className="space-y-2">
            <label htmlFor="example-answer" className="text-sm text-slate-300 block">Tu explicación</label>
            <textarea id="example-answer" rows={3} placeholder="Escribe cómo lo explicarías…" className={`${styles.focusable} w-full min-h-28 resize-y rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm placeholder:text-slate-500`} />
            <p className="text-xs text-slate-400">Este espacio es para practicar; tu respuesta no se envía ni se evalúa.</p>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button type="button" onClick={() => dialogRef.current.close()} className={`${styles.focusable} px-5 py-3 rounded-xl border border-slate-700 hover:bg-slate-800`}>Cerrar</button>
            <Link href="/simulador" onClick={() => dialogRef.current.close()} className={`${styles.primaryAction} text-center bg-blue-600 hover:bg-blue-500 font-semibold px-5 py-3 rounded-xl`}>Probar el simulador</Link>
          </div>
        </div>
      </dialog>
    </>
  )
}

const options = [
  <>Para agregar la nota aprobada a la lista <code>aprobados</code>.</>,
  <>Para eliminar notas menores a 3.</>,
  <>Para ordenar automáticamente las notas.</>,
]

export function MiniQuiz() {
  const [selected, setSelected] = useState(null)
  const isCorrect = selected === 0

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 max-w-3xl mx-auto">
      <div className="space-y-2">
        <h2 className="text-3xl font-bold">Mini reto: ¿qué hace este código?</h2>
        <p className="text-sm text-slate-400">Calienta en 10 segundos. En la práctica con tu código respondes con tus propias palabras.</p>
      </div>
      <pre className="overflow-x-auto rounded-xl bg-slate-950 border border-slate-800 p-4 text-sm text-blue-300"><code>{'for nota in notas:\n    if nota >= 3:\n        aprobados.append(nota)'}</code></pre>
      <fieldset className="space-y-3">
        <legend className="font-semibold mb-4">¿Por qué se usa append() en esta parte?</legend>
        {options.map((option, index) => (
          <label key={index} className={`${styles.option} flex items-start gap-3 cursor-pointer p-4 rounded-xl border text-sm ${selected === index ? 'border-blue-500 bg-blue-950/40 text-white' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-blue-500/60 hover:bg-slate-800'}`}>
            <input type="radio" name="append-answer" checked={selected === index} onChange={() => setSelected(index)} className="mt-1 shrink-0 accent-blue-500" />
            <span><span className="font-semibold">{String.fromCharCode(65 + index)}.</span> {option}</span>
          </label>
        ))}
      </fieldset>
      <div role="status" aria-live="polite" aria-atomic="true">
        {selected !== null && <p key={selected} className={`${styles.feedback} rounded-xl border p-4 text-sm ${isCorrect ? 'border-green-800/60 bg-green-950/30 text-green-300' : 'border-slate-700 bg-slate-800/60 text-slate-300'}`}>
          {isCorrect ? 'Correcto. append() agrega un nuevo elemento al final de la lista.' : <>No exactamente. Piensa qué cambio ocurre en la lista <code>aprobados</code>.</>}
        </p>}
      </div>
    </div>
  )
}

export function Reveal({ children, className = '' }) {
  const sectionRef = useRef(null)

  useEffect(() => {
    const section = sectionRef.current
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (preference.matches || !('IntersectionObserver' in window)) return

    section.dataset.reveal = 'pending'
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) {
        section.dataset.reveal = 'visible'
        observer.disconnect()
      }
    }, { threshold: 0.08 })
    observer.observe(section)
    const revealImmediately = () => {
      if (preference.matches) {
        section.dataset.reveal = 'visible'
        observer.disconnect()
      }
    }
    preference.addEventListener('change', revealImmediately)
    return () => {
      observer.disconnect()
      preference.removeEventListener('change', revealImmediately)
      delete section.dataset.reveal
    }
  }, [])

  return <section ref={sectionRef} className={`${styles.reveal} ${className}`}>{children}</section>
}
