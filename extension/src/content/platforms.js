(function attachPlatforms(globalScope) {
  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalize(value) {
    return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function fieldCount(root = document) {
    return root.querySelectorAll("input, select, textarea").length;
  }

  function nodeDepth(node, boundary = document.body) {
    let depth = 0;
    let current = node;
    while (current && current !== boundary && current !== document.body) {
      depth += 1;
      current = current.parentElement;
    }
    return depth;
  }

  function isMeaningfullyVisible(node) {
    if (!node || node.hidden) {
      return false;
    }
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function firstMatch(selectors, root = document) {
    for (const selector of selectors) {
      const node = root.querySelector(selector);
      if (node) {
        return { node, selector };
      }
    }
    return null;
  }

  function textContent(selector, root = document) {
    return cleanText(root.querySelector(selector)?.textContent);
  }

  function metaContent(selector) {
    return cleanText(document.querySelector(selector)?.getAttribute("content"));
  }

  function titleParts(title) {
    return String(title || "")
      .split(/[|·\-–—]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function genericCompanyFromTitle() {
    const parts = titleParts(document.title);
    return parts.length > 1 ? parts[1] : metaContent("meta[property='og:site_name']");
  }

  function bestVisibleFieldContainer(selectors, root = document) {
    const candidates = [];
    const seen = new Set();
    for (const selector of selectors) {
      for (const node of root.querySelectorAll(selector)) {
        if (seen.has(node) || !isMeaningfullyVisible(node)) {
          continue;
        }
        seen.add(node);
        const count = fieldCount(node);
        if (!count) {
          continue;
        }
        candidates.push({
          node,
          selector,
          fieldCount: count,
          depth: nodeDepth(node, root)
        });
      }
    }
    candidates.sort((left, right) => {
      if (left.fieldCount !== right.fieldCount) {
        return left.fieldCount - right.fieldCount;
      }
      return right.depth - left.depth;
    });
    return candidates[0] || null;
  }

  function makePlatform(name, config) {
    return {
      name,
      matches: config.matches,
      findRoot: config.findRoot,
      findActiveStep: config.findActiveStep || ((rootMatch) => ({ node: rootMatch.node, selector: rootMatch.selector })),
      collectFields: config.collectFields || ((stepRoot, helpers) => helpers.collectGenericFields(stepRoot)),
      classifyField: config.classifyField || (() => []),
      normalizeChoice: config.normalizeChoice || ((_field, answer) => answer),
      detectSubmissionState: config.detectSubmissionState || (() => "draft"),
      extractJob: config.extractJob
    };
  }

  function automationHints(field, rules) {
    const text = normalize([field.automationId, field.name, field.id].join(" "));
    const hints = [];
    for (const rule of rules) {
      if (rule.pattern.test(text)) {
        hints.push({
          key: rule.key,
          confidence: rule.confidence,
          reason: rule.reason
        });
      }
    }
    return hints;
  }

  const adapters = [
    makePlatform("workday", {
      matches: (location) =>
        /workdayjobs\.com$/i.test(location.hostname) || /myworkdayjobs/i.test(location.hostname + location.pathname),
      findRoot: (doc) =>
        firstMatch(
          [
            "[data-automation-id='candidateExperiencePage']",
            "[data-automation-id='jobApplicationPage']",
            "[data-automation-id='applyFlow']",
            "main"
          ],
          doc
        ),
      findActiveStep: (rootMatch) =>
        bestVisibleFieldContainer(
          [
            "form",
            "[data-automation-id='formPanel']",
            "[data-automation-id='stepContent']",
            "[data-automation-id='pageContent']",
            "[data-automation-id='questionnairePage']",
            "[data-automation-id='panel']",
            "[role='group']"
          ],
          rootMatch.node
        ) || { node: rootMatch.node, selector: rootMatch.selector },
      classifyField: (field) =>
        automationHints(field, [
          { key: "email", pattern: /email/, confidence: 0.94, reason: "Workday automation id: email" },
          { key: "tel", pattern: /phone|mobile/, confidence: 0.93, reason: "Workday automation id: phone" },
          { key: "resume_file", pattern: /resume|attachment|upload/, confidence: 0.98, reason: "Workday upload control" },
          { key: "cover_letter_text", pattern: /cover|motivation/, confidence: 0.9, reason: "Workday cover letter control" },
          { key: "given_name", pattern: /first/, confidence: 0.92, reason: "Workday automation id: first name" },
          { key: "family_name", pattern: /last|family/, confidence: 0.92, reason: "Workday automation id: last name" }
        ]),
      normalizeChoice: (field, answer) => {
        if (!field.options?.length) {
          return answer;
        }
        const lowered = normalize(answer);
        if (lowered === "yes") {
          return field.options.find((option) => /yes/i.test(option.label))?.label || answer;
        }
        if (lowered === "no") {
          return field.options.find((option) => /no/i.test(option.label))?.label || answer;
        }
        return answer;
      },
      detectSubmissionState: (doc) =>
        doc.querySelector("[data-automation-id='bottom-navigation-next-button']") ? "draft" : "review",
      extractJob: (doc, location) => ({
        title: textContent("h2[data-automation-id='jobPostingHeader']", doc) || textContent("h1", doc),
        company: metaContent("meta[property='og:site_name']") || genericCompanyFromTitle(),
        location:
          textContent("[data-automation-id='locations']", doc) || textContent("[data-automation-id='jobPostingLocation']", doc),
        source: "Workday",
        job_url: location.href
      })
    }),
    makePlatform("linkedin", {
      matches: (location) => /linkedin\.com$/i.test(location.hostname) && location.pathname.includes("/jobs"),
      findRoot: (doc) =>
        firstMatch([".jobs-easy-apply-content", ".jobs-apply-form", "[data-easy-apply-modal]", "main"], doc),
      findActiveStep: (rootMatch) =>
        bestVisibleFieldContainer(
          [
            ".jobs-easy-apply-content form",
            ".jobs-easy-apply-form-section__grouping",
            ".jobs-easy-apply-content section",
            "[role='dialog'] form",
            "form"
          ],
          rootMatch.node
        ) || { node: rootMatch.node, selector: rootMatch.selector },
      classifyField: (field) =>
        automationHints(field, [
          { key: "email", pattern: /email/, confidence: 0.95, reason: "LinkedIn field id: email" },
          { key: "tel", pattern: /phone/, confidence: 0.94, reason: "LinkedIn field id: phone" },
          { key: "resume_file", pattern: /resume|upload/, confidence: 0.98, reason: "LinkedIn resume upload" },
          { key: "cover_letter_text", pattern: /cover letter/, confidence: 0.92, reason: "LinkedIn cover letter field" }
        ]),
      detectSubmissionState: (doc) =>
        doc.querySelector(".jobs-easy-apply-review") || doc.querySelector("[aria-label*='Review your application']")
          ? "review"
          : "draft",
      extractJob: (doc, location) => ({
        title: textContent(".jobs-unified-top-card__job-title", doc) || textContent("h1", doc),
        company: textContent(".jobs-unified-top-card__company-name", doc) || genericCompanyFromTitle(),
        location: textContent(".jobs-unified-top-card__bullet", doc) || textContent(".jobs-search__job-details--subtitle", doc),
        source: "LinkedIn",
        job_url: location.href
      })
    }),
    makePlatform("greenhouse", {
      matches: (location) => /greenhouse\.io$/i.test(location.hostname) || location.pathname.includes("/jobs/"),
      findRoot: (doc) =>
        firstMatch(["#application", "form#application_form", "form[action*='greenhouse']", ".application"], doc),
      classifyField: (field) =>
        automationHints(field, [
          { key: "resume_file", pattern: /resume|resume file|cv/, confidence: 0.97, reason: "Greenhouse resume upload" },
          { key: "cover_letter_text", pattern: /cover letter/, confidence: 0.92, reason: "Greenhouse cover letter" }
        ]),
      extractJob: (doc, location) => ({
        title: textContent("h1.app-title", doc) || textContent("h1", doc),
        company: textContent(".company-name", doc) || genericCompanyFromTitle(),
        location: textContent("#header .location", doc) || textContent(".location", doc),
        source: "Greenhouse",
        job_url: location.href
      })
    }),
    makePlatform("lever", {
      matches: (location) => /lever\.co$/i.test(location.hostname),
      findRoot: (doc) =>
        firstMatch([".application-page", ".application-form", "form.posting-form", "form[action*='lever']"], doc),
      classifyField: (field) =>
        automationHints(field, [
          { key: "resume_file", pattern: /resume|upload|cv/, confidence: 0.97, reason: "Lever resume upload" },
          { key: "cover_letter_text", pattern: /cover letter/, confidence: 0.92, reason: "Lever cover letter" }
        ]),
      extractJob: (doc, location) => ({
        title: textContent(".posting-headline h2", doc) || textContent(".main-header-text h2", doc) || textContent("h1", doc),
        company: textContent(".main-header-text a", doc) || genericCompanyFromTitle(),
        location: textContent(".posting-categories .sort-by-location", doc) || textContent(".location", doc),
        source: "Lever",
        job_url: location.href
      })
    }),
    makePlatform("generic", {
      matches: () => true,
      findRoot: (doc) =>
        firstMatch(
          ["form", "[data-automation-id*='apply']", "[class*='apply'] form", ".application", ".jobs-apply", ".apply-form", "main"],
          doc
        ),
      extractJob: (_doc, location) => ({
        title: textContent("h1") || metaContent("meta[property='og:title']") || titleParts(document.title)[0],
        company: genericCompanyFromTitle() || location.hostname.replace(/^www\./i, ""),
        location: textContent("[data-location]") || textContent(".location"),
        source: "Generic",
        job_url: location.href
      })
    })
  ];

  const disabledFallbackAdapter = makePlatform("disabled", {
    matches: () => false,
    findRoot: () => null,
    collectFields: () => ({
      fields: [],
      metrics: {
        fieldCountRaw: 0,
        fieldCountPotential: 0,
        fieldCountVisible: 0,
        fieldCountGrouped: 0
      }
    }),
    extractJob: (_doc, location) => ({
      title: titleParts(document.title)[0] || "Unknown role",
      company: genericCompanyFromTitle() || location.hostname.replace(/^www\./i, ""),
      location: "",
      source: "Disabled",
      job_url: location.href
    })
  });

  function detectPlatform(location = window.location, overrides = null) {
    const enabled = overrides?.platformOverrides || null;
    const enabledAdapters = adapters.filter((adapter) => !enabled || enabled[adapter.name] !== false);
    const matched = enabledAdapters.find((adapter) => adapter.matches(location));
    if (matched) {
      return matched;
    }
    return enabled?.generic === false ? disabledFallbackAdapter : adapters.at(-1);
  }

  function resolveApplicationRoot(adapter, root = document) {
    const result = adapter.findRoot?.(root);
    if (result?.node) {
      return result;
    }
    return { node: root, selector: "document" };
  }

  function resolveStepRoot(adapter, rootMatch) {
    const result = adapter.findActiveStep?.(rootMatch);
    if (result?.node) {
      return result;
    }
    return { node: rootMatch.node, selector: rootMatch.selector };
  }

  globalScope.JobmasterPlatforms = {
    adapters,
    cleanText,
    normalize,
    detectPlatform,
    resolveApplicationRoot,
    resolveStepRoot
  };
})(globalThis);
