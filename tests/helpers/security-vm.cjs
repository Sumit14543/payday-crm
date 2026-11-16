const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function load(file, mocks, globals = {}) {
  const filename = path.resolve(__dirname, '../..', file), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, Buffer, Date, URL, URLSearchParams, console,
    setTimeout, clearTimeout, AbortController, __dirname: path.dirname(filename), __filename: filename,
    process: { env: {}, cwd: () => path.dirname(filename) },
    require(name) { if (Object.hasOwn(mocks, name)) return mocks[name]; if (name.startsWith('node:') || ['crypto', 'path', 'os', 'async_hooks', 'tls', 'net'].includes(name)) return require(name); throw new Error('Unmocked dependency: ' + name); },
    ...globals,
  }, { filename });
  return module.exports;
}
function response() { return { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
const http = { success: (res, data, message, code = 200) => res.status(code).json({ success: true, data, message }), notFound: (res, message) => res.status(404).json({ success: false, message }), requireFields() {} };
module.exports = { load, response, http };
