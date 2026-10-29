/**
 * What a page calls a person in its sentences ("None with Mira yet", "More about Mira"): the name
 * they go by; a Chinese name whole, as nobody says 磊 for 王磊 (P4-07).
 */
export const calledBy = (person: { name: string; givenName: string }): string =>
  /[㐀-鿿]/.test(person.name) ? person.name : person.givenName
