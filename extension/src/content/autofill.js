(function attachAutofill(globalScope) {
  const YES_WORDS = new Set(["yes", "true", "1"]);
  const NO_WORDS = new Set(["no", "false", "0"]);
  const SCAN_OBSERVER_ATTRIBUTE_FILTER = ["class", "style", "hidden", "aria-hidden", "disabled"];
  const FIELD_TAXONOMY_RULES = [
    { key: "full_name", pattern: /full.?name|your name|applicant name|legal name/ },
    { key: "preferred_name", pattern: /preferred name|nickname/ },
    { key: "email", pattern: /email|e-mail/ },
    { key: "phone", pattern: /phone|mobile|cell/ },
    { key: "address_line_1", pattern: /address line 1|street address|mailing address/ },
    { key: "address_line_2", pattern: /address line 2|apartment|suite|unit/ },
    { key: "city", pattern: /\bcity\b/ },
    { key: "state_region", pattern: /state|province|region/ },
    { key: "postal_code", pattern: /zip|postal code/ },
    { key: "country", pattern: /country/ },
    { key: "location", pattern: /city state|location/ },
    { key: "linkedin", pattern: /linkedin/ },
    { key: "github", pattern: /github/ },
    { key: "website", pattern: /portfolio|website|personal site/ },
    { key: "resume", pattern: /resume|cv/ },
    { key: "work_authorization", pattern: /work authorization|authorized to work|eligible to work/ },
    { key: "sponsorship", pattern: /sponsorship|visa/ },
    { key: "requires_relocation", pattern: /relocation|willing to relocate/ },
    { key: "citizenship", pattern: /citizenship|citizen/ },
    { key: "security_clearance", pattern: /clearance|security clearance/ },
    { key: "notice_period", pattern: /notice period/ },
    { key: "current_title", pattern: /current title|job title|present title/ },
    { key: "current_company", pattern: /current company|employer/ },
    { key: "years_experience", pattern: /years of experience|experience in years/ },
    { key: "highest_degree", pattern: /degree|highest degree|education level/ },
    { key: "school", pattern: /school|university|college/ },
    { key: "graduation_date", pattern: /graduation|grad date/ },
    { key: "salary_expectation", pattern: /salary|compensation|pay expectation/ },
    { key: "available_start_date", pattern: /start date|available to start|availability/ },
    { key: "preferred_workplace", pattern: /remote|hybrid|onsite|work arrangement/ },
    { key: "languages_spoken", pattern: /language|languages spoken/ },
    { key: "pronouns", pattern: /pronouns/ },
    { key: "gender", pattern: /gender/ },
    { key: "veteran_status", pattern: /veteran/ },
    { key: "disability_status", pattern: /disability/ },
    { key: "race_ethnicity", pattern: /ethnicity|race/ },
    { key: "summary", pattern: /summary|about you|about yourself/ },
    { key: "top_skills", pattern: /skills|tech stack|strengths/ },
    { key: "cover_letter", pattern: /cover letter/ }
  ];
  const scanRuntime = {
    observedRoot: null,
    observer: null,
    mutationVersion: 0,
    cachedScan: null
  };

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function toAnswerString(value) {
    if (Array.isArray(value)) {
      return cleanText(value.filter(Boolean).join(", "));
    }
    return cleanText(value);
  }

  function previewValue(value, maxLength = 72) {
    const text = cleanText(value);
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength - 1)}…`;
  }

  function isPotentiallyRelevant(element) {
    if (!element || element.disabled || element.hidden) {
      return false;
    }
    if (element.closest("[hidden],[aria-hidden='true']")) {
      return false;
    }
    const type = (element.getAttribute("type") || "").toLowerCase();
    if (type === "hidden") {
      return false;
    }
    return true;
  }

  function isVisible(element) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function buildLabelIndex(root = document) {
    const index = new Map();
    for (const label of root.querySelectorAll("label")) {
      const text = cleanText(label.innerText);
      if (!text) {
        continue;
      }
      const htmlFor = label.getAttribute("for");
      if (htmlFor) {
        const list = index.get(htmlFor) || [];
        list.push(text);
        index.set(htmlFor, list);
      }
      const nestedControl = label.querySelector("input, textarea, select");
      if (nestedControl?.id) {
        const list = index.get(nestedControl.id) || [];
        list.push(text);
        index.set(nestedControl.id, list);
      }
    }
    return index;
  }

  function getFieldLabel(element, labelIndex) {
    const chunks = [];
    if (element.id && labelIndex.has(element.id)) {
      chunks.push(...labelIndex.get(element.id));
    }
    if (element.labels) {
      for (const label of element.labels) {
        chunks.push(cleanText(label.innerText));
      }
    }
    const parentLabel = element.closest("label");
    if (parentLabel) {
      chunks.push(cleanText(parentLabel.innerText));
    }
    const fieldset = element.closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend) {
        chunks.push(cleanText(legend.innerText));
      }
    }
    return [...new Set(chunks.filter(Boolean))].join(" | ");
  }

  function profileTaxonomyAnswers(profile, coverLetter) {
    return {
      full_name: profile.full_name,
      preferred_name: profile.preferred_name || profile.full_name,
      email: profile.email,
      phone: profile.phone,
      address_line_1: profile.address_line_1 || profile.location,
      address_line_2: profile.address_line_2,
      city: profile.city || profile.location,
      state_region: profile.state_region,
      postal_code: profile.postal_code,
      country: profile.country,
      location: profile.location,
      linkedin: profile.linkedin,
      github: profile.github,
      website: profile.portfolio || profile.personal_website || profile.github,
      resume: profile.resume_path,
      work_authorization: profile.work_authorization,
      sponsorship: profile.sponsorship_needed,
      requires_relocation: profile.requires_relocation,
      citizenship: profile.citizenship,
      security_clearance: profile.security_clearance,
      notice_period: profile.notice_period,
      current_title: profile.current_title,
      current_company: profile.current_company,
      years_experience: profile.years_experience,
      highest_degree: profile.highest_degree,
      school: profile.school,
      graduation_date: profile.graduation_date,
      salary_expectation: profile.salary_expectation,
      available_start_date: profile.available_start_date,
      preferred_workplace: profile.preferred_workplace,
      languages_spoken: profile.languages_spoken,
      pronouns: profile.pronouns,
      gender: profile.gender,
      veteran_status: profile.veteran_status,
      disability_status: profile.disability_status,
      race_ethnicity: profile.race_ethnicity,
      summary: profile.summary,
      top_skills: profile.top_skills,
      cover_letter: coverLetter
    };
  }

  function buildMatcherContext(profile, answersData, coverLetter) {
    const taxonomyAnswers = {};
    for (const [key, value] of Object.entries(profileTaxonomyAnswers(profile, coverLetter))) {
      const text = toAnswerString(value);
      if (text) {
        taxonomyAnswers[key] = text;
      }
    }

    const customAnswers = (answersData?.answers || [])
      .map((item) => {
        const answer = toAnswerString(item.answer);
        const candidates = [item.question, ...(item.aliases || [])]
          .map(normalize)
          .filter(Boolean);
        return {
          answer,
          question: cleanText(item.question),
          candidates,
          tokenSets: candidates.map((candidate) => candidate.split(" ").filter(Boolean))
        };
      })
      .filter((item) => item.answer && item.candidates.length);

    return { taxonomyAnswers, customAnswers };
  }

  function classifyField(field, adapter) {
    const adapterClassification = adapter?.classifyField?.(field);
    if (adapterClassification?.taxonomyKey) {
      return adapterClassification;
    }
    if (!field.searchTextNormalized) {
      return { taxonomyKey: null, confidence: 0 };
    }
    for (const rule of FIELD_TAXONOMY_RULES) {
      if (rule.pattern.test(field.searchTextNormalized)) {
        return { taxonomyKey: rule.key, confidence: 0.95 };
      }
    }
    if (field.type === "email") {
      return { taxonomyKey: "email", confidence: 0.9 };
    }
    if (field.type === "tel") {
      return { taxonomyKey: "phone", confidence: 0.9 };
    }
    if (field.type === "file") {
      return { taxonomyKey: "resume", confidence: 0.95 };
    }
    return { taxonomyKey: null, confidence: 0 };
  }

  function scanFields(root = document, labelIndex = new Map(), adapter = null) {
    const rawFields = [...root.querySelectorAll("input, textarea, select")];
    const potentialFields = rawFields.filter(isPotentiallyRelevant);
    const visibleFields = potentialFields.filter(isVisible);

    const scannedFields = visibleFields.map((element) => {
      const field = {
        element,
        tag: element.tagName.toLowerCase(),
        type: (element.getAttribute("type") || "").toLowerCase(),
        name: element.getAttribute("name") || "",
        id: element.id || "",
        placeholder: element.getAttribute("placeholder") || "",
        ariaLabel: element.getAttribute("aria-label") || "",
        autocomplete: element.getAttribute("autocomplete") || "",
        labelText: getFieldLabel(element, labelIndex),
        options:
          element.tagName.toLowerCase() === "select"
            ? [...element.options].map((option) => ({
                label: cleanText(option.label || option.textContent),
                value: option.value || ""
              }))
            : []
      };
      const searchText = cleanText(
        [field.labelText, field.name, field.placeholder, field.ariaLabel, field.autocomplete, field.id].join(" ")
      );
      const nextField = {
        ...field,
        searchText,
        searchTextNormalized: normalize(searchText)
      };
      return { ...nextField, ...classifyField(nextField, adapter) };
    });

    return {
      fields: scannedFields,
      metrics: {
        fieldCountRaw: rawFields.length,
        fieldCountPotential: potentialFields.length,
        fieldCountVisible: visibleFields.length
      }
    };
  }

  function customAnswerMatch(field, customAnswers) {
    const fieldTokens = field.searchTextNormalized.split(" ").filter(Boolean);
    let best = null;
    for (const item of customAnswers) {
      let score = 0;
      for (let index = 0; index < item.candidates.length; index += 1) {
        const candidate = item.candidates[index];
        if (field.searchTextNormalized.includes(candidate)) {
          score = Math.max(score, candidate.length + 15);
          continue;
        }
        const overlap = item.tokenSets[index].filter((token) => fieldTokens.includes(token)).length;
        score = Math.max(score, overlap * 5);
      }
      if (score > 0) {
        const confidence = Math.min(0.88, 0.45 + score / 60);
        if (!best || score > best.score) {
          best = {
            answer: item.answer,
            score,
            source: "custom",
            confidence,
            reason: item.question ? `custom match: ${item.question}` : "custom match"
          };
        }
      }
    }
    return best;
  }

  function chooseSelectOption(answer, field) {
    const normalizedAnswer = normalize(answer);
    for (const option of field.options) {
      if (normalize(option.label) === normalizedAnswer) {
        return option.value || option.label;
      }
    }
    for (const option of field.options) {
      const optionNormalized = normalize(option.label);
      if (optionNormalized.includes(normalizedAnswer) || normalizedAnswer.includes(optionNormalized)) {
        return option.value || option.label;
      }
    }
    if (YES_WORDS.has(normalizedAnswer)) {
      const option = field.options.find((item) => YES_WORDS.has(normalize(item.label)));
      return option ? option.value || option.label : null;
    }
    if (NO_WORDS.has(normalizedAnswer)) {
      const option = field.options.find((item) => NO_WORDS.has(normalize(item.label)));
      return option ? option.value || option.label : null;
    }
    return null;
  }

  function chooseAnswer(field, matcherContext) {
    if (field.taxonomyKey && matcherContext.taxonomyAnswers[field.taxonomyKey]) {
      return {
        answer: matcherContext.taxonomyAnswers[field.taxonomyKey],
        source: "taxonomy",
        reason: `taxonomy match: ${field.taxonomyKey}`,
        confidence: field.confidence ?? 0.95
      };
    }

    const custom = customAnswerMatch(field, matcherContext.customAnswers);
    if (custom) {
      return custom;
    }

    if (field.type === "email" && matcherContext.taxonomyAnswers.email) {
      return {
        answer: matcherContext.taxonomyAnswers.email,
        source: "fallback",
        reason: "email input",
        confidence: 0.75
      };
    }
    if ((field.type === "tel" || field.type === "phone") && matcherContext.taxonomyAnswers.phone) {
      return {
        answer: matcherContext.taxonomyAnswers.phone,
        source: "fallback",
        reason: "phone input",
        confidence: 0.75
      };
    }
    return null;
  }

  function dispatchInputEvents(element) {
    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: "", inputType: "insertText" }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function setNativeValue(element, value) {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : element instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor?.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
    dispatchInputEvents(element);
  }

  function setChecked(element, checked) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked");
    if (descriptor?.set) {
      descriptor.set.call(element, checked);
    } else {
      element.checked = checked;
    }
    dispatchInputEvents(element);
  }

  async function setResumeFile(input, resumeAsset) {
    if (!resumeAsset?.data) {
      return false;
    }
    const file = new File([resumeAsset.data], resumeAsset.name || "resume.pdf", {
      type: resumeAsset.type || "application/octet-stream",
      lastModified: resumeAsset.lastModified || Date.now()
    });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    dispatchInputEvents(input);
    return true;
  }

  function showToast(result) {
    const existing = document.getElementById("jobmaster-toast");
    if (existing) {
      existing.remove();
    }
    const toast = document.createElement("div");
    toast.id = "jobmaster-toast";
    toast.style.cssText = [
      "position:fixed",
      "right:20px",
      "bottom:20px",
      "z-index:2147483647",
      "max-width:360px",
      "padding:14px 16px",
      "border-radius:18px",
      "background:rgba(18, 35, 33, 0.94)",
      "color:white",
      "box-shadow:0 18px 40px rgba(0,0,0,0.25)",
      "font:13px/1.4 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    ].join(";");
    toast.innerHTML = `<strong style="display:block;margin-bottom:6px;">Jobmaster autofill</strong>
      Filled ${result.filled.length} fields. Skipped ${result.skipped.length}. Review the page before submitting.`;
    document.body.append(toast);
    setTimeout(() => toast.remove(), 4500);
  }

  function resolveScanTarget() {
    const adapter = globalScope.JobmasterPlatforms.detectPlatform(window.location);
    const rootMatch = globalScope.JobmasterPlatforms.resolveApplicationRoot(adapter, document);
    const stepMatch = globalScope.JobmasterPlatforms.resolveStepRoot(adapter, rootMatch);
    return { adapter, rootMatch, stepMatch };
  }

  function invalidateScanCache() {
    scanRuntime.mutationVersion += 1;
    scanRuntime.cachedScan = null;
  }

  function nodeTouchesRelevantFields(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    if (node.matches("input, textarea, select, label, fieldset, legend, option, form")) {
      return true;
    }
    return Boolean(node.querySelector?.("input, textarea, select, label"));
  }

  function mutationsAreMeaningful(mutations) {
    return mutations.some((mutation) => {
      if (mutation.type === "childList") {
        return [...mutation.addedNodes, ...mutation.removedNodes].some(nodeTouchesRelevantFields);
      }
      return nodeTouchesRelevantFields(mutation.target);
    });
  }

  function ensureScanObserver(root) {
    if (scanRuntime.observedRoot === root && scanRuntime.observer) {
      return;
    }
    if (scanRuntime.observer) {
      scanRuntime.observer.disconnect();
    }
    scanRuntime.observedRoot = root;
    scanRuntime.observer = new MutationObserver((mutations) => {
      if (mutationsAreMeaningful(mutations)) {
        invalidateScanCache();
      }
    });
    scanRuntime.observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: SCAN_OBSERVER_ATTRIBUTE_FILTER
    });
    invalidateScanCache();
  }

  function buildScanSnapshot(scanTarget) {
    const labelIndex = buildLabelIndex(scanTarget.stepMatch.node);
    const snapshot = scanFields(scanTarget.stepMatch.node, labelIndex, scanTarget.adapter);
    return {
      ...snapshot,
      rootNode: scanTarget.rootMatch.node,
      stepNode: scanTarget.stepMatch.node,
      rootSelectorUsed: scanTarget.rootMatch.selector,
      stepSelectorUsed: scanTarget.stepMatch.selector
    };
  }

  function getScanSnapshot(scanTarget) {
    const cached = scanRuntime.cachedScan;
    if (
      cached &&
      cached.rootNode === scanTarget.rootMatch.node &&
      cached.stepNode === scanTarget.stepMatch.node &&
      cached.mutationVersion === scanRuntime.mutationVersion
    ) {
      return { ...cached.snapshot, cacheHit: true };
    }
    const snapshot = buildScanSnapshot(scanTarget);
    scanRuntime.cachedScan = {
      rootNode: scanTarget.rootMatch.node,
      stepNode: scanTarget.stepMatch.node,
      mutationVersion: scanRuntime.mutationVersion,
      snapshot
    };
    return { ...snapshot, cacheHit: false };
  }

  async function fillField(field, candidate, resumeAsset) {
    if (field.type === "file") {
      const ok = await setResumeFile(field.element, resumeAsset);
      if (ok) {
        return { filled: true, message: "resume" };
      }
      return { filled: false, skippedReason: "no stored resume" };
    }

    if (field.tag === "select") {
      const option = chooseSelectOption(candidate.answer, field);
      if (!option) {
        return { filled: false, skippedReason: "no select match" };
      }
      setNativeValue(field.element, option);
      return { filled: true, message: candidate.reason };
    }

    if (field.type === "checkbox") {
      const normalizedAnswer = normalize(candidate.answer);
      if (YES_WORDS.has(normalizedAnswer)) {
        setChecked(field.element, true);
        return { filled: true, message: "checked" };
      }
      if (NO_WORDS.has(normalizedAnswer)) {
        setChecked(field.element, false);
        return { filled: true, message: "unchecked" };
      }
      return { filled: false, skippedReason: "checkbox ambiguous" };
    }

    if (field.type === "radio") {
      const normalizedAnswer = normalize(candidate.answer);
      const radioValue = normalize(field.element.value);
      const radioLabel = normalize(field.labelText);
      if (
        radioValue === normalizedAnswer ||
        normalizedAnswer.includes(radioValue) ||
        radioLabel.includes(normalizedAnswer)
      ) {
        setChecked(field.element, true);
        return { filled: true, message: candidate.reason };
      }
      return { filled: false, skippedReason: "radio mismatch" };
    }

    field.element.focus();
    setNativeValue(field.element, candidate.answer);
    return { filled: true, message: candidate.reason };
  }

  async function runAutofill(context) {
    const startedAt = performance.now();
    const scanTarget = resolveScanTarget();
    ensureScanObserver(scanTarget.rootMatch.node);
    const scanSnapshot = getScanSnapshot(scanTarget);
    const matcherContext = buildMatcherContext(context.profile, context.answers, context.coverLetterText);
    const filled = [];
    const skipped = [];
    const classified = [];

    for (const field of scanSnapshot.fields) {
      const candidate = chooseAnswer(field, matcherContext);
      const label = field.labelText || field.name || field.id || field.placeholder || "<unnamed>";
      const entry = {
        label,
        taxonomyKey: field.taxonomyKey,
        confidence: candidate?.confidence ?? field.confidence ?? 0,
        matched: Boolean(candidate),
        source: candidate?.source || "",
        matchReason: candidate?.reason || "",
        action: "skipped",
        skippedReason: "",
        answerPreview: candidate?.answer ? previewValue(candidate.answer) : ""
      };

      if (!candidate || !String(candidate.answer).trim()) {
        entry.skippedReason = "no answer match";
        skipped.push(label);
        classified.push(entry);
        continue;
      }

      try {
        const outcome = await fillField(field, candidate, context.resumeAsset);
        if (outcome.filled) {
          entry.action = "filled";
          filled.push(`${label} <- ${outcome.message}`);
        } else {
          entry.skippedReason = outcome.skippedReason || "not filled";
          skipped.push(`${label} (${entry.skippedReason})`);
        }
      } catch (error) {
        entry.skippedReason = error instanceof Error ? error.message : String(error);
        skipped.push(`${label} (${entry.skippedReason})`);
      }
      classified.push(entry);
    }

    const matchBreakdown = classified.reduce((accumulator, item) => {
      if (!item.source) {
        return accumulator;
      }
      accumulator[item.source] = (accumulator[item.source] || 0) + 1;
      return accumulator;
    }, {});

    const result = {
      filled,
      skipped,
      metrics: {
        ...scanSnapshot.metrics,
        platform: scanTarget.adapter.name,
        rootSelectorUsed: scanSnapshot.rootSelectorUsed,
        stepSelectorUsed: scanSnapshot.stepSelectorUsed,
        fieldCountMatched: classified.filter((item) => item.matched).length,
        fieldCountClassified: classified.filter((item) => item.taxonomyKey).length,
        fieldCountFilled: filled.length,
        fieldCountSkipped: skipped.length,
        cacheHit: scanSnapshot.cacheHit,
        mutationVersion: scanRuntime.mutationVersion,
        matchBreakdown,
        scanDurationMs: Math.round(performance.now() - startedAt)
      },
      classified
    };
    showToast(result);
    return result;
  }

  globalScope.JobmasterAutofill = {
    runAutofill
  };
})(globalThis);
