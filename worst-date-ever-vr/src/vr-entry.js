const mode = 'immersive-vr';

export function wireVrEntry(scene, controls, browser = window) {
  const { button, status } = controls;
  const xr = browser.navigator.xr;
  let requesting = false;

  function report(message) {
    status.textContent = message;
    status.hidden = !message;
  }

  if (!browser.isSecureContext) {
    report('Abra a versão HTTPS para usar VR.');
    return;
  }
  if (!xr?.requestSession) {
    report('WebXR indisponível. Abra este link diretamente no Meta Quest Browser.');
    return;
  }
  if (!scene.components?.['wde-bedroom']?.bedroom)
    scene.addEventListener('bedroom-ready', () => { button.disabled = false; }, { once: true });
  else button.disabled = false;

  button.addEventListener('click', async () => {
    if (requesting || scene.xrSession) return;
    requesting = true;
    button.disabled = true;
    report('Abrindo VR…');
    const manager = scene.renderer.xr;
    let session;
    try {
      // Keep the request in this click so the browser can use its user activation.
      const { optionalFeatures } = scene.systems.webxr.sessionConfiguration;
      session = await xr.requestSession(mode, { optionalFeatures });
      let floor;
      try { floor = await session.requestReferenceSpace('local-floor'); }
      catch { /* A standing-height offset is used with local tracking below. */ }

      manager.enabled = true;
      manager.layersEnabled = session.enabledFeatures ? session.enabledFeatures.includes('layers') : true;
      manager.setReferenceSpaceType(floor ? 'local-floor' : 'local');
      await manager.setSession(session);
      if (!floor) {
        const local = manager.getReferenceSpace();
        manager.setReferenceSpace(local.getOffsetReferenceSpace(new browser.XRRigidTransform({ y: -1.65 })));
      }
      scene.xrSession = session;
      session.addEventListener('end', () => {
        scene.xrSession = undefined;
        manager.enabled = false;
        scene.removeState('vr-mode');
        scene.resize();
        scene.emit('exit-vr', { target: scene });
        button.disabled = false;
      }, { once: true });
      manager.setFoveation(scene.getAttribute('renderer').foveationLevel);
      scene.systems.renderer.setWebXRFrameRate(session);
      scene.addState('vr-mode');
      scene.emit('enter-vr', { target: scene });
      scene.resize();
      report('');
    } catch (error) {
      if (session) await session.end().catch(() => {});
      manager.enabled = false;
      button.disabled = false;
      report('Falha ao entrar em VR (' + (error.name || 'Erro') + '). ' +
        (error.message || 'Tente abrir o link em uma nova aba no Quest Browser.'));
      console.warn('WebXR entry failed', error);
    } finally {
      requesting = false;
    }
  });
}
