import QRStand from './qr-stand'

export const metadata = { title: 'QR de ExpoAndes · PyDefense', robots: { index: false } }

// Printable QR of the stand. The public domain comes from configuration so a
// temporary preview URL is never printed by accident.
export default function PaginaQR() {
  return <QRStand dominio={process.env.PYDEFENSE_DOMINIO_PUBLICO || null} />
}
