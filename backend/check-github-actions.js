const https = require('https');

const owner = 'tripathirahul-lwf';
const repo = 'payday-laon-crm';
const url = `https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=3`;

const options = {
  headers: {
    'User-Agent': 'NodeJS-Agent'
  }
};

https.get(url, options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.workflow_runs) {
        json.workflow_runs.forEach((run) => {
          console.log(`\nRun ID: ${run.id}`);
          console.log(`Name: ${run.name}`);
          console.log(`Event: ${run.event}`);
          console.log(`Status: ${run.status}`);
          console.log(`Conclusion: ${run.conclusion}`);
          console.log(`Commit: ${run.head_commit ? run.head_commit.message : 'N/A'}`);
          console.log(`Created: ${run.created_at}`);
        });
      } else {
        console.log('No runs found or error:', json);
      }
    } catch (e) {
      console.error('Parse error:', e.message);
    }
  });
}).on('error', (err) => {
  console.error('Request error:', err.message);
});
