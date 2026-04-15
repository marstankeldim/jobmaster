(function attachPlatforms(globalScope) {
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

  function hasApplicationFields(root = document) {
    return root.querySelectorAll("input, select, textarea").length > 2;
  }

  function analyzePage() {
    const startedAt = performance.now();
    const adapter = detectPlatform(window.location);
    const rootMatch = resolveApplicationRoot(adapter, document);
    return {
      platform: adapter.name,
      applicationFormDetected: hasApplicationFields(rootMatch.node),
      rootSelectorUsed: rootMatch.selector,
      fieldCountHint: rootMatch.node.querySelectorAll("input, select, textarea").length,
      metrics: {
        platform: adapter.name,
        rootSelectorUsed: rootMatch.selector,
        fieldCountVisible: rootMatch.node.querySelectorAll("input, select, textarea").length,
        scanDurationMs: Math.round(performance.now() - startedAt)
      },
      job: adapter.extractJob(document, window.location)
    };
  }

  globalScope.JobmasterPlatforms = {
    adapters,
    analyzePage,
    detectPlatform,
    resolveApplicationRoot
  };
})(globalThis);
