/** Only a direct server Azure response can supply these two reading metrics.
 * Neither client scores, text similarity nor word-only exercises qualify.
 */
export function referenceReadingEvidence(result: any, reference: string, lang: string) {
  if(lang!=='en'||(reference.match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)||[]).length<3||result?.ok!==true||result.scoreFieldsPresent!==true)return null;
  const accuracy=result.accuracy,fluency=result.fluency;
  if(![accuracy,fluency].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100))return null;
  return {source:'azure-server-reference-sentence',skills:{pronunciation:accuracy,fluency}};
}
