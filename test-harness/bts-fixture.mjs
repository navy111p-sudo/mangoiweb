// Isolated portal fixtures run selected functions outside the page closure.
export function btsFixtureSource(html) {
  const start = html.indexOf('  var btsLevels = [');
  const end = html.indexOf('  function setLevelOnScreen(', start);
  if (start < 0 || end < 0) throw new Error('BTS curriculum helpers missing');
  return html.slice(start, end);
}
