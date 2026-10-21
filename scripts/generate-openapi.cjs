process.env.MSGDOCK_MASTER_KEY = require('node:crypto').randomBytes(32).toString('base64');
process.env.GENERATE_OPENAPI_ONLY = 'true';
process.env.OPENAPI_OUTPUT = require('node:path').resolve(__dirname, '../docs/openapi.json');
require('../apps/api/dist/main.js');
