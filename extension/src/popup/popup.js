import { callExtension } from "../shared/client.js";

let activeTab = null;
let lastAnalysis = null;
let lastSavedJob = null;
let lastState = null;
const analysisCache = new Map();

function popupFlash(message, isError = false) {
  const node = document.getElementById("popup-flash");
  node.hidden = false;
  node.textContent = message;
  node.style.color = isError ? "#8a3c3c" : "";
  clearTimeout(popupFlash.timeoutId);
  popupFlash.timeoutId = setTimeout(() => {
    node.hidden = true;
  }, 2500);
}

function renderRecentJobs(jobs) {
  const container = document.getElementById("recent-jobs");
  container.innerHTML = "";
  if (!jobs.length) {
    container.textContent = "No saved jobs yet.";
    return;
  }
  for (const job of jobs) {
    const item = document.createElement("div");
    item.className = "jm-job-list-item";
    item.innerHTML = `<strong>${job.company}</strong><span>${job.title}</span><span>${job.status}</span>`;
    container.append(item);
  }
}

function relativeTime(value) {
  if (!value) {
    return "";
  }
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function renderRecentScans(scans) {
  const container = document.getElementById("recent-scans");
  if (!container) {
    return;
  }
  container.innerHTML = "";
  if (!scans.length) {
    container.textContent = "No scan history yet.";
    return;
  }
  for (const scan of scans) {
    const item = document.createElement("div");
    item.className = "jm-job-list-item";
    const skippedPreview = (scan.skippedLabels || []).slice(0, 2).join(", ");
    const matchBreakdown = Object.entries(scan.metrics?.matchBreakdown || {})
      .map(([key, count]) => `${key}:${count}`)
      .join(" · ");
    item.innerHTML = `
      <strong>${scan.platform || "unknown"} · ${scan.jobTitle || "Current page"}</strong>
      <span>${relativeTime(scan.created_at)} · ${scan.metrics?.scanDurationMs ?? "?"}ms · filled ${scan.metrics?.fieldCountFilled ?? 0}/${scan.metrics?.fieldCountVisible ?? 0}</span>
      <span>root: ${scan.metrics?.rootSelectorUsed || "document"}${scan.metrics?.stepSelectorUsed ? ` · step: ${scan.metrics.stepSelectorUsed}` : ""}</span>
      <span>${matchBreakdown || "no matches recorded"}${skippedPreview ? ` · skipped: ${skippedPreview}` : ""}</span>
    `;
    container.append(item);
  }
}

function renderAutofillReview(result = null) {
  const container = document.getElementById("autofill-review");
  if (!container) {
    return;
  }
  container.innerHTML = "";
  if (!result) {
    container.textContent = "Run autofill to see a field-by-field summary.";
    return;
  }

  const sections = [
    ["Filled", result.filled || []],
    ["Needs Review", result.review || []],
    ["Skipped", result.skipped || []]
  ];

  for (const [title, entries] of sections) {
    const item = document.createElement("div");
    item.className = "jm-job-list-item";
    const preview = entries
      .slice(0, 4)
      .map((entry) => {
        const reason = entry.reason || entry.skipReason || entry.fillMethod || "";
        return `${entry.label}${reason ? ` — ${reason}` : ""}`;
      })
      .join("\n");
    item.innerHTML = `<strong>${title}</strong><span>${entries.length} fields</span><span>${preview || "None"}</span>`;
    container.append(item);
  }
}

function setJobField(id, value) {
  document.getElementById(id).textContent = value || "—";
}

function cacheKey(tab) {
  return `${tab?.id || "unknown"}:${tab?.url || ""}`;
}

function setScanMetrics(metrics = {}) {
  const node = document.getElementById("scan-metrics");
  if (!node) {
    return;
  }
  node.textContent = [
    metrics.platform ? `platform: ${metrics.platform}` : "",
    metrics.rootSelectorUsed ? `root: ${metrics.rootSelectorUsed}` : "",
    metrics.stepSelectorUsed ? `step: ${metrics.stepSelectorUsed}` : "",
    metrics.submissionState ? `state: ${metrics.submissionState}` : "",
    Number.isFinite(metrics.scanDurationMs) ? `scan: ${metrics.scanDurationMs}ms` : "",
    Number.isFinite(metrics.fieldCountVisible) ? `visible fields: ${metrics.fieldCountVisible}` : "",
    Number.isFinite(metrics.fieldCountMatched) ? `matched: ${metrics.fieldCountMatched}` : "",
    Number.isFinite(metrics.fieldCountReview) ? `review: ${metrics.fieldCountReview}` : "",
    metrics.cacheHit ? "cached scan" : ""
  ]
    .filter(Boolean)
    .join(" · ");
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab ?? null;
  return activeTab;
}

async function getExtensionState() {
  if (lastState) {
    return lastState;
  }
  const response = await callExtension("jobmaster:get-state");
  if (!response.ok) {
    throw new Error(response.error || "Could not load extension state.");
  }
  lastState = response.state;
  return lastState;
}

async function analyzeCurrentPage() {
  const tab = activeTab ?? (await getActiveTab());
  if (!tab?.id || !/^https?:/i.test(tab.url || "")) {
    throw new Error("This page does not allow extension automation.");
  }

  const state = await getExtensionState();
  const key = cacheKey(tab);
  if (analysisCache.has(key)) {
    lastAnalysis = analysisCache.get(key);
    const currentJob = lastAnalysis.job || {};
    setJobField("job-company", currentJob.company);
    setJobField("job-title", currentJob.title);
    setJobField("job-location", currentJob.location);
    document.getElementById("platform-label").textContent = `${lastAnalysis.platform} · ${lastAnalysis.applicationFormDetected ? "application form detected" : "metadata only"}${lastAnalysis.submissionState ? ` · ${lastAnalysis.submissionState}` : ""}`;
    setScanMetrics(lastAnalysis.metrics || lastAnalysis);
    const findResponse = await callExtension("jobmaster:find-job-by-url", { jobUrl: tab.url || currentJob.job_url || "" });
    lastSavedJob = findResponse.ok ? findResponse.job : null;
    return;
  }

  const response = await chrome.tabs.sendMessage(tab.id, {
    action: "jobmaster:analyze-page",
    context: {
      autofillSettings: state.autofillSettings
    }
  });
  if (!response?.ok) {
    throw new Error(response?.error || "Could not analyze the page.");
  }
  lastAnalysis = response.analysis;
  analysisCache.set(key, response.analysis);
  const currentJob = response.analysis.job || {};
  setJobField("job-company", currentJob.company);
  setJobField("job-title", currentJob.title);
  setJobField("job-location", currentJob.location);
  document.getElementById("platform-label").textContent = `${response.analysis.platform} · ${response.analysis.applicationFormDetected ? "application form detected" : "metadata only"}${response.analysis.submissionState ? ` · ${response.analysis.submissionState}` : ""}`;
  setScanMetrics(response.analysis.metrics || response.analysis);

  const findResponse = await callExtension("jobmaster:find-job-by-url", { jobUrl: tab.url || currentJob.job_url || "" });
  lastSavedJob = findResponse.ok ? findResponse.job : null;
}

function inferredJobFromAnalysis() {
  const current = lastAnalysis?.job ?? {};
  return {
    company: current.company || new URL(activeTab?.url || "https://example.com").hostname,
    title: current.title || activeTab?.title || "Unknown role",
    location: current.location || "",
    source: current.source || `${lastAnalysis?.platform || "generic"} · ${new URL(activeTab?.url || "https://example.com").hostname}`,
    job_url: activeTab?.url || current.job_url || "",
    compensation: "",
    notes: ""
  };
}

async function refreshRecentJobs() {
  const response = await callExtension("jobmaster:recent-jobs", { limit: 5 });
  if (response.ok) {
    renderRecentJobs(response.jobs);
  }
}

async function refreshRecentScans() {
  const response = await callExtension("jobmaster:recent-scan-runs", { limit: 4 });
  if (response.ok) {
    renderRecentScans(response.scans);
  }
}

document.getElementById("open-options").addEventListener("click", async () => {
  await callExtension("jobmaster:open-options");
});

document.getElementById("open-dashboard").addEventListener("click", async () => {
  await callExtension("jobmaster:open-dashboard");
});

document.getElementById("refresh-analysis").addEventListener("click", async () => {
  try {
    const tab = activeTab ?? (await getActiveTab());
    lastState = null;
    analysisCache.delete(cacheKey(tab));
    await analyzeCurrentPage();
    popupFlash("Scan refreshed.");
  } catch (error) {
    popupFlash(error.message || "Could not refresh scan.", true);
  }
});

document.getElementById("save-job").addEventListener("click", async () => {
  try {
    await analyzeCurrentPage();
    const job = inferredJobFromAnalysis();
    const response = await callExtension("jobmaster:save-job", { job });
    if (!response.ok) {
      throw new Error(response.error);
    }
    lastSavedJob = response.job;
    popupFlash(`Saved ${response.job.title} at ${response.job.company}.`);
    await refreshRecentJobs();
  } catch (error) {
    popupFlash(error.message || "Could not save job.", true);
  }
});

document.getElementById("mark-submitted").addEventListener("click", async () => {
  try {
    await analyzeCurrentPage();
    if (!lastSavedJob) {
      const saveResponse = await callExtension("jobmaster:save-job", { job: inferredJobFromAnalysis() });
      if (!saveResponse.ok) {
        throw new Error(saveResponse.error);
      }
      lastSavedJob = saveResponse.job;
    }
    const response = await callExtension("jobmaster:update-job-status", {
      jobId: lastSavedJob.id,
      status: "submitted"
    });
    if (!response.ok) {
      throw new Error(response.error);
    }
    popupFlash("Marked current job as submitted.");
    await refreshRecentJobs();
  } catch (error) {
    popupFlash(error.message || "Could not update job status.", true);
  }
});

document.getElementById("generate-cover-letter").addEventListener("click", async () => {
  try {
    await analyzeCurrentPage();
    const response = await callExtension("jobmaster:download-cover-letter", { job: inferredJobFromAnalysis() });
    if (!response.ok) {
      throw new Error(response.error);
    }
    document.getElementById("cover-letter-preview").textContent = response.coverLetter;
    popupFlash(`Downloaded ${response.downloads.filenameBase}.pdf and .tex`);
  } catch (error) {
    popupFlash(error.message || "Could not generate cover letter.", true);
  }
});

document.getElementById("open-assistant").addEventListener("click", async () => {
  try {
    await analyzeCurrentPage();
    const response = await chrome.tabs.sendMessage(activeTab.id, {
      action: "jobmaster:open-assistant"
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Could not open assistant.");
    }
    popupFlash("Opened the on-page assistant.");
  } catch (error) {
    popupFlash(error.message || "Could not open assistant.", true);
  }
});

document.getElementById("autofill-page").addEventListener("click", async () => {
  try {
    await analyzeCurrentPage();
    const job = inferredJobFromAnalysis();
    const contextResponse = await callExtension("jobmaster:build-autofill-context", {
      job
    });
    if (!contextResponse.ok) {
      throw new Error(contextResponse.error);
    }
    const response = await chrome.tabs.sendMessage(activeTab.id, {
      action: "jobmaster:autofill",
      context: contextResponse.context
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Autofill failed.");
    }
    setScanMetrics(response.result.metrics);
    renderAutofillReview(response.result);
    await callExtension("jobmaster:record-scan-run", {
      scanRun: {
        platform: response.result.metrics?.platform || lastAnalysis?.platform || "unknown",
        tabUrl: activeTab?.url || "",
        jobTitle: job.title || "",
        company: job.company || "",
        metrics: response.result.metrics || {},
        skippedLabels: (response.result.skipped || []).slice(0, 5).map((entry) => entry.label || entry),
        classifiedPreview: (response.result.matches || []).slice(0, 5)
      }
    });
    await refreshRecentScans();
    popupFlash(`Filled ${response.result.filled.length} fields, flagged ${response.result.review.length} for review, skipped ${response.result.skipped.length}.`);
  } catch (error) {
    popupFlash(error.message || "Could not autofill page.", true);
  }
});

(async () => {
  try {
    await getActiveTab();
    await getExtensionState();
    await analyzeCurrentPage();
    await refreshRecentJobs();
    await refreshRecentScans();
    renderAutofillReview(null);
  } catch (error) {
    popupFlash(error.message || "Page analysis unavailable.", true);
    await refreshRecentJobs();
    await refreshRecentScans();
    renderAutofillReview(null);
  }
})();
