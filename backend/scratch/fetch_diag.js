fetch("https://testing.waqtmoney.com/diagnostics.txt?t=" + Date.now())
  .then(res => res.text())
  .then(text => {
    console.log("=== RAW DIAGNOSTICS ===");
    console.log(text);
  })
  .catch(err => console.error("Error:", err));
