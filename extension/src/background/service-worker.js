import {
  buildCoverLetterFilenameBase,
  buildPdfFromText,
  latexToText,
  renderCoverLetter
} from "../shared/cover-letters.js";
import { generateProfessionalSummary } from "../shared/summary.js";
import {
  clearResumeFile,
  createJob,
  ensureDefaults,
  exportPackage,
  findJobByUrl,
  getJob,
  getResumeAsset,
  getState,
  importPackage,
  recordScanRun,
  recentScanRuns,
  recentJobs,
  saveAnswers,
  saveAutofillSettings,
  saveCandidateSources,
  saveCoverLetterTemplate,
  saveProfile,
  saveResumeFile,
  summaryCounts,
  updateJob
} from "../shared/storage.js";

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaults();
});

chrome.runtime.onStartup.addListener(() => {
  ensureDefaults();
});

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function buildDownloadUrl(bytes, mimeType) {
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

async function downloadBytes(bytes, mimeType, filename) {
  return chrome.downloads.download({
    url: buildDownloadUrl(bytes, mimeType),
    filename,
    saveAs: false
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { action, payload = {} } = message ?? {};

  (async () => {
    await ensureDefaults();

    switch (action) {
      case "jobmaster:get-state":
        sendResponse({ ok: true, state: await getState() });
        break;

      case "jobmaster:save-profile":
        sendResponse({ ok: true, profile: await saveProfile(payload.profile) });
        break;

      case "jobmaster:save-answers":
        sendResponse({ ok: true, answers: await saveAnswers(payload.answers) });
        break;

      case "jobmaster:save-candidate-sources":
        sendResponse({ ok: true, candidateSources: await saveCandidateSources(payload.candidateSources) });
        break;

      case "jobmaster:save-autofill-settings":
        sendResponse({ ok: true, autofillSettings: await saveAutofillSettings(payload.autofillSettings) });
        break;

      case "jobmaster:save-cover-letter-template":
        sendResponse({ ok: true, coverLetterTemplate: await saveCoverLetterTemplate(payload.coverLetterTemplate) });
        break;

      case "jobmaster:save-resume":
        sendResponse({ ok: true, resumeMeta: await saveResumeFile(payload.file) });
        break;

      case "jobmaster:clear-resume":
        await clearResumeFile();
        sendResponse({ ok: true });
        break;

      case "jobmaster:generate-summary": {
        const state = await getState();
        const summary = generateProfessionalSummary(state.profile, state.candidateSources);
        const profile = { ...state.profile, summary };
        await saveProfile(profile);
        sendResponse({ ok: true, summary, profile });
        break;
      }

      case "jobmaster:save-job": {
        const job = await createJob(payload.job);
        sendResponse({ ok: true, job });
        break;
      }

      case "jobmaster:update-job": {
        const job = await updateJob(payload.jobId, payload.updates);
        sendResponse({ ok: true, job });
        break;
      }

      case "jobmaster:update-job-status": {
        const job = await updateJob(payload.jobId, { status: payload.status });
        sendResponse({ ok: true, job });
        break;
      }

      case "jobmaster:list-jobs":
        sendResponse({ ok: true, jobs: await recentJobs(payload.limit ?? 100) });
        break;

      case "jobmaster:get-job":
        sendResponse({ ok: true, job: await getJob(payload.jobId) });
        break;

      case "jobmaster:find-job-by-url":
        sendResponse({ ok: true, job: await findJobByUrl(payload.jobUrl) });
        break;

      case "jobmaster:summary-counts":
        sendResponse({ ok: true, counts: await summaryCounts() });
        break;

      case "jobmaster:recent-jobs":
        sendResponse({ ok: true, jobs: await recentJobs(payload.limit ?? 6) });
        break;

      case "jobmaster:record-scan-run": {
        const entry = await recordScanRun(payload.scanRun ?? {});
        sendResponse({ ok: true, entry });
        break;
      }

      case "jobmaster:recent-scan-runs":
        sendResponse({ ok: true, scans: await recentScanRuns(payload.limit ?? 5) });
        break;

      case "jobmaster:generate-cover-letter": {
        const state = await getState();
        const rendered = renderCoverLetter(state.coverLetterTemplate, payload.job, state.profile);
        sendResponse({ ok: true, coverLetter: rendered, plainText: latexToText(rendered) });
        break;
      }

      case "jobmaster:download-cover-letter": {
        const state = await getState();
        const rendered = renderCoverLetter(state.coverLetterTemplate, payload.job, state.profile);
        const plainText = latexToText(rendered);
        const filenameBase = buildCoverLetterFilenameBase(payload.job, state.profile);
        const texBytes = new TextEncoder().encode(`${rendered}\n`);
        const pdfBytes = buildPdfFromText(plainText);
        const texDownloadId = await downloadBytes(texBytes, "application/x-tex;charset=utf-8", `${filenameBase}.tex`);
        const pdfDownloadId = await downloadBytes(pdfBytes, "application/pdf", `${filenameBase}.pdf`);
        sendResponse({
          ok: true,
          coverLetter: rendered,
          plainText,
          downloads: {
            texDownloadId,
            pdfDownloadId,
            filenameBase
          }
        });
        break;
      }

      case "jobmaster:build-autofill-context": {
        const state = await getState();
        const rendered = renderCoverLetter(state.coverLetterTemplate, payload.job, state.profile);
        sendResponse({
          ok: true,
          context: {
            profile: state.profile,
            answers: state.answers,
            candidateSources: state.candidateSources,
            autofillSettings: state.autofillSettings,
            resumeMeta: state.resumeMeta,
            resumeAsset: await getResumeAsset(),
            coverLetterLatex: rendered,
            coverLetterText: latexToText(rendered)
          }
        });
        break;
      }

      case "jobmaster:export-package":
        sendResponse({ ok: true, packageData: await exportPackage() });
        break;

      case "jobmaster:import-package":
        await importPackage(payload.packageData);
        sendResponse({ ok: true, state: await getState() });
        break;

      case "jobmaster:open-options":
        await chrome.runtime.openOptionsPage();
        sendResponse({ ok: true });
        break;

      default:
        sendResponse({ ok: false, error: `Unknown action: ${action}` });
        break;
    }
  })().catch((error) => {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
  });

  return true;
});
