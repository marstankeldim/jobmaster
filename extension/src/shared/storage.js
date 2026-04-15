import {
  createDefaultState,
  DEFAULT_ANSWERS,
  DEFAULT_CANDIDATE_SOURCES,
  DEFAULT_COVER_LETTER_TEMPLATE,
  DEFAULT_PROFILE,
  STATUS_OPTIONS,
  STORAGE_KEYS
} from "./defaults.js";

const DB_NAME = "jobmaster-extension-db";
const FILE_STORE = "files";
const RESUME_FILE_KEY = "resume";

function nowIso() {
  return new Date().toISOString();
}

function mergeObjects(baseValue, overrideValue) {
  if (Array.isArray(baseValue)) {
    return Array.isArray(overrideValue) ? overrideValue : structuredClone(baseValue);
  }
  if (baseValue && typeof baseValue === "object") {
    const result = {};
    const keys = new Set([...Object.keys(baseValue), ...Object.keys(overrideValue ?? {})]);
    for (const key of keys) {
      const baseChild = baseValue[key];
      const overrideChild = overrideValue?.[key];
      if (overrideChild === undefined) {
        result[key] = structuredClone(baseChild);
      } else if (baseChild && typeof baseChild === "object" && !Array.isArray(baseChild)) {
        result[key] = mergeObjects(baseChild, overrideChild ?? {});
      } else {
        result[key] = overrideChild;
      }
    }
    return result;
  }
  return overrideValue ?? baseValue;
}

