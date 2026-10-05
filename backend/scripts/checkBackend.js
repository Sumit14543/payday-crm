process.env.NODE_ENV = 'development';

process.argv.push('--check');

const { start } = require('../server');

start();
