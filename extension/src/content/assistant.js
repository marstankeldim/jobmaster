(function attachAssistant(globalScope) {
  const runtime = {
    panel: null,
    minibar: null,
    workflow: null,
    submitWatcherInstalled: false
  };

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalize(value) {
    return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function sendExtension(action, payload = {}) {
    return chrome.runtime.sendMessage({ action, payload });
  }

  function inferJobFromAnalysis(analysis) {
    const current = analysis?.job || {};
    return {
      company: current.company || window.location.hostname,
      title: current.title || document.title || "Unknown role",
      location: current.location || "",
      source: current.source || `${analysis?.platform || "generic"} · ${window.location.hostname}`,
      job_url: window.location.href,
      compensation: "",
      notes: ""
    };
  }

  function ensurePanel() {
    if (runtime.panel) {
      return runtime.panel;
    }
    const panel = document.createElement("aside");
    panel.id = "jobmaster-assistant";
    panel.className = "jm-assistant";
    panel.innerHTML = `
      <header class="jm-assistant-head">
        <p class="jm-eyebrow">On-Page Assistant</p>
        <h2>Jobmaster</h2>
        <p id="jm-assistant-subtitle" class="jm-assistant-meta">Preparing page analysis…</p>
        <div class="jm-button-row">
          <button type="button" data-action="refresh" class="jm-button">Refresh</button>
          <button type="button" data-action="fill" class="jm-button jm-button-secondary">Fill Suggested</button>
          <button type="button" data-action="save" class="jm-button jm-button-ghost">Save Job</button>
          <button type="button" data-action="close" class="jm-button jm-button-ghost">Close</button>
        </div>
      </header>
      <div class="jm-assistant-body">
        <section class="jm-assistant-section">
          <div class="jm-assistant-badge-row">
            <div class="jm-assistant-badge"><span>Ready</span><strong id="jm-count-fill">0</strong></div>
            <div class="jm-assistant-badge"><span>Review</span><strong id="jm-count-review">0</strong></div>
            <div class="jm-assistant-badge"><span>Skipped</span><strong id="jm-count-skip">0</strong></div>
          </div>
          <p id="jm-assistant-note" class="jm-assistant-note"></p>
        </section>
        <section class="jm-assistant-section">
          <h3>Workflow</h3>
          <div class="jm-button-row">
            <button type="button" data-action="ai-all" class="jm-button jm-button-secondary">Draft Missing with AI</button>
            <button type="button" data-action="submitted" class="jm-button jm-button-ghost">Mark Submitted</button>
            <button type="button" data-action="tracker" class="jm-button jm-button-ghost">Open Tracker</button>
          </div>
          <p id="jm-assistant-workflow" class="jm-assistant-note"></p>
        </section>
        <section class="jm-assistant-section">
          <h3>Suggested Fields</h3>
          <div id="jm-list-fill" class="jm-assistant-list"></div>
        </section>
        <section class="jm-assistant-section">
          <h3>Needs Review</h3>
          <div id="jm-list-review" class="jm-assistant-list"></div>
        </section>
        <section class="jm-assistant-section">
          <h3>Skipped</h3>
          <div id="jm-list-skip" class="jm-assistant-list"></div>
        </section>
      </div>
    `;
    panel.addEventListener("click", handlePanelClick);
    document.documentElement.append(panel);
    runtime.panel = panel;
    return panel;
  }

  function removeMinibar() {
    if (runtime.minibar) {
      runtime.minibar.remove();
      runtime.minibar = null;
    }
  }

  function showMinibar(message) {
    removeMinibar();
    const bar = document.createElement("div");
    bar.className = "jm-assistant-minibar";
    bar.innerHTML = `
      <strong style="display:block;margin-bottom:6px;">Jobmaster detected a likely submission action</strong>
      <span>${message}</span>
      <div class="jm-button-row" style="margin-top:10px;">
        <button type="button" data-action="open-assistant" class="jm-button">Open Assistant</button>
        <button type="button" data-action="dismiss" class="jm-button jm-button-ghost">Dismiss</button>
      </div>
    `;
    bar.addEventListener("click", (event) => {
      const action = event.target?.dataset?.action;
      if (action === "open-assistant") {
        void openAssistant();
      }
      removeMinibar();
    });
    document.documentElement.append(bar);
    runtime.minibar = bar;
    setTimeout(removeMinibar, 9000);
  }

  function likelySubmitAction(target) {
    const element = target?.closest?.("button, input[type='submit'], input[type='button'], [role='button']");
    if (!element || runtime.panel?.contains(element)) {
      return false;
    }
    const text = normalize(
      element.innerText || element.textContent || element.value || element.getAttribute("aria-label") || ""
    );
    return /\b(submit|send application|review application|apply now|continue to submit)\b/.test(text);
  }

  function installSubmitWatcher() {
    if (runtime.submitWatcherInstalled) {
      return;
    }
    runtime.submitWatcherInstalled = true;
    document.addEventListener(
      "click",
      (event) => {
        if (likelySubmitAction(event.target)) {
          showMinibar("Open the assistant to save the job, review answers, and mark the application once the site confirms submission.");
        }
      },
      true
    );
  }

  async function buildWorkflow() {
    const stateResponse = await sendExtension("jobmaster:get-state");
    if (!stateResponse.ok) {
      throw new Error(stateResponse.error || "Could not load Jobmaster state.");
    }
    const state = stateResponse.state;
    const analysis = globalScope.JobmasterAutofill.analyzeCurrentPage({
      autofillSettings: state.autofillSettings
    });
    const job = inferJobFromAnalysis(analysis);
    const [contextResponse, trackedJobResponse, countsResponse] = await Promise.all([
      sendExtension("jobmaster:build-autofill-context", { job }),
      sendExtension("jobmaster:find-job-by-url", { jobUrl: window.location.href }),
      sendExtension("jobmaster:summary-counts")
    ]);
    if (!contextResponse.ok) {
      throw new Error(contextResponse.error || "Could not build autofill context.");
    }
    const preview = globalScope.JobmasterAutofill.previewAutofill(contextResponse.context);
    runtime.workflow = {
      state,
      analysis,
      job,
      context: contextResponse.context,
      preview,
      trackedJob: trackedJobResponse.ok ? trackedJobResponse.job : null,
      counts: countsResponse.ok ? countsResponse.counts || {} : {}
    };
    return runtime.workflow;
  }

  function workflowSubtitle(workflow) {
    return [
      workflow.analysis.platform,
      workflow.analysis.applicationFormDetected ? "application detected" : "metadata only",
      workflow.analysis.submissionState ? `state: ${workflow.analysis.submissionState}` : "",
      workflow.trackedJob ? `tracked as ${workflow.trackedJob.status}` : "not tracked yet"
    ]
      .filter(Boolean)
      .join(" · ");
  }

  function renderEntry(container, entry, mode) {
    const item = document.createElement("div");
    item.className = "jm-assistant-item";
    const answerLine = entry.selectedAnswerPreview ? `Suggested: ${entry.selectedAnswerPreview}` : "No answer drafted yet.";
    item.innerHTML = `
      <strong>${entry.label}</strong>
      <span>${entry.kind}${entry.sectionPath ? ` · ${entry.sectionPath}` : ""}</span>
      <span>${entry.reason || entry.skipReason || "No match reason recorded."}</span>
      <span>${answerLine}</span>
    `;
    const actions = document.createElement("div");
    actions.className = "jm-assistant-inline-actions";

    if (mode === "review" && cleanText(entry.selectedAnswer)) {
      const useButton = document.createElement("button");
      useButton.type = "button";
      useButton.className = "jm-button";
      useButton.textContent = "Use Suggestion";
      useButton.dataset.action = "fill-one";
      useButton.dataset.fieldId = entry.fieldId;
      useButton.dataset.answer = entry.selectedAnswer;
      actions.append(useButton);
    }

    if (
      runtime.workflow?.context?.autofillSettings?.aiFallbackEnabled &&
      ["review", "skip"].includes(mode) &&
      ["text", "textarea", "select", "radio-group"].includes(entry.kind)
    ) {
      const aiButton = document.createElement("button");
      aiButton.type = "button";
      aiButton.className = "jm-button jm-button-secondary";
      aiButton.textContent = "AI Draft";
      aiButton.dataset.action = "ai-one";
      aiButton.dataset.fieldId = entry.fieldId;
      actions.append(aiButton);
    }

    if (actions.childElementCount) {
      item.append(actions);
    }
    container.append(item);
  }

  function renderWorkflow() {
    const workflow = runtime.workflow;
    const panel = ensurePanel();
    panel.querySelector("#jm-assistant-subtitle").textContent = workflowSubtitle(workflow);
    panel.querySelector("#jm-count-fill").textContent = String(workflow.preview.filled.length);
    panel.querySelector("#jm-count-review").textContent = String(workflow.preview.review.length);
    panel.querySelector("#jm-count-skip").textContent = String(workflow.preview.skipped.length);
    panel.querySelector("#jm-assistant-note").textContent = [
      `${workflow.job.title} at ${workflow.job.company}`,
      workflow.job.location || "",
      workflow.preview.metrics?.scanDurationMs ? `${workflow.preview.metrics.scanDurationMs}ms scan` : ""
    ]
      .filter(Boolean)
      .join(" · ");
    panel.querySelector("#jm-assistant-workflow").textContent = [
      workflow.trackedJob ? `Tracked status: ${workflow.trackedJob.status}.` : "This page has not been saved to the tracker yet.",
      workflow.analysis.submissionState === "review"
        ? "The form looks close to submission, so this is a good time to review the remaining fields."
        : "Fill the high-confidence fields first, then use review or AI draft actions for the remaining questions.",
      workflow.context.autofillSettings?.aiFallbackEnabled
        ? "Built-in AI drafting is enabled."
        : "Built-in AI drafting is off in Settings."
    ].join(" ");

    const fillList = panel.querySelector("#jm-list-fill");
    const reviewList = panel.querySelector("#jm-list-review");
    const skipList = panel.querySelector("#jm-list-skip");
    fillList.innerHTML = "";
    reviewList.innerHTML = "";
    skipList.innerHTML = "";

    if (!workflow.preview.filled.length) {
      fillList.textContent = "No high-confidence fields are ready yet.";
    } else {
      workflow.preview.filled.slice(0, 14).forEach((entry) => renderEntry(fillList, entry, "fill"));
    }

    if (!workflow.preview.review.length) {
      reviewList.textContent = "Nothing is waiting for review.";
    } else {
      workflow.preview.review.slice(0, 14).forEach((entry) => renderEntry(reviewList, entry, "review"));
    }

    if (!workflow.preview.skipped.length) {
      skipList.textContent = "No skipped fields right now.";
    } else {
      workflow.preview.skipped.slice(0, 14).forEach((entry) => renderEntry(skipList, entry, "skip"));
    }
  }

  async function refreshWorkflow(statusMessage = "") {
    const panel = ensurePanel();
    panel.querySelector("#jm-assistant-subtitle").textContent = statusMessage || "Refreshing analysis…";
    await buildWorkflow();
    renderWorkflow();
  }

  async function ensureTrackedJob() {
    if (runtime.workflow?.trackedJob) {
      return runtime.workflow.trackedJob;
    }
    const response = await sendExtension("jobmaster:save-job", {
      job: runtime.workflow.job
    });
    if (!response.ok) {
      throw new Error(response.error || "Could not save current job.");
    }
    runtime.workflow.trackedJob = response.job;
    return response.job;
  }

  async function handleFillSuggested() {
    const panel = ensurePanel();
    panel.querySelector("#jm-assistant-subtitle").textContent = "Filling high-confidence fields…";
    const result = await globalScope.JobmasterAutofill.runAutofill(runtime.workflow.context);
    await sendExtension("jobmaster:record-scan-run", {
      scanRun: {
        platform: result.metrics?.platform || runtime.workflow.analysis.platform || "unknown",
        tabUrl: window.location.href,
        jobTitle: runtime.workflow.job.title || "",
        company: runtime.workflow.job.company || "",
        metrics: result.metrics || {},
        skippedLabels: (result.skipped || []).slice(0, 5).map((entry) => entry.label || entry),
        classifiedPreview: (result.matches || []).slice(0, 5)
      }
    });
    await refreshWorkflow(`Filled ${result.filled.length} fields. ${result.review.length} still need review.`);
  }

  async function handleFillOne(fieldId, answer) {
    await globalScope.JobmasterAutofill.fillCustomAnswers(runtime.workflow.context, {
      [fieldId]: answer
    });
    await refreshWorkflow("Applied the selected answer.");
  }

  async function handleAiOne(fieldId) {
    if (!runtime.workflow.context.autofillSettings?.aiFallbackEnabled) {
      throw new Error("Enable built-in AI drafting in Settings first.");
    }
    const panel = ensurePanel();
    panel.querySelector("#jm-assistant-subtitle").textContent = "Generating an AI draft…";
    const draft = await globalScope.JobmasterAutofill.generateAiAnswer(runtime.workflow.context, fieldId);
    if (!cleanText(draft.answer)) {
      throw new Error("AI did not find enough evidence to draft a truthful answer.");
    }
    await globalScope.JobmasterAutofill.fillCustomAnswers(runtime.workflow.context, {
      [fieldId]: draft.answer
    });
    await refreshWorkflow("Applied an AI draft using the current candidate data.");
  }

  async function handleAiAll() {
    if (!runtime.workflow.context.autofillSettings?.aiFallbackEnabled) {
      throw new Error("Enable built-in AI drafting in Settings first.");
    }
    const eligible = [...runtime.workflow.preview.review, ...runtime.workflow.preview.skipped]
      .filter((entry) => ["text", "textarea", "select", "radio-group"].includes(entry.kind))
      .slice(0, 6);
    if (!eligible.length) {
      throw new Error("There are no eligible review fields for AI drafting right now.");
    }
    const answers = {};
    const panel = ensurePanel();
    panel.querySelector("#jm-assistant-subtitle").textContent = "Drafting missing answers with built-in AI…";
    for (const entry of eligible) {
      const draft = await globalScope.JobmasterAutofill.generateAiAnswer(runtime.workflow.context, entry.fieldId);
      if (cleanText(draft.answer)) {
        answers[entry.fieldId] = draft.answer;
      }
    }
    if (!Object.keys(answers).length) {
      throw new Error("AI could not draft answers from the current candidate data.");
    }
    await globalScope.JobmasterAutofill.fillCustomAnswers(runtime.workflow.context, answers);
    await refreshWorkflow(`Applied ${Object.keys(answers).length} AI-generated answers.`);
  }

  async function handleSaveJob() {
    const tracked = await ensureTrackedJob();
    runtime.workflow.trackedJob = tracked;
    await refreshWorkflow(`Saved ${tracked.title} at ${tracked.company} to the tracker.`);
  }

  async function handleSubmitted() {
    const tracked = await ensureTrackedJob();
    const response = await sendExtension("jobmaster:update-job-status", {
      jobId: tracked.id,
      status: "submitted"
    });
    if (!response.ok) {
      throw new Error(response.error || "Could not mark the job as submitted.");
    }
    runtime.workflow.trackedJob = response.job;
    await refreshWorkflow("Marked the job as submitted.");
  }

  async function handlePanelClick(event) {
    const button = event.target?.closest?.("[data-action]");
    if (!button) {
      return;
    }
    const action = button.dataset.action;
    try {
      if (action === "close") {
        closeAssistant();
        return;
      }
      if (action === "refresh") {
        await refreshWorkflow();
        return;
      }
      if (action === "fill") {
        await handleFillSuggested();
        return;
      }
      if (action === "save") {
        await handleSaveJob();
        return;
      }
      if (action === "submitted") {
        await handleSubmitted();
        return;
      }
      if (action === "tracker") {
        await sendExtension("jobmaster:open-dashboard");
        return;
      }
      if (action === "fill-one") {
        await handleFillOne(button.dataset.fieldId, button.dataset.answer);
        return;
      }
      if (action === "ai-one") {
        await handleAiOne(button.dataset.fieldId);
        return;
      }
      if (action === "ai-all") {
        await handleAiAll();
      }
    } catch (error) {
      const panel = ensurePanel();
      panel.querySelector("#jm-assistant-subtitle").textContent = error instanceof Error ? error.message : String(error);
    }
  }

  async function openAssistant() {
    installSubmitWatcher();
    ensurePanel();
    await refreshWorkflow();
  }

  function closeAssistant() {
    if (runtime.panel) {
      runtime.panel.remove();
      runtime.panel = null;
    }
    removeMinibar();
  }

  globalScope.JobmasterAssistant = {
    open: openAssistant,
    close: closeAssistant
  };
})(globalThis);
