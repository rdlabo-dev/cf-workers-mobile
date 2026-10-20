// Give simulator launch its own bounded budget without extending app acceptance.
export function createProbeDeadline({ scenario, onTimeout, onStage }) {
  const launchedAt = Date.now();
  let stage = "launch";
  let startedAt = launchedAt;
  const arm = (milliseconds) =>
    setTimeout(() => {
      onTimeout(
        `Probe ${stage} timed out after ${Date.now() - startedAt}ms ` +
          `(total ${Date.now() - launchedAt}ms)`,
      );
    }, milliseconds);
  let timer = arm(90000);
  return {
    sceneStarted() {
      if (stage !== "launch") return;
      clearTimeout(timer);
      stage = "scenario";
      startedAt = Date.now();
      timer = arm(scenario === "normal" ? 120000 : 90000);
      onStage(
        `SDK_PROBE_SCENE_STARTED launchElapsedMs=${startedAt - launchedAt}`,
      );
    },
    stop() {
      clearTimeout(timer);
      stage = "stopped";
    },
  };
}
