// Practice drafts use the key `pydefense-v<N>:<clerkId>` (code, answers and
// feedback state of Sustentar). Any draft that does not belong to the account
// signed in now is removed; with nobody signed in, all drafts are removed.
// Keys of other kinds, such as the Aprender progress of this browser, stay.
const BORRADOR = /^pydefense-v\d+:/

export function borradoresAjenos(claves, userId) {
  const propia = userId ? `pydefense-v4:${userId}` : null
  return claves.filter((c) => BORRADOR.test(c) && c !== propia)
}
