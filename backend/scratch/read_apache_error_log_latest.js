const fs = require('fs');

const p = '/home/waqtmoney/logs/waqtmoney.com.log';
console.log("=== READING APACHE ERROR LOG ===");
if (fs.existsSync(p)) {
  const fd = fs.openSync(p, 'r');
  const stats = fs.fstatSync(fd);
  const size = stats.size;
  const bufferSize = Math.min(size, 40000);
  const buffer = Buffer.alloc(bufferSize);
  fs.readSync(fd, buffer, 0, bufferSize, size - bufferSize);
  fs.closeSync(fd);
  
  const text = buffer.toString('utf8');
  const lines = text.split('\n');
  console.log(`Total lines read: ${lines.length}`);
  
  const filtered = lines.filter(line => 
    line.includes('payday-api') || 
    line.includes('Passenger') || 
    line.includes('passenger') || 
    line.includes('stderr') ||
    line.includes('error')
  );
  
  console.log(`Filtered lines count: ${filtered.length}. Printing last 40 matches:`);
  console.log(filtered.slice(-40).join('\n'));
} else {
  console.log("Apache error log does not exist.");
}
