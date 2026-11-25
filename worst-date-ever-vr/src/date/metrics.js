export function createVenueMetrics(renderer) {
  let elapsed = 0;
  let last = 0;
  const samples = [];
  let calls = 0;
  let triangles = 0;

  function collect(now) {
    if (last && now > last) {
      const milliseconds = now - last;
      elapsed += milliseconds;
      samples.push(milliseconds);
      if (samples.length > 900) samples.shift();
      calls = renderer.info.render.calls;
      triangles = renderer.info.render.triangles;
    }
    last = now;
  }

  function report() {
    if (!samples.length) return null;
    const sorted = samples.slice().sort((a, b) => a - b);
    const value = p => sorted[Math.floor((sorted.length - 1) * p)];
    return { sampleCount: samples.length, measuredMs: elapsed, frameIntervalP50Ms: value(.5),
      frameIntervalP95Ms: value(.95), lastDrawCalls: calls, lastTriangles: triangles };
  }

  return { collect, report };
}
