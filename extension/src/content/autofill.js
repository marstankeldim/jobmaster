(function attachAutofill(globalScope) {
  const YES_WORDS = new Set(["yes", "true", "1"]);
  const NO_WORDS = new Set(["no", "false", "0"]);

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isVisible(element) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function getFieldLabel(element) {
    const chunks = [];
    if (element.labels) {
      for (const label of element.labels) {
        chunks.push(cleanText(label.innerText));
      }
    }
    if (element.id) {
      for (const label of document.querySelectorAll(`label[for="${CSS.escape(element.id)}"]`)) {
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

  function scanFields(root = document) {
    return [...root.querySelectorAll("input, textarea, select")]
      .filter((element) => isVisible(element) && !element.disabled)
      .map((element) => ({
        element,
        tag: element.tagName.toLowerCase(),
        type: (element.getAttribute("type") || "").toLowerCase(),
        name: element.getAttribute("name") || "",
        id: element.id || "",
        placeholder: element.getAttribute("placeholder") || "",
        ariaLabel: element.getAttribute("aria-label") || "",
        autocomplete: element.getAttribute("autocomplete") || "",
        labelText: getFieldLabel(element),
        options:
          element.tagName.toLowerCase() === "select"
            ? [...element.options].map((option) => ({
                label: cleanText(option.label || option.textContent),
                value: option.value || ""
              }))
            : []
      }));
  }

  function profileAnswerMap(profile, coverLetter) {
    return [
      [/full.?name|your name|applicant name|legal name/, profile.full_name],
      [/preferred name|nickname/, profile.preferred_name || profile.full_name],
      [/email|e-mail/, profile.email],
      [/phone|mobile|cell/, profile.phone],
      [/address line 1|street address|address/, profile.address_line_1 || profile.location],
      [/address line 2|apartment|suite|unit/, profile.address_line_2],
      [/city/, profile.city || profile.location],
      [/state|province|region/, profile.state_region],
      [/zip|postal code/, profile.postal_code],
      [/country/, profile.country],
      [/city state|location/, profile.location],
      [/linkedin/, profile.linkedin],
      [/github/, profile.github],
      [/portfolio|website|personal site/, profile.portfolio || profile.personal_website || profile.github],
      [/resume|cv/, profile.resume_path],
      [/work authorization|authorized to work|eligible to work/, profile.work_authorization],
      [/sponsorship|visa/, profile.sponsorship_needed],
      [/relocation|willing to relocate/, profile.requires_relocation],
      [/citizenship|citizen/, profile.citizenship],
      [/clearance|security clearance/, profile.security_clearance],
      [/notice period/, profile.notice_period],
      [/current title|job title|present title/, profile.current_title],
      [/current company|employer/, profile.current_company],
      [/years of experience|experience in years/, profile.years_experience],
      [/degree|highest degree|education level/, profile.highest_degree],
      [/school|university|college/, profile.school],
      [/graduation|grad date/, profile.graduation_date],
      [/salary|compensation|pay expectation/, profile.salary_expectation],
      [/start date|available to start|notice period|availability/, profile.available_start_date],
      [/remote|hybrid|onsite|work arrangement/, profile.preferred_workplace],
      [/language|languages spoken/, profile.languages_spoken],
      [/pronouns/, profile.pronouns],
      [/gender/, profile.gender],
      [/veteran/, profile.veteran_status],
      [/disability/, profile.disability_status],
      [/ethnicity|race/, profile.race_ethnicity],
      [/summary|about you|about yourself/, profile.summary],
      [/skills|tech stack|strengths/, profile.top_skills],
      [/cover letter/, coverLetter]
    ];
  }

  function customAnswerMatch(fieldText, answersData) {
    const normalizedField = normalize(fieldText);
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
          const overlap = normalizedCandidate
            .split(" ")
            .filter((token) => normalizedField.split(" ").includes(token)).length;
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
    const fieldText = [
      field.labelText,
      field.name,
      field.placeholder,
      field.ariaLabel,
      field.autocomplete,
      field.id
    ]
      .map(cleanText)
      .join(" ");
    const normalizedField = normalize(fieldText);
    if (!normalizedField) {
      return null;
    }
    if (field.type === "file" && profile.resume_path) {
      return { answer: profile.resume_path, reason: "resume upload" };
    }
    const custom = customAnswerMatch(fieldText, answersData);
    if (custom) {
      return custom;
    }
    if (field.tag === "textarea" && normalizedField.includes("cover letter")) {
      return { answer: coverLetter, reason: "cover letter field" };
    }
    for (const [pattern, value] of profileAnswerMap(profile, coverLetter)) {
      if (value && pattern.test(normalizedField)) {
        return { answer: String(value), reason: `profile match: ${pattern}` };
      }
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

  async function runAutofill(context) {
    const fields = scanFields(document);
    const filled = [];
    const skipped = [];

    for (const field of fields) {
      const candidate = chooseAnswer(field, context.profile, context.answers, context.coverLetterText);
      const label = field.labelText || field.name || field.id || field.placeholder || "<unnamed>";
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

    const result = { filled, skipped };
    showToast(result);
    return result;
  }

  globalScope.JobmasterAutofill = {
    runAutofill
  };
})(globalThis);
