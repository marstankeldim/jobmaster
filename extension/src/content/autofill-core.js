(function attachAutofillCore(globalScope) {
  const BOOLEAN_TRUE = new Set(["yes", "true", "1"]);
  const BOOLEAN_FALSE = new Set(["no", "false", "0"]);
  const POLICY_BUCKET_KEYS = new Set([
    "gender",
    "veteran_status",
    "disability_status",
    "race_ethnicity",
    "pronouns"
  ]);
  const AUTOCOMPLETE_TOKEN_MAP = {
    name: ["full_name"],
    "given-name": ["given_name"],
    "additional-name": ["middle_name"],
    "family-name": ["family_name"],
    email: ["email"],
    tel: ["tel"],
    "street-address": ["address_line1"],
    "address-line1": ["address_line1"],
    "address-line2": ["address_line2"],
    "address-level2": ["city"],
    "address-level1": ["state_region"],
    "postal-code": ["postal_code"],
    country: ["country"],
    "country-name": ["country"],
    url: ["website_url"],
    "organization-title": ["current_title"],
    organization: ["current_company"]
  };
  const HEURISTIC_RULES = [
    { key: "full_name", patterns: [/full name/, /\bname\b/, /legal name/], confidence: 0.8 },
    { key: "given_name", patterns: [/first name/, /given name/], confidence: 0.88 },
    { key: "family_name", patterns: [/last name/, /family name/, /surname/], confidence: 0.88 },
    { key: "email", patterns: [/e mail/, /\bemail\b/], confidence: 0.92 },
    { key: "tel", patterns: [/phone/, /mobile/, /cell/], confidence: 0.9 },
    { key: "address_line1", patterns: [/street address/, /address line 1/, /mailing address/], confidence: 0.9 },
    { key: "address_line2", patterns: [/address line 2/, /apartment/, /suite/, /unit/], confidence: 0.88 },
    { key: "city", patterns: [/\bcity\b/], confidence: 0.86 },
    { key: "state_region", patterns: [/state/, /province/, /region/], confidence: 0.84 },
    { key: "postal_code", patterns: [/zip/, /postal code/], confidence: 0.88 },
    { key: "country", patterns: [/\bcountry\b/], confidence: 0.84 },
    { key: "linkedin_url", patterns: [/linkedin/], confidence: 0.96 },
    { key: "github_url", patterns: [/github/], confidence: 0.96 },
    { key: "website_url", patterns: [/portfolio/, /personal site/, /\bwebsite\b/, /\burl\b/], confidence: 0.82 },
    { key: "resume_file", patterns: [/resume/, /\bcv\b/, /attach file/, /upload/], confidence: 0.96 },
    { key: "work_authorized_us", patterns: [/authorized to work/, /eligible to work/, /work authorization/], confidence: 0.9 },
    { key: "requires_sponsorship", patterns: [/visa/, /sponsorship/], confidence: 0.9 },
    { key: "requires_relocation", patterns: [/relocation/, /willing to relocate/], confidence: 0.86 },
    { key: "citizenship", patterns: [/citizenship/, /\bcitizen\b/], confidence: 0.86 },
    { key: "security_clearance", patterns: [/clearance/], confidence: 0.9 },
    { key: "notice_period", patterns: [/notice period/], confidence: 0.84 },
    { key: "current_title", patterns: [/current title/, /job title/, /present title/], confidence: 0.82 },
    { key: "current_company", patterns: [/current company/, /current employer/, /\bemployer\b/], confidence: 0.8 },
    { key: "years_experience", patterns: [/years of experience/, /experience in years/], confidence: 0.88 },
    { key: "highest_degree", patterns: [/highest degree/, /education level/, /\bdegree\b/], confidence: 0.84 },
    { key: "school", patterns: [/\bschool\b/, /university/, /college/], confidence: 0.82 },
    { key: "graduation_date", patterns: [/graduation/, /grad date/], confidence: 0.86 },
    { key: "salary_expectation", patterns: [/salary/, /compensation/, /pay expectation/], confidence: 0.86 },
    { key: "available_start_date", patterns: [/start date/, /available to start/, /\bavailability\b/], confidence: 0.84 },
    { key: "preferred_workplace", patterns: [/remote/, /hybrid/, /onsite/, /work arrangement/], confidence: 0.8 },
    { key: "languages_spoken", patterns: [/languages spoken/, /\blanguage\b/], confidence: 0.82 },
    { key: "pronouns", patterns: [/pronouns/], confidence: 0.96 },
    { key: "gender", patterns: [/\bgender\b/], confidence: 0.92 },
    { key: "veteran_status", patterns: [/veteran/], confidence: 0.96 },
    { key: "disability_status", patterns: [/disability/], confidence: 0.96 },
    { key: "race_ethnicity", patterns: [/race/, /ethnicity/], confidence: 0.94 },
    { key: "summary", patterns: [/summary/, /about you/, /about yourself/], confidence: 0.78 },
    { key: "cover_letter_text", patterns: [/cover letter/, /why do you want/, /why are you interested/, /motivation/], confidence: 0.72 },
    { key: "top_skills", patterns: [/\bskills\b/, /tech stack/, /strengths/], confidence: 0.74 }
  ];

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalize(value) {
    return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function parseAutocompleteAttribute(value) {
    const tokens = cleanText(value)
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .filter((token) => token !== "on" && token !== "off" && token !== "webauthn");
    return {
      raw: cleanText(value),
      tokens,
      detailTokens: tokens.filter(
        (token) => !token.startsWith("section-") && token !== "shipping" && token !== "billing"
      )
    };
  }

  function autocompleteKeysFromTokens(tokens) {
    return unique(tokens.flatMap((token) => AUTOCOMPLETE_TOKEN_MAP[token] || []));
  }

  function inferNameParts(fullName, preferredName) {
    const fullParts = cleanText(fullName).split(/\s+/).filter(Boolean);
    const preferredParts = cleanText(preferredName).split(/\s+/).filter(Boolean);
    return {
      given_name: preferredParts[0] || fullParts[0] || "",
      family_name: fullParts.length > 1 ? fullParts.at(-1) : preferredParts.length > 1 ? preferredParts.at(-1) : ""
    };
  }

  function buildStructuredProfile(profile = {}, context = {}) {
    const inferred = inferNameParts(profile.full_name, profile.preferred_name);
    return {
      given_name: cleanText(profile.preferred_name || inferred.given_name),
      middle_name: "",
      family_name: cleanText(inferred.family_name),
      full_name: cleanText(profile.full_name),
      email: cleanText(profile.email),
      tel: cleanText(profile.phone),
      address_line1: cleanText(profile.address_line_1),
      address_line2: cleanText(profile.address_line_2),
      city: cleanText(profile.city),
      state_region: cleanText(profile.state_region),
      postal_code: cleanText(profile.postal_code),
      country: cleanText(profile.country),
      linkedin_url: cleanText(profile.linkedin),
      github_url: cleanText(profile.github),
      website_url: cleanText(profile.personal_website || profile.portfolio || profile.github),
      current_title: cleanText(profile.current_title),
      current_company: cleanText(profile.current_company),
      years_experience: cleanText(profile.years_experience),
      highest_degree: cleanText(profile.highest_degree),
      school: cleanText(profile.school),
      graduation_date: cleanText(profile.graduation_date),
      work_authorized_us: cleanText(profile.work_authorization),
      requires_sponsorship: cleanText(profile.sponsorship_needed),
      requires_relocation: cleanText(profile.requires_relocation),
      citizenship: cleanText(profile.citizenship),
      security_clearance: cleanText(profile.security_clearance),
      notice_period: cleanText(profile.notice_period),
      salary_expectation: cleanText(profile.salary_expectation),
      available_start_date: cleanText(profile.available_start_date),
      preferred_workplace: cleanText(profile.preferred_workplace),
      languages_spoken: cleanText(profile.languages_spoken),
      pronouns: cleanText(profile.pronouns),
      gender: cleanText(profile.gender),
      veteran_status: cleanText(profile.veteran_status),
      disability_status: cleanText(profile.disability_status),
      race_ethnicity: cleanText(profile.race_ethnicity),
      summary: cleanText(profile.summary),
      top_skills: cleanText(profile.top_skills),
      cover_letter_text: cleanText(context.coverLetterText),
      cover_letter_latex: cleanText(context.coverLetterLatex),
      resume_file: cleanText(context.resumeMeta?.name || profile.resume_path),
      location: cleanText(profile.location)
    };
  }

  function buildDerivedAnswers(structuredProfile) {
    return {
      short_location:
        cleanText([structuredProfile.city, structuredProfile.state_region].filter(Boolean).join(", ")) ||
        structuredProfile.location,
      full_address: cleanText(
        [
          structuredProfile.address_line1,
          structuredProfile.address_line2,
          [structuredProfile.city, structuredProfile.state_region, structuredProfile.postal_code]
            .filter(Boolean)
            .join(", "),
          structuredProfile.country
        ]
          .filter(Boolean)
          .join(", ")
      )
    };
  }

  function normalizeAnswerBank(answersData = {}) {
    return (answersData.answers || [])
      .map((item) => ({
        question: cleanText(item.question),
        aliases: unique((item.aliases || []).map(cleanText)),
        answer: cleanText(item.answer),
        answerType: item.answerType || "string",
        aiHint: cleanText(item.aiHint),
        platformHints: unique((item.platformHints || []).map((hint) => String(hint || "").toLowerCase()))
      }))
      .filter((item) => item.question && item.answer);
  }

  function buildAnswerContext(context = {}) {
    const structuredProfile = buildStructuredProfile(context.profile, context);
    return {
      structuredProfile,
      derivedAnswers: buildDerivedAnswers(structuredProfile),
      questionBank: normalizeAnswerBank(context.answers),
      autofillSettings: {
        mode: context.autofillSettings?.mode || "conservative",
        aiFallbackEnabled: Boolean(context.autofillSettings?.aiFallbackEnabled)
      }
    };
  }

  function resolveStructuredAnswer(key, answerContext, field) {
    const { structuredProfile, derivedAnswers } = answerContext;
    if (key === "website_url") {
      const text = field.signalTextNormalized || "";
      if (text.includes("linkedin") && structuredProfile.linkedin_url) {
        return structuredProfile.linkedin_url;
      }
      if (text.includes("github") && structuredProfile.github_url) {
        return structuredProfile.github_url;
      }
      return structuredProfile.website_url || structuredProfile.linkedin_url || structuredProfile.github_url;
    }
    if (key === "location") {
      return structuredProfile.location || derivedAnswers.short_location;
    }
    return structuredProfile[key] || derivedAnswers[key] || "";
  }

  function answerTypeForKey(key) {
    if (["work_authorized_us", "requires_sponsorship", "requires_relocation"].includes(key)) {
      return "boolean";
    }
    if (key === "resume_file") {
      return "file";
    }
    if (["cover_letter_text", "cover_letter_latex", "summary", "top_skills"].includes(key)) {
      return "long_text";
    }
    return "string";
  }

  function compatibilityBoost(field, key) {
    if (key === "email" && field.htmlType === "email") {
      return 0.08;
    }
    if (key === "tel" && field.htmlType === "tel") {
      return 0.08;
    }
    if (["linkedin_url", "github_url", "website_url"].includes(key) && field.htmlType === "url") {
      return 0.08;
    }
    if (key === "resume_file" && field.kind === "file") {
      return 0.12;
    }
    if (["summary", "cover_letter_text", "top_skills"].includes(key) && field.kind === "textarea") {
      return 0.05;
    }
    if (["work_authorized_us", "requires_sponsorship", "requires_relocation"].includes(key)) {
      if (field.kind === "radio-group" || field.kind === "checkbox" || field.kind === "select") {
        return 0.06;
      }
    }
    return 0;
  }

  function candidateForKey(field, key, confidence, source, reason, answerContext) {
    const answer = resolveStructuredAnswer(key, answerContext, field);
    if (!answer) {
      return null;
    }
    return {
      taxonomyKey: key,
      answer,
      answerType: answerTypeForKey(key),
      confidence: Math.min(0.99, confidence + compatibilityBoost(field, key)),
      source,
      reason
    };
  }

  function optionMatchConfidence(field, answer) {
    if (!field.options?.length) {
      return 0;
    }
    const normalizedAnswer = normalize(answer);
    for (const option of field.options) {
      if (normalize(option.label) === normalizedAnswer || normalize(option.value) === normalizedAnswer) {
        return 0.08;
      }
    }
    return 0;
  }

  function collectHeuristicCandidates(field, answerContext) {
    const candidates = [];
    for (const rule of HEURISTIC_RULES) {
      const matched = rule.patterns.some((pattern) => pattern.test(field.signalTextNormalized));
      if (!matched) {
        continue;
      }
      const candidate = candidateForKey(
        field,
        rule.key,
        rule.confidence + optionMatchConfidence(field, resolveStructuredAnswer(rule.key, answerContext, field)),
        "heuristic",
        `heuristic match: ${rule.key}`,
        answerContext
      );
      if (candidate) {
        candidates.push(candidate);
      }
    }
    return candidates;
  }

  function collectAutocompleteCandidates(field, answerContext) {
    const keys = autocompleteKeysFromTokens(field.autocompleteTokens || []);
    const candidates = [];
    for (const key of keys) {
      const candidate = candidateForKey(
        field,
        key,
        0.98 + optionMatchConfidence(field, resolveStructuredAnswer(key, answerContext, field)),
        "autocomplete",
        `autocomplete token: ${key}`,
        answerContext
      );
      if (candidate) {
        candidates.push(candidate);
      }
    }
    return candidates;
  }

  function collectAdapterCandidates(field, answerContext) {
    const candidates = [];
    for (const hint of field.adapterHints || []) {
      const candidate = candidateForKey(
        field,
        hint.key,
        Math.min(0.97, (hint.confidence || 0.86) + optionMatchConfidence(field, resolveStructuredAnswer(hint.key, answerContext, field))),
        "adapter",
        hint.reason || `adapter hint: ${hint.key}`,
        answerContext
      );
      if (candidate) {
        candidates.push(candidate);
      }
    }
    return candidates;
  }

  function scoreQuestionBank(field, entry, platformName) {
    const candidates = [entry.question, ...entry.aliases].map(normalize).filter(Boolean);
    let best = 0;
    for (const candidate of candidates) {
      if (field.questionNormalized.includes(candidate)) {
        best = Math.max(best, 0.64 + candidate.length / 420);
        continue;
      }
      const candidateTokens = candidate.split(" ").filter(Boolean);
      const overlap = candidateTokens.filter((token) => field.questionTokens.includes(token)).length;
      if (overlap) {
        best = Math.max(best, 0.45 + overlap / Math.max(4, candidateTokens.length + 1));
      }
    }
    if (!best) {
      return 0;
    }
    if (entry.platformHints.includes(platformName)) {
      best += 0.04;
    }
    if (field.kind === "textarea" && entry.answerType === "long_text") {
      best += 0.02;
      return Math.min(0.79, best);
    }
    if ((field.kind === "radio-group" || field.kind === "select") && entry.answerType === "choice") {
      best += 0.04;
    }
    if ((field.kind === "checkbox" || field.kind === "checkbox-group" || field.kind === "radio-group") && entry.answerType === "boolean") {
      best += 0.04;
    }
    return Math.min(0.9, best);
  }

  function collectQuestionBankCandidate(field, answerContext, platformName) {
    let best = null;
    for (const entry of answerContext.questionBank) {
      const confidence = scoreQuestionBank(field, entry, platformName);
      if (!confidence) {
        continue;
      }
      if (!best || confidence > best.confidence) {
        best = {
          taxonomyKey: null,
          answer: entry.answer,
          answerType: entry.answerType,
          confidence,
          source: "question_bank",
          reason: `question bank: ${entry.question}`
        };
      }
    }
    return best;
  }

  function bestCandidate(candidates) {
    return [...candidates].sort((left, right) => right.confidence - left.confidence)[0] || null;
  }

  function thresholdsForMode(mode) {
    if (mode === "aggressive") {
      return { fill: 0.62, review: 0.42 };
    }
    if (mode === "balanced") {
      return { fill: 0.72, review: 0.52 };
    }
    return { fill: 0.8, review: 0.6 };
  }

  function compatiblePolicyCandidate(field, candidate) {
    if (!field.policyBucket) {
      return true;
    }
    return candidate.taxonomyKey ? POLICY_BUCKET_KEYS.has(candidate.taxonomyKey) : true;
  }

  function maybeResolveWithAiFallback(field, answerContext) {
    if (!answerContext.autofillSettings.aiFallbackEnabled || typeof answerContext.aiFallback !== "function") {
      return null;
    }
    return answerContext.aiFallback(field) || null;
  }

  function makeSkip(field, skipReason, confidence = 0) {
    return {
      fieldId: field.fieldId,
      taxonomyKey: null,
      source: "",
      confidence,
      decision: "skip",
      selectedAnswer: "",
      reason: "",
      skipReason
    };
  }

  function matchResolvedField(field, answerContext, platformName = "generic") {
    const candidates = [
      ...collectAutocompleteCandidates(field, answerContext),
      ...collectAdapterCandidates(field, answerContext),
      ...collectHeuristicCandidates(field, answerContext)
    ].filter((candidate) => compatiblePolicyCandidate(field, candidate));
    const questionCandidate = collectQuestionBankCandidate(field, answerContext, platformName);
    if (questionCandidate && compatiblePolicyCandidate(field, questionCandidate)) {
      candidates.push(questionCandidate);
    }

    const selected = bestCandidate(candidates);
    if (!selected) {
      const aiCandidate = maybeResolveWithAiFallback(field, answerContext);
      if (aiCandidate) {
        return aiCandidate;
      }
      return makeSkip(
        field,
        answerContext.autofillSettings.aiFallbackEnabled && field.kind === "textarea"
          ? "no deterministic match; AI fallback not configured"
          : "no deterministic match"
      );
    }

    if (field.kind === "file" && selected.answerType !== "file") {
      return makeSkip(field, "file field requires resume asset", selected.confidence);
    }

    const thresholds = thresholdsForMode(answerContext.autofillSettings.mode);
    const decision =
      selected.confidence >= thresholds.fill ? "fill" : selected.confidence >= thresholds.review ? "review" : "skip";
    return {
      fieldId: field.fieldId,
      taxonomyKey: selected.taxonomyKey,
      source: selected.source,
      confidence: Math.min(0.99, selected.confidence),
      decision,
      selectedAnswer: selected.answer,
      reason: selected.reason,
      skipReason: decision === "skip" ? "confidence below threshold" : ""
    };
  }

  globalScope.JobmasterAutofillCore = {
    BOOLEAN_FALSE,
    BOOLEAN_TRUE,
    AUTOCOMPLETE_TOKEN_MAP,
    cleanText,
    normalize,
    parseAutocompleteAttribute,
    autocompleteKeysFromTokens,
    buildStructuredProfile,
    buildDerivedAnswers,
    buildAnswerContext,
    matchResolvedField,
    thresholdsForMode
  };
})(globalThis);
