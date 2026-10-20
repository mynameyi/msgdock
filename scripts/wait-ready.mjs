const url = process.argv[2] ?? 'http://127.0.0.1:3301/health/ready';
for (let attempt = 0; attempt < 90; attempt++) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (response.ok) {
      console.log('Container ready');
      process.exit(0);
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
throw new Error('Container did not become ready');
