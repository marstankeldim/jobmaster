import { callExtension } from "../shared/client.js";

let activeTab = null;
let lastAnalysis = null;
let lastSavedJob = null;

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

function setJobField(id, value) {
  document.getElementById(id).textContent = value || "—";
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab ?? null;
  return activeTab;
}

async function analyzeCurrentPage() {
  const tab = activeTab ?? (await getActiveTab());
  if (!tab?.id || !/^https?:/i.test(tab.url || "")) {
    throw new Error("This page does not allow extension automation.");
  }
  const response = await chrome.tabs.sendMessage(tab.id, { action: "jobmaster:analyze-page" });
  if (!response?.ok) {
    throw new Error(response?.error || "Could not analyze the page.");
  }
  lastAnalysis = response.analysis;
  const currentJob = response.analysis.job || {};
  setJobField("job-company", currentJob.company);
  setJobField("job-title", currentJob.title);
  setJobField("job-location", currentJob.location);
  document.getElementById("platform-label").textContent = `${response.analysis.platform} · ${response.analysis.applicationFormDetected ? "application form detected" : "metadata only"}`;

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

document.getElementById("open-options").addEventListener("click", async () => {
  await callExtension("jobmaster:open-options");
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
    const response = await callExtension("jobmaster:generate-cover-letter", { job: inferredJobFromAnalysis() });
    if (!response.ok) {
      throw new Error(response.error);
    }
    document.getElementById("cover-letter-preview").textContent = response.coverLetter;
    popupFlash("Generated cover letter preview.");
  } catch (error) {
    popupFlash(error.message || "Could not generate cover letter.", true);
  }
});

document.getElementById("autofill-page").addEventListener("click", async () => {
  try {
    await analyzeCurrentPage();
    const contextResponse = await callExtension("jobmaster:build-autofill-context", {
      job: inferredJobFromAnalysis()
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
    popupFlash(`Filled ${response.result.filled.length} fields and skipped ${response.result.skipped.length}.`);
  } catch (error) {
    popupFlash(error.message || "Could not autofill page.", true);
  }
});

(async () => {
  try {
    await getActiveTab();
    await analyzeCurrentPage();
    await refreshRecentJobs();
  } catch (error) {
    popupFlash(error.message || "Page analysis unavailable.", true);
    await refreshRecentJobs();
  }
})();

