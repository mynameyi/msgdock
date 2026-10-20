const net = require('node:net');
function ready(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.setTimeout(1000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}
(async () => {
  for (let attempt = 0; attempt < 60; attempt++) {
    if ((await ready(5432)) && (await ready(6379))) {
      require(`../apps/${process.argv[2]}/dist/main.js`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.error('内置数据服务未就绪');
  process.exit(1);
})();
