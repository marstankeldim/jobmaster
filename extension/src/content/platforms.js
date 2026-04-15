(function attachPlatforms(globalScope) {
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
    return root.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() || "";
  }

  function metaContent(selector) {
    return document.querySelector(selector)?.getAttribute("content")?.trim() || "";
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

  const adapters = [
    {
      name: "greenhouse",
      matches: (location) => /greenhouse\.io$/i.test(location.hostname) || location.pathname.includes("/jobs/"),
      findRoot: (doc) =>
        firstMatch([
          "#application",
          "form#application_form",
          "form[action*='greenhouse']",
          ".application"
        ], doc),
      extractJob: (doc, location) => ({
        title: textContent("h1.app-title", doc) || textContent("h1", doc),
        company: textContent(".company-name", doc) || genericCompanyFromTitle(),
        location: textContent("#header .location", doc) || textContent(".location", doc),
        source: "Greenhouse",
        job_url: location.href
      })
    },
    {
      name: "lever",
      matches: (location) => /lever\.co$/i.test(location.hostname),
      findRoot: (doc) =>
        firstMatch([
          ".application-page",
          ".application-form",
          "form.posting-form",
          "form[action*='lever']"
        ], doc),
      extractJob: (doc, location) => ({
        title: textContent(".posting-headline h2", doc) || textContent(".main-header-text h2", doc) || textContent("h1", doc),
        company: textContent(".main-header-text a", doc) || genericCompanyFromTitle(),
        location: textContent(".posting-categories .sort-by-location", doc) || textContent(".location", doc),
        source: "Lever",
        job_url: location.href
      })
    },
    {
      name: "workday",
      matches: (location) => /workdayjobs\.com$/i.test(location.hostname) || /myworkdayjobs/i.test(location.hostname + location.pathname),
      findRoot: (doc) =>
        firstMatch([
          "[data-automation-id='candidateExperiencePage']",
          "[data-automation-id='jobApplicationPage']",
          "[data-automation-id='applyFlow']",
          "main"
        ], doc),
      findStepRoot: (root) =>
        bestVisibleFieldContainer([
          "form",
          "[data-automation-id='formPanel']",
          "[data-automation-id='stepContent']",
          "[data-automation-id='pageContent']",
          "[data-automation-id='questionnairePage']",
          "[data-automation-id='panel']",
          "[data-automation-id='multiselectInputContainer']",
          "[role='group']"
        ], root),
      extractJob: (doc, location) => ({
        title: textContent("h2[data-automation-id='jobPostingHeader']", doc) || textContent("h1", doc),
        company: metaContent("meta[property='og:site_name']") || genericCompanyFromTitle(),
        location: textContent("[data-automation-id='locations']", doc) || textContent("[data-automation-id='jobPostingLocation']", doc),
        source: "Workday",
        job_url: location.href
      })
    },
    {
      name: "linkedin",
      matches: (location) => /linkedin\.com$/i.test(location.hostname) && location.pathname.includes("/jobs"),
      findRoot: (doc) =>
        firstMatch([
          ".jobs-easy-apply-content",
          ".jobs-apply-form",
          "[data-easy-apply-modal]",
          "main"
        ], doc),
      findStepRoot: (root) =>
        bestVisibleFieldContainer([
          "form",
          ".jobs-easy-apply-content form",
          ".jobs-easy-apply-form-section__grouping",
          ".jobs-easy-apply-form-section__grouping > div",
          ".jobs-easy-apply-content [role='group']",
          ".jobs-easy-apply-content section"
        ], root),
      extractJob: (doc, location) => ({
        title: textContent(".jobs-unified-top-card__job-title", doc) || textContent("h1", doc),
        company: textContent(".jobs-unified-top-card__company-name", doc) || genericCompanyFromTitle(),
        location: textContent(".jobs-unified-top-card__bullet", doc) || textContent(".jobs-search__job-details--subtitle", doc),
        source: "LinkedIn",
        job_url: location.href
      })
    },
    {
      name: "generic",
      matches: () => true,
      findRoot: (doc) =>
        firstMatch([
          "form",
          "[data-automation-id*='apply']",
          "[class*='apply'] form",
          ".application",
          ".jobs-apply",
          ".apply-form",
          "main"
        ], doc),
      extractJob: (_doc, location) => ({
        title: textContent("h1") || metaContent("meta[property='og:title']") || titleParts(document.title)[0],
        company: genericCompanyFromTitle() || location.hostname.replace(/^www\./i, ""),
        location: textContent("[data-location]") || textContent(".location") || "",
        source: "Generic",
        job_url: location.href
      })
    }
  ];

  function detectPlatform(location = window.location) {
    return adapters.find((adapter) => adapter.matches(location)) || adapters.at(-1);
  }

  function resolveApplicationRoot(adapter, root = document) {
    const result = adapter.findRoot?.(root);
    if (result?.node) {
      return result;
    }
    return { node: root, selector: "document" };
  }

  function resolveStepRoot(adapter, rootMatch) {
    const result = adapter.findStepRoot?.(rootMatch.node);
    if (result?.node) {
      return result;
    }
    return { node: rootMatch.node, selector: rootMatch.selector };
  }

  function hasApplicationFields(root = document) {
    return fieldCount(root) > 2;
  }

  function analyzePage() {
    const startedAt = performance.now();
    const adapter = detectPlatform(window.location);
    const rootMatch = resolveApplicationRoot(adapter, document);
    const stepMatch = resolveStepRoot(adapter, rootMatch);
    return {
      platform: adapter.name,
      applicationFormDetected: hasApplicationFields(stepMatch.node),
      rootSelectorUsed: rootMatch.selector,
      stepSelectorUsed: stepMatch.selector,
      fieldCountHint: fieldCount(stepMatch.node),
      metrics: {
        platform: adapter.name,
        rootSelectorUsed: rootMatch.selector,
        stepSelectorUsed: stepMatch.selector,
        fieldCountRoot: fieldCount(rootMatch.node),
        fieldCountVisible: fieldCount(stepMatch.node),
        scanDurationMs: Math.round(performance.now() - startedAt)
      },
      job: adapter.extractJob(document, window.location)
    };
  }

  globalScope.JobmasterPlatforms = {
    adapters,
    analyzePage,
    detectPlatform,
    resolveApplicationRoot,
    resolveStepRoot
  };
})(globalThis);
