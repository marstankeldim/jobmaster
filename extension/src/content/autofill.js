(function attachAutofill(globalScope) {
  const YES_WORDS = new Set(["yes", "true", "1"]);
  const NO_WORDS = new Set(["no", "false", "0"]);
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

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
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

  function classifyField(field) {
    const text = normalize(
      [
        field.labelText,
        field.name,
        field.placeholder,
        field.ariaLabel,
        field.autocomplete,
        field.id
      ].join(" ")
    );
    if (!text) {
      return { taxonomyKey: null, confidence: 0 };
    }
    for (const rule of FIELD_TAXONOMY_RULES) {
      if (rule.pattern.test(text)) {
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

  function scanFields(root = document, labelIndex = new Map()) {
    const rawFields = [...root.querySelectorAll("input, textarea, select")];
    const potentialFields = rawFields.filter(isPotentiallyRelevant);
    const visibleFields = potentialFields.filter(isVisible);

    const scannedFields = visibleFields.map((element) => {
      const baseField = {
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
      const classification = classifyField(baseField);
      return { ...baseField, ...classification };
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

  function customAnswerMatch(fieldText, answersData) {
    const normalizedField = normalize(fieldText);
    const fieldTokens = normalizedField.split(" ");
    let best = null;
    for (const item of answersData.answers || []) {
      const candidates = [item.question, ...(item.aliases || [])];
      let score = 0;
      for (const candidate of candidates) {
        const normalizedCandidate = normalize(candidate);
        if (!normalizedCandidate) {
          continue;
        }
        if (normalizedField.includes(normalizedCandidate)) {
          score = Math.max(score, normalizedCandidate.length);
        } else {
          const overlap = normalizedCandidate.split(" ").filter((token) => fieldTokens.includes(token)).length;
          score = Math.max(score, overlap * 5);
        }
      }
      if (score > 0 && String(item.answer || "").trim()) {
        if (!best || score > best.score) {
          best = { answer: String(item.answer).trim(), score, reason: `custom match: ${item.question}` };
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

  function chooseAnswer(field, profile, answersData, coverLetter) {
    const fieldText = [field.labelText, field.name, field.placeholder, field.ariaLabel, field.autocomplete, field.id]
      .map(cleanText)
      .join(" ");
    const taxonomyAnswers = profileTaxonomyAnswers(profile, coverLetter);

    if (field.taxonomyKey && taxonomyAnswers[field.taxonomyKey]) {
      return {
        answer: String(taxonomyAnswers[field.taxonomyKey]),
        reason: `taxonomy match: ${field.taxonomyKey}`,
        confidence: field.confidence ?? 0.95
      };
    }

    const custom = customAnswerMatch(fieldText, answersData);
    if (custom) {
      return custom;
    }

    if (field.type === "email" && profile.email) {
      return { answer: profile.email, reason: "email input" };
    }
    if ((field.type === "tel" || field.type === "phone") && profile.phone) {
      return { answer: profile.phone, reason: "phone input" };
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

  function resolveRootMatch() {
    const adapter = globalScope.JobmasterPlatforms.detectPlatform(window.location);
    return globalScope.JobmasterPlatforms.resolveApplicationRoot(adapter, document);
  }

  async function runAutofill(context) {
    const startedAt = performance.now();
    const rootMatch = resolveRootMatch();
    const labelIndex = buildLabelIndex(rootMatch.node);
    const { fields, metrics } = scanFields(rootMatch.node, labelIndex);
    const filled = [];
    const skipped = [];
    const classified = [];

    for (const field of fields) {
      const candidate = chooseAnswer(field, context.profile, context.answers, context.coverLetterText);
      const label = field.labelText || field.name || field.id || field.placeholder || "<unnamed>";
      classified.push({
        label,
        taxonomyKey: field.taxonomyKey,
        confidence: field.confidence ?? 0,
        matched: Boolean(candidate)
      });
      if (!candidate || !String(candidate.answer).trim()) {
        skipped.push(label);
        continue;
      }

      try {
        if (field.type === "file") {
          const ok = await setResumeFile(field.element, context.resumeAsset);
          if (ok) {
            filled.push(`${label} <- resume`);
          } else {
            skipped.push(`${label} (no stored resume)`);
          }
          continue;
        }

        if (field.tag === "select") {
          const option = chooseSelectOption(candidate.answer, field);
          if (!option) {
            skipped.push(`${label} (no select match)`);
            continue;
          }
          setNativeValue(field.element, option);
          filled.push(`${label} <- ${candidate.reason}`);
          continue;
        }

        if (field.type === "checkbox") {
          const normalizedAnswer = normalize(candidate.answer);
          if (YES_WORDS.has(normalizedAnswer)) {
            setChecked(field.element, true);
            filled.push(`${label} <- checked`);
          } else if (NO_WORDS.has(normalizedAnswer)) {
            skipped.push(`${label} (left unchecked)`);
          } else {
            skipped.push(`${label} (checkbox ambiguous)`);
          }
          continue;
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
            filled.push(`${label} <- ${candidate.reason}`);
          } else {
            skipped.push(`${label} (radio mismatch)`);
          }
          continue;
        }

        field.element.focus();
        setNativeValue(field.element, candidate.answer);
        filled.push(`${label} <- ${candidate.reason}`);
      } catch (error) {
        skipped.push(`${label} (${error instanceof Error ? error.message : String(error)})`);
      }
    }

    const result = {
      filled,
      skipped,
      metrics: {
        ...metrics,
        platform: globalScope.JobmasterPlatforms.detectPlatform(window.location).name,
        rootSelectorUsed: rootMatch.selector,
        fieldCountMatched: classified.filter((item) => item.matched).length,
        fieldCountClassified: classified.filter((item) => item.taxonomyKey).length,
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
