process.env.NODE_ENV = 'development';

const { start } = require('../server');

if (require.main === module) {
  start();
}
