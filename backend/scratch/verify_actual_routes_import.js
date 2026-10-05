const app = require('../app');

console.log("=== LISTING ALL REGISTERED EXPRESS ROUTES ===");

function printRoutes(stack, prefix = '') {
  stack.forEach(layer => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
      console.log(`${methods} ${prefix}${layer.route.path}`);
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      let routePath = layer.regexp.toString();
      // Simple parse of regexp path
      routePath = routePath
        .replace('/^\\', '')
        .replace('\\/?(?=\\/|$)/i', '')
        .replace('\\/?$/i', '')
        .replace('/i', '')
        .replace('\\', '');
      printRoutes(layer.handle.stack, prefix + routePath);
    }
  });
}

if (app._router && app._router.stack) {
  printRoutes(app._router.stack);
} else {
  console.log("No router stack found.");
}
