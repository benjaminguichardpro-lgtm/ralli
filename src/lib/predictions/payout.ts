// Seul calcul autorisé des Aces gagnés. Arithmétique entière uniquement :
// gain = floor((committedAces × oddsX100 + 50) / 100), soit l'arrondi au plus proche, demi vers le haut.

export const MIN_COMMITTED_ACES = 10;
const MIN_ODDS_X100 = 100;
const MAX_ODDS_X100 = 1000;

export function computePayout(committedAces: number, oddsX100: number): number {
  if (!Number.isSafeInteger(committedAces) || committedAces < MIN_COMMITTED_ACES) {
    throw new RangeError(`committedAces invalide : ${committedAces}`);
  }
  if (!Number.isSafeInteger(oddsX100) || oddsX100 < MIN_ODDS_X100 || oddsX100 > MAX_ODDS_X100) {
    throw new RangeError(`oddsX100 invalide : ${oddsX100}`);
  }
  const product = committedAces * oddsX100 + 50;
  if (!Number.isSafeInteger(product)) throw new RangeError("Dépassement d'entier");
  // Opérandes positifs : la division entière par troncature équivaut à floor.
  return (product - (product % 100)) / 100;
}
