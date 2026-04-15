function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().replace(/^[,.;\s]+|[,.;\s]+$/g, "");
}

function splitMulti(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(/[|,/;]\s*|\s{2,}/)
    .map(clean)
    .filter(Boolean);
}

function splitBioParts(value) {
  return String(value ?? "")
    .split("|")
    .map(clean)
    .filter(Boolean);
}

function unique(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const key = String(value).toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function naturalJoin(values) {
  const cleanValues = values.filter(Boolean);
  if (!cleanValues.length) {
    return "";
  }
  if (cleanValues.length === 1) {
    return cleanValues[0];
  }
  if (cleanValues.length === 2) {
    return `${cleanValues[0]} and ${cleanValues[1]}`;
  }
  return `${cleanValues.slice(0, -1).join(", ")}, and ${cleanValues.at(-1)}`;
}

function bioIdentity(githubBio) {
  const lead = splitBioParts(githubBio)[0];
  if (!lead) {
    return "";
  }
  if (lead.includes("@")) {
    const [role, org] = lead.split("@").map((part) => part.trim());
    return `${org} ${role.toLowerCase()} student`;
  }
  return lead;
}

function bioFocusAreas(githubBio) {
  const parts = splitBioParts(githubBio);
  const focus = [];
  let seeking = "";
  for (const part of parts.slice(1)) {
    if (part.toLowerCase().startsWith("seeking ")) {
      seeking = part;
    } else {
      focus.push(...splitMulti(part));
    }
  }
  return { focus, seeking };
}

function repoLanguages(candidateSources) {
  const repos = candidateSources?.github?.repositories ?? [];
  return unique(
    repos
      .map((repo) => clean(repo.language))
      .filter((language) => language && language.toLowerCase() !== "other")
  );
}

function sentenceOpen(value) {
  if (!value) {
    return "";
  }
  return value[0].toUpperCase() + value.slice(1);
}

export function generateProfessionalSummary(profile = {}, candidateSources = {}) {
  const github = candidateSources.github ?? {};
  const preferences = candidateSources.preferences ?? {};
  const education = candidateSources.education ?? {};
  const githubBio = clean(github.bio);

  let identity = "";
  if (education.school && education.degree) {
    identity = `${education.school} ${String(education.degree).toLowerCase()} student`;
  } else if (education.school) {
    identity = `Student at ${education.school}`;
  } else {
    identity = bioIdentity(githubBio);
  }

  const { focus, seeking } = bioFocusAreas(githubBio);
  const skills = unique(
    [
      ...focus,
      ...splitMulti(profile.top_skills),
      ...repoLanguages(candidateSources),
      clean(preferences.industries)
    ].filter((value) => value && !value.toLowerCase().startsWith("seeking "))
  );

  const filteredSkills = skills.filter((skill) => !skill.toLowerCase().includes("internship"));
  const projectHighlights = candidateSources.project_highlights ?? [];
  const repoDescriptions = (github.repositories ?? [])
    .map((repo) => clean(repo.description))
    .filter((value) => value && !value.toLowerCase().startsWith("forked coursework"));
  const repoCount = Number(github.repository_count ?? 0);

  let sentence1 = "";
  if (identity && filteredSkills.length) {
    sentence1 = `${sentenceOpen(identity)} with hands-on experience in ${naturalJoin(filteredSkills.slice(0, 4))}.`;
  } else if (identity) {
    sentence1 = `${sentenceOpen(identity)}.`;
  } else {
    sentence1 = "Hands-on candidate with practical technical project experience.";
  }

  let sentence2 = "";
  if (projectHighlights.length) {
    sentence2 = `Recent work includes ${naturalJoin(projectHighlights.slice(0, 2).map(String))}.`;
  } else if (repoDescriptions.length) {
    sentence2 = repoCount
      ? `Recent work includes ${naturalJoin(repoDescriptions.slice(0, 2))}, alongside ${repoCount} public GitHub repositories.`
      : `Recent work includes ${naturalJoin(repoDescriptions.slice(0, 2))}.`;
  } else if (repoCount) {
    sentence2 = `Maintains ${repoCount} public GitHub repositories that showcase applied project work and ongoing technical learning.`;
  }

  const targetRoles = clean(preferences.target_roles);
  let sentence3 = "";
  if (targetRoles) {
    sentence3 = `Interested in ${targetRoles}.`;
  } else if (seeking) {
    sentence3 = `${seeking.replace(/[.]+$/, "")}.`;
  }

  return [sentence1, sentence2, sentence3].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

