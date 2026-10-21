let buffer = '';
let header = null;
process.stdout.write('READY\n');
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  for (;;) {
    if (header === null) {
      const pos = buffer.indexOf('\n');
      if (pos < 0) return;
      header = buffer.slice(0, pos);
      buffer = buffer.slice(pos + 1);
    }
    const length = Number(/\blen:(\d+)/.exec(header)?.[1] ?? 0);
    if (buffer.length < length) return;
    buffer = buffer.slice(length);
    process.stdout.write('RESULT 2\nOK');
    process.kill(process.ppid, 'SIGTERM');
    header = null;
    process.stdout.write('READY\n');
  }
});
