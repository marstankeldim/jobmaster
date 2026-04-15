function formatToday() {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function sanitizeFilenamePart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
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

export function buildCoverLetterFilenameBase(job = {}, _profile = {}) {
  const parts = [
    "cover-letter",
    sanitizeFilenamePart(job.company),
    sanitizeFilenamePart(job.title),
    new Date().toISOString().slice(0, 10)
  ].filter(Boolean);
  return parts.join("-");
}

export function latexToText(renderedLatex) {
  return String(renderedLatex)
    .replace(/^%.*$/gm, "")
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

function escapePdfText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function pdfObject(id, body) {
  return `${id} 0 obj\n${body}\nendobj\n`;
}

export function buildPdfFromText(text) {
  const pageWidth = 612;
  const pageHeight = 792;
  const marginLeft = 72;
  const marginTop = 720;
  const lineHeight = 15;
  const maxLinesPerPage = 42;
  const normalizedLines = String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .flatMap((line) => {
      const cleanLine = line.trimEnd();
      if (!cleanLine) {
        return [""];
      }
      const chunks = [];
      let remaining = cleanLine;
      while (remaining.length > 96) {
        chunks.push(remaining.slice(0, 96));
        remaining = remaining.slice(96);
      }
      chunks.push(remaining);
      return chunks;
    });

  const pages = [];
  for (let index = 0; index < normalizedLines.length; index += maxLinesPerPage) {
    pages.push(normalizedLines.slice(index, index + maxLinesPerPage));
  }
  if (!pages.length) {
    pages.push([""]);
  }

  const objects = [];
  let nextObjectId = 1;
  const catalogId = nextObjectId++;
  const pagesId = nextObjectId++;
  const fontId = nextObjectId++;
  const pageObjectIds = [];

  for (const pageLines of pages) {
    const pageId = nextObjectId++;
    const contentsId = nextObjectId++;
    pageObjectIds.push(pageId);
    const streamLines = [
      "BT",
      "/F1 11 Tf",
      `${lineHeight} TL`,
      `${marginLeft} ${marginTop} Td`
    ];
    pageLines.forEach((line, lineIndex) => {
      if (lineIndex > 0) {
        streamLines.push("T*");
      }
      streamLines.push(`(${escapePdfText(line)}) Tj`);
    });
    streamLines.push("ET");
    const stream = streamLines.join("\n");
    objects.push(
      pdfObject(
        pageId,
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentsId} 0 R >>`
      )
    );
    objects.push(
      pdfObject(contentsId, `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`)
    );
  }

  objects.unshift(pdfObject(fontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"));
  objects.unshift(pdfObject(pagesId, `<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`));
  objects.unshift(pdfObject(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`));

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += object;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