function sortByUpdatedAt(items) {
  return [...items].sort((left, right) => {
    const rightValue = right.updated_at ?? right.created_at ?? "";
    const leftValue = left.updated_at ?? left.created_at ?? "";
    return rightValue.localeCompare(leftValue);
  });
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, handler) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FILE_STORE, mode);
    const store = transaction.objectStore(FILE_STORE);
    const request = handler(store);
    transaction.oncomplete = () => {
      db.close();
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putFileRecord(record) {
  return withStore("readwrite", (store) => store.put(record));
}

async function getFileRecord(key) {
  return withStore("readonly", (store) => store.get(key));
}

async function deleteFileRecord(key) {
  return withStore("readwrite", (store) => store.delete(key));
}

export async function ensureDefaults() {
  const defaultState = createDefaultState();
  const current = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  const updates = {};
  if (current[STORAGE_KEYS.profile] == null) {
    updates[STORAGE_KEYS.profile] = defaultState.profile;
  }
  if (current[STORAGE_KEYS.answers] == null) {
    updates[STORAGE_KEYS.answers] = defaultState.answers;
  }
  if (current[STORAGE_KEYS.candidateSources] == null) {
    updates[STORAGE_KEYS.candidateSources] = defaultState.candidateSources;
  }
  if (current[STORAGE_KEYS.coverLetterTemplate] == null) {
    updates[STORAGE_KEYS.coverLetterTemplate] = defaultState.coverLetterTemplate;
  }
  if (current[STORAGE_KEYS.jobs] == null) {
    updates[STORAGE_KEYS.jobs] = [];
  }
  if (current[STORAGE_KEYS.events] == null) {
    updates[STORAGE_KEYS.events] = [];
  }
  if (current[STORAGE_KEYS.resumeMeta] === undefined) {
    updates[STORAGE_KEYS.resumeMeta] = null;
  }
  if (Object.keys(updates).length) {
    await chrome.storage.local.set(updates);
  }
}

export async function getState() {
  await ensureDefaults();
  const current = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  return {
    profile: mergeObjects(DEFAULT_PROFILE, current[STORAGE_KEYS.profile] ?? {}),
    answers: mergeObjects(DEFAULT_ANSWERS, current[STORAGE_KEYS.answers] ?? {}),
    candidateSources: mergeObjects(DEFAULT_CANDIDATE_SOURCES, current[STORAGE_KEYS.candidateSources] ?? {}),
    coverLetterTemplate: current[STORAGE_KEYS.coverLetterTemplate] ?? DEFAULT_COVER_LETTER_TEMPLATE,
    jobs: sortByUpdatedAt(current[STORAGE_KEYS.jobs] ?? []),
    events: sortByUpdatedAt(current[STORAGE_KEYS.events] ?? []),
    resumeMeta: current[STORAGE_KEYS.resumeMeta] ?? null
  };
}

export async function saveProfile(profile) {
  await chrome.storage.local.set({ [STORAGE_KEYS.profile]: profile });
  return profile;
}

export async function saveAnswers(answers) {
  await chrome.storage.local.set({ [STORAGE_KEYS.answers]: answers });
  return answers;
}

export async function saveCandidateSources(candidateSources) {
  await chrome.storage.local.set({ [STORAGE_KEYS.candidateSources]: candidateSources });
  return candidateSources;
}

export async function saveCoverLetterTemplate(coverLetterTemplate) {
  await chrome.storage.local.set({ [STORAGE_KEYS.coverLetterTemplate]: coverLetterTemplate });
  return coverLetterTemplate;
}

export async function saveResumeFile(filePayload) {
  const arrayBuffer =
    filePayload.data instanceof ArrayBuffer ? filePayload.data : new Uint8Array(filePayload.data).buffer;
  await putFileRecord({
    key: RESUME_FILE_KEY,
    name: filePayload.name,
    type: filePayload.type || "application/octet-stream",
    lastModified: filePayload.lastModified || Date.now(),
    size: filePayload.size ?? arrayBuffer.byteLength,
    data: arrayBuffer
  });

  const state = await getState();
  const syntheticPath = `jobmaster://resume/${filePayload.name}`;
  const resumeMeta = {
    key: RESUME_FILE_KEY,
    name: filePayload.name,
    type: filePayload.type || "application/octet-stream",
    size: filePayload.size ?? arrayBuffer.byteLength,
    lastModified: filePayload.lastModified || Date.now(),
    path: syntheticPath
  };
  const profile = { ...state.profile, resume_path: syntheticPath };
  const candidateSources = mergeObjects(state.candidateSources, {
    resume: {
      ...state.candidateSources.resume,
      path: syntheticPath
    }
  });
  await chrome.storage.local.set({
    [STORAGE_KEYS.resumeMeta]: resumeMeta,
    [STORAGE_KEYS.profile]: profile,
    [STORAGE_KEYS.candidateSources]: candidateSources
  });
  return resumeMeta;
}

export async function clearResumeFile() {
  await deleteFileRecord(RESUME_FILE_KEY);
  const state = await getState();
  const profile = { ...state.profile, resume_path: "" };
  const candidateSources = mergeObjects(state.candidateSources, {
    resume: {
      ...state.candidateSources.resume,
      path: ""
    }
  });
  await chrome.storage.local.set({
    [STORAGE_KEYS.resumeMeta]: null,
    [STORAGE_KEYS.profile]: profile,
    [STORAGE_KEYS.candidateSources]: candidateSources
  });
}

export async function getResumeAsset() {
  const record = await getFileRecord(RESUME_FILE_KEY);
  if (!record) {
    return null;
  }
  return {
    name: record.name,
    type: record.type,
    size: record.size,
    lastModified: record.lastModified,
    data: record.data
  };
}

export async function listJobs() {
  const state = await getState();
  return state.jobs;
}

export async function listEvents(jobId = null, limit = 20) {
  const state = await getState();
  const events = jobId == null ? state.events : state.events.filter((event) => event.job_id === jobId);
  return events.slice(0, limit);
}

async function writeJobsAndEvents(jobs, events) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.jobs]: sortByUpdatedAt(jobs),
    [STORAGE_KEYS.events]: sortByUpdatedAt(events)
  });
}

