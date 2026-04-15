function formatToday() {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

export function buildCoverLetterContext(job = {}, profile = {}) {
  return {
    ...Object.fromEntries(
      Object.entries(profile).map(([key, value]) => [key, value == null ? "" : String(value)])
    ),
    company: String(job.company ?? ""),
    title: String(job.title ?? ""),
    location: String(job.location ?? ""),
    job_url: String(job.job_url ?? ""),
    source: String(job.source ?? ""),
    today: formatToday()
  };
}

export function renderCoverLetter(templateText, job = {}, profile = {}) {
  const openSentinel = "\u0000";
  const closeSentinel = "\u0001";
  const context = buildCoverLetterContext(job, profile);
  const prepared = String(templateText)
    .replace(/{{/g, openSentinel)
    .replace(/}}/g, closeSentinel);

  return prepared
    .replace(/\{([^{}]+)\}/g, (_, key) => {
      const trimmed = String(key).trim();
      return Object.prototype.hasOwnProperty.call(context, trimmed) ? context[trimmed] : `{${trimmed}}`;
    })
    .replaceAll(openSentinel, "{")
    .replaceAll(closeSentinel, "}")
    .trim();
}

export function latexToText(renderedLatex) {
  return String(renderedLatex)
    .replace(/(?m)^%.*$/gm, "")
    .replace(/\\documentclass(?:\[[^\]]*\])?\{[^}]*\}/g, "")
    .replace(/\\usepackage(?:\[[^\]]*\])?\{[^}]*\}/g, "")
    .replace(/\\begin\{[^}]+\}/g, "")
    .replace(/\\end\{[^}]+\}/g, "")
    .replace(/\\(signature|address|date)\{([^}]*)\}/g, "$2")
    .replace(/\\opening\{([^}]*)\}/g, "$1")
    .replace(/\\closing\{([^}]*)\}/g, "$1")
    .replace(/\\\\/g, "\n")
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?\{([^}]*)\}/g, "$1")
    .replace(/\\[a-zA-Z]+\*?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

