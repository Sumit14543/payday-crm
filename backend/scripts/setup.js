process.env.NODE_ENV = 'development';

process.argv.push('--setup');

const { start } = require('../server');

start();
