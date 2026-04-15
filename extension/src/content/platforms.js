(function attachPlatforms(globalScope) {
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

  function hasApplicationFields(root = document) {
    return root.querySelectorAll("input, select, textarea").length > 3;
  }

  function analyzePage() {
    const adapter = detectPlatform(window.location);
    return {
      platform: adapter.name,
      applicationFormDetected: hasApplicationFields(document),
      job: adapter.extractJob(document, window.location)
    };
  }

  globalScope.JobmasterPlatforms = {
    adapters,
    analyzePage,
    detectPlatform
  };
})(globalThis);

