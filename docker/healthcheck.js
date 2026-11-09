// Container healthcheck for every Synapse service. The runtime env file
// written during the image build selects the per-app defaults; PORT may
// still be overridden at runtime.
const port = Number(process.env.PORT || process.env.HEALTH_PORT_DEFAULT || 3000);
const healthPath =
  process.env.HEALTH_PATH_DEFAULT ?? '/api/health/ready';

fetch(`http://127.0.0.1:${port}${healthPath}`)
  .then((response) => {
    if (!response.ok) process.exit(1);
  })
  .catch(() => process.exit(1));