export async function createJob(inputJob) {
  const state = await getState();
  if (inputJob.job_url) {
    const existing = state.jobs.find((job) => job.job_url && job.job_url === inputJob.job_url);
    if (existing) {
      return existing;
    }
  }
  const createdAt = nowIso();
  const job = {
    id: crypto.randomUUID(),
    company: inputJob.company || "Unknown company",
    title: inputJob.title || "Unknown role",
    location: inputJob.location || "",
    source: inputJob.source || "",
    job_url: inputJob.job_url || "",
    compensation: inputJob.compensation || "",
    status: STATUS_OPTIONS.includes(inputJob.status) ? inputJob.status : "saved",
    notes: inputJob.notes || "",
    generated_cover_letter: inputJob.generated_cover_letter || "",
    submitted_at: inputJob.status === "submitted" ? createdAt : null,
    created_at: createdAt,
    updated_at: createdAt
  };
  const event = {
    id: crypto.randomUUID(),
    job_id: job.id,
    event_type: "created",
    details: `${job.title} at ${job.company}`,
    created_at: createdAt
  };
  await writeJobsAndEvents([job, ...state.jobs], [event, ...state.events]);
  return job;
}

export async function updateJob(jobId, updates) {
  const state = await getState();
  const jobs = [...state.jobs];
  const index = jobs.findIndex((job) => job.id === jobId);
  if (index === -1) {
    return null;
  }
  const existing = jobs[index];
  const nextStatus = STATUS_OPTIONS.includes(updates.status) ? updates.status : existing.status;
  const updated = {
    ...existing,
    ...updates,
    status: nextStatus,
    submitted_at: existing.submitted_at || (nextStatus === "submitted" ? nowIso() : null),
    updated_at: nowIso()
  };
  jobs[index] = updated;
  const event = {
    id: crypto.randomUUID(),
    job_id: updated.id,
    event_type: "updated",
    details: existing.status !== updated.status ? `Status changed to ${updated.status}` : `Updated ${updated.title} at ${updated.company}`,
    created_at: updated.updated_at
  };
  await writeJobsAndEvents(jobs, [event, ...state.events]);
  return updated;
}

export async function logEvent(jobId, eventType, details) {
  const state = await getState();
  const event = {
    id: crypto.randomUUID(),
    job_id: jobId,
    event_type: eventType,
    details,
    created_at: nowIso()
  };
  await writeJobsAndEvents(state.jobs, [event, ...state.events]);
  return event;
}

export async function getJob(jobId) {
  const jobs = await listJobs();
  return jobs.find((job) => job.id === jobId) ?? null;
}

export async function findJobByUrl(jobUrl) {
  if (!jobUrl) {
    return null;
  }
  const jobs = await listJobs();
  return jobs.find((job) => job.job_url === jobUrl) ?? null;
}

export async function recentJobs(limit = 6) {
  const jobs = await listJobs();
  return jobs.slice(0, limit);
}

export async function summaryCounts() {
  const jobs = await listJobs();
  const counts = Object.fromEntries(STATUS_OPTIONS.map((status) => [status, 0]));
  for (const job of jobs) {
    if (counts[job.status] != null) {
      counts[job.status] += 1;
    }
  }
  counts.total = jobs.length;
  return counts;
}

export async function exportPackage() {
  const state = await getState();
  return {
    version: 1,
    exported_at: nowIso(),
    data: {
      profile: state.profile,
      answers: state.answers,
      candidateSources: state.candidateSources,
      coverLetterTemplate: state.coverLetterTemplate,
      jobs: state.jobs,
      events: state.events,
      resumeMeta: state.resumeMeta
    }
  };
}

export async function importPackage(packagePayload) {
  if (!packagePayload?.data) {
    throw new Error("Invalid package format.");
  }
  const data = packagePayload.data;
  await chrome.storage.local.set({
    [STORAGE_KEYS.profile]: mergeObjects(DEFAULT_PROFILE, data.profile ?? {}),
    [STORAGE_KEYS.answers]: mergeObjects(DEFAULT_ANSWERS, data.answers ?? {}),
    [STORAGE_KEYS.candidateSources]: mergeObjects(DEFAULT_CANDIDATE_SOURCES, data.candidateSources ?? {}),
    [STORAGE_KEYS.coverLetterTemplate]: data.coverLetterTemplate ?? DEFAULT_COVER_LETTER_TEMPLATE,
    [STORAGE_KEYS.jobs]: Array.isArray(data.jobs) ? data.jobs : [],
    [STORAGE_KEYS.events]: Array.isArray(data.events) ? data.events : [],
    [STORAGE_KEYS.resumeMeta]: data.resumeMeta ?? null
  });
}

