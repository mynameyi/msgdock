fetch(`http://127.0.0.1:${process.env.PORT || 3000}/health/ready`, {
  signal: AbortSignal.timeout(4000),
})
  .then((r) => process.exit(r.ok ? 0 : 1))
  .catch(() => process.exit(1));
