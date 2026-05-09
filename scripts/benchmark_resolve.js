
async function resolveSentryIssueMock(issueId, delay) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, delay);
  });
}

async function sequentialResolve(issues, delay) {
  const start = Date.now();
  let resolved = 0;
  for (const issue of issues) {
    if (await resolveSentryIssueMock(issue.id, delay)) resolved++;
  }
  const end = Date.now();
  return { resolved, duration: end - start };
}

async function concurrentResolve(issues, delay) {
  const start = Date.now();
  const results = await Promise.all(issues.map(issue => resolveSentryIssueMock(issue.id, delay)));
  const resolved = results.filter(Boolean).length;
  const end = Date.now();
  return { resolved, duration: end - start };
}

async function runBenchmark() {
  const numIssues = 25;
  const delay = 100; // 100ms simulated API delay
  const issues = Array.from({ length: numIssues }, (_, i) => ({ id: `issue-${i}` }));

  console.log(`Running benchmark with ${numIssues} issues and ${delay}ms delay per request...`);

  const seq = await sequentialResolve(issues, delay);
  console.log(`Sequential: ${seq.duration}ms, resolved: ${seq.resolved}`);

  const con = await concurrentResolve(issues, delay);
  console.log(`Concurrent: ${con.duration}ms, resolved: ${con.resolved}`);

  const improvement = ((seq.duration - con.duration) / seq.duration * 100).toFixed(2);
  console.log(`Improvement: ${improvement}%`);
}

runBenchmark();
