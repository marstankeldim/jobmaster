import { STATUS_OPTIONS } from "../shared/defaults.js";
import { callExtension } from "../shared/client.js";

let dashboardState = {
  jobs: [],
  counts: {},
  selectedJobId: "",
  eventsByJobId: new Map()
};

function flash(message, isError = false) {
  const node = document.getElementById("dashboard-flash");
  node.hidden = false;
  node.textContent = message;
  node.style.color = isError ? "#8a3c3c" : "";
  clearTimeout(flash.timeoutId);
  flash.timeoutId = setTimeout(() => {
    node.hidden = true;
  }, 2800);
}

function relativeTime(value) {
  if (!value) {
    return "—";
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
  return `${Math.round(hours / 24)}d ago`;
}

function populateStatusSelect(node, includeBlank = false) {
  node.innerHTML = includeBlank ? `<option value="">All statuses</option>` : "";
  for (const status of STATUS_OPTIONS) {
    const option = document.createElement("option");
    option.value = status;
    option.textContent = status;
    node.append(option);
  }
}

function renderStats(counts = {}) {
  const container = document.getElementById("dashboard-stats");
  const entries = [
    ["Total", counts.total || 0],
    ["Saved", counts.saved || 0],
    ["Applying", counts.applying || 0],
    ["Submitted", counts.submitted || 0],
    ["Interview", counts.interview || 0],
    ["Offer", counts.offer || 0]
  ];
  container.innerHTML = "";
  for (const [label, value] of entries) {
    const card = document.createElement("div");
    card.className = "jm-stat";
    card.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    container.append(card);
  }
}

function filteredJobs() {
  const query = document.getElementById("job-search").value.trim().toLowerCase();
  const status = document.getElementById("job-status-filter").value;
  return dashboardState.jobs.filter((job) => {
    const haystack = [job.company, job.title, job.source, job.location, job.notes].join(" ").toLowerCase();
    if (status && job.status !== status) {
      return false;
    }
    if (query && !haystack.includes(query)) {
      return false;
    }
    return true;
  });
}

function renderJobList() {
  const container = document.getElementById("dashboard-job-list");
  const jobs = filteredJobs();
  container.innerHTML = "";
  if (!jobs.length) {
    container.textContent = "No jobs match the current filters.";
    return;
  }
  for (const job of jobs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `jm-job-list-item jm-job-button${job.id === dashboardState.selectedJobId ? " is-active" : ""}`;
    button.innerHTML = `
      <strong>${job.company}</strong>
      <span>${job.title}</span>
      <span>${job.status} · ${job.location || "Location not captured"} · ${relativeTime(job.updated_at)}</span>
    `;
    button.addEventListener("click", () => {
      dashboardState.selectedJobId = job.id;
      renderJobList();
      renderSelectedJob();
    });
    container.append(button);
  }
}

function renderEvents(jobId) {
  const container = document.getElementById("detail-events");
  const events = dashboardState.eventsByJobId.get(jobId) || [];
  container.innerHTML = "";
  if (!events.length) {
    container.textContent = "No events yet.";
    return;
  }
  for (const event of events) {
    const item = document.createElement("div");
    item.className = "jm-job-list-item";
    item.innerHTML = `<strong>${event.event_type}</strong><span>${event.details || "No details"}</span><span>${relativeTime(event.created_at)}</span>`;
    container.append(item);
  }
}

function renderSelectedJob() {
  const empty = document.getElementById("job-detail-empty");
  const detail = document.getElementById("job-detail");
  const job = dashboardState.jobs.find((item) => item.id === dashboardState.selectedJobId);
  if (!job) {
    empty.hidden = false;
    detail.hidden = true;
    return;
  }
  empty.hidden = true;
  detail.hidden = false;
  document.getElementById("detail-title").textContent = job.title;
  document.getElementById("detail-company").textContent = job.company;
  document.getElementById("detail-location").textContent = job.location || "—";
  document.getElementById("detail-source").textContent = job.source || "—";
  document.getElementById("detail-url").textContent = job.job_url || "—";
  document.getElementById("detail-updated").textContent = relativeTime(job.updated_at);
  document.getElementById("detail-status").value = job.status;
  document.getElementById("detail-submitted").value = job.submitted_at || "";
  document.getElementById("detail-notes").value = job.notes || "";
  const openLink = document.getElementById("detail-open-link");
  openLink.href = job.job_url || "#";
  openLink.style.pointerEvents = job.job_url ? "" : "none";
  renderEvents(job.id);
}

async function loadEvents(jobId) {
  if (!jobId || dashboardState.eventsByJobId.has(jobId)) {
    return;
  }
  const response = await callExtension("jobmaster:list-events", { jobId, limit: 25 });
  if (response.ok) {
    dashboardState.eventsByJobId.set(jobId, response.events || []);
  }
}

async function refreshDashboard() {
  const [jobsResponse, countsResponse] = await Promise.all([
    callExtension("jobmaster:list-jobs", { all: true }),
    callExtension("jobmaster:summary-counts")
  ]);
  if (!jobsResponse.ok) {
    throw new Error(jobsResponse.error || "Could not load jobs.");
  }
  dashboardState.jobs = jobsResponse.jobs || [];
  dashboardState.counts = countsResponse.ok ? countsResponse.counts || {} : {};
  if (!dashboardState.selectedJobId && dashboardState.jobs[0]) {
    dashboardState.selectedJobId = dashboardState.jobs[0].id;
  }
  if (dashboardState.selectedJobId) {
    await loadEvents(dashboardState.selectedJobId);
  }
  renderStats(dashboardState.counts);
  renderJobList();
  renderSelectedJob();
}

document.getElementById("job-search").addEventListener("input", () => {
  renderJobList();
});

document.getElementById("job-status-filter").addEventListener("change", () => {
  renderJobList();
});

document.getElementById("dashboard-refresh").addEventListener("click", async () => {
  try {
    dashboardState.eventsByJobId.clear();
    await refreshDashboard();
    flash("Tracker refreshed.");
  } catch (error) {
    flash(error.message || "Could not refresh tracker.", true);
  }
});

document.getElementById("dashboard-open-settings").addEventListener("click", async () => {
  await callExtension("jobmaster:open-options");
});

document.getElementById("detail-save").addEventListener("click", async () => {
  const jobId = dashboardState.selectedJobId;
  if (!jobId) {
    return;
  }
  try {
    const response = await callExtension("jobmaster:update-job", {
      jobId,
      updates: {
        status: document.getElementById("detail-status").value,
        notes: document.getElementById("detail-notes").value
      }
    });
    if (!response.ok) {
      throw new Error(response.error || "Could not update job.");
    }
    dashboardState.jobs = dashboardState.jobs.map((job) => (job.id === response.job.id ? response.job : job));
    dashboardState.eventsByJobId.delete(jobId);
    await loadEvents(jobId);
    renderStats((await callExtension("jobmaster:summary-counts")).counts || {});
    renderJobList();
    renderSelectedJob();
    flash("Saved tracker changes.");
  } catch (error) {
    flash(error.message || "Could not save job changes.", true);
  }
});

populateStatusSelect(document.getElementById("job-status-filter"), true);
populateStatusSelect(document.getElementById("detail-status"));

(async () => {
  try {
    await refreshDashboard();
  } catch (error) {
    flash(error.message || "Could not load tracker.", true);
  }
})();
