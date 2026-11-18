// Optional daily reminder as an iCalendar file created on the device. PyDefense
// does not send reminders and does not learn whether the person added it.
const CRLF = '\r\n'
const dos = (n) => String(n).padStart(2, '0')

export function recordatorioICS({ hora = 19, minuto = 0, url, hoy, uid }) {
  const [a, m, d] = hoy.split('-')
  const lineas = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PyDefense//Aprender//ES', 'CALSCALE:GREGORIAN',
    // America/Bogota has no daylight saving time: UTC−5 all year.
    'BEGIN:VTIMEZONE', 'TZID:America/Bogota', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0500', 'TZNAME:-05', 'END:STANDARD', 'END:VTIMEZONE',
    'BEGIN:VEVENT', `UID:${uid}@pydefense`, `DTSTAMP:${a}${m}${d}T000000Z`,
    `DTSTART;TZID=America/Bogota:${a}${m}${d}T${dos(hora)}${dos(minuto)}00`, 'DURATION:PT10M', 'RRULE:FREQ=DAILY',
    'SUMMARY:Practicar Python en PyDefense', `DESCRIPTION:Una lección\\, la misión de hoy o un repaso. ${url}`, `URL:${url}`,
    'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:Practicar Python en PyDefense', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ]
  return lineas.join(CRLF) + CRLF
}
