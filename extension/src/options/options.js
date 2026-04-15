import { callExtension } from "../shared/client.js";
import { PROFILE_PLACEHOLDERS } from "../shared/defaults.js";

const profileFields = [
  "full_name",
  "legal_name",
  "first_name",
  "middle_name",
  "last_name",
  "preferred_name",
  "email",
  "phone",
  "location",
  "address_line_1",
  "address_line_2",
  "city",
  "state_region",
  "postal_code",
  "country",
  "linkedin",
  "github",
  "portfolio",
  "personal_website",
  "current_title",
  "current_company",
  "years_experience",
  "highest_degree",
  "major",
  "minor",
  "school",
  "graduation_date",
  "graduation_year",
  "work_authorization",
  "sponsorship_needed",
  "requires_relocation",
  "preferred_location",
  "referral_source",
  "age_over_18",
  "previous_employee",
  "previously_applied",
  "citizenship",
  "security_clearance",
  "notice_period",
  "salary_expectation",
  "available_start_date",
  "preferred_workplace",
  "languages_spoken",
  "pronouns",
  "gender",
  "veteran_status",
  "disability_status",
  "race_ethnicity",
  "top_skills",
  "summary"
];

function flash(message, isError = false) {
  const node = document.getElementById("flash");
  node.hidden = false;
  node.textContent = message;
  node.style.color = isError ? "#8a3c3c" : "";
  clearTimeout(flash.timeoutId);
  flash.timeoutId = setTimeout(() => {
    node.hidden = true;
  }, 2600);
}

function formToObject(form) {
  const formData = new FormData(form);
  return Object.fromEntries(formData.entries());
}

function populateProfile(profile) {
  const form = document.getElementById("profile-form");
  for (const key of profileFields) {
    const input = form.elements.namedItem(key);
    if (input) {
      input.value = profile[key] ?? "";
      input.placeholder = PROFILE_PLACEHOLDERS[key] ?? "";
    }
  }
}

function populateTrackerSummary(counts) {
  const node = document.getElementById("tracker-summary");
  node.innerHTML = "";
  const items = [
    ["Saved", counts.saved],
    ["Applying", counts.applying],
    ["Submitted", counts.submitted],
    ["Interview", counts.interview],
    ["Offer", counts.offer],
    ["Total", counts.total]
  ];
  for (const [label, value] of items) {
    const card = document.createElement("div");
    card.className = "jm-stat";
    card.innerHTML = `<span>${label}</span><strong>${value ?? 0}</strong>`;
    node.append(card);
  }
}

function populateResume(resumeMeta, profile) {
  const node = document.getElementById("resume-status");
  if (resumeMeta) {
    node.textContent = `${resumeMeta.name} · ${Math.round((resumeMeta.size || 0) / 1024)} KB · stored for autofill`;
  } else if (profile.resume_path) {
    node.textContent = `Configured resume path: ${profile.resume_path}`;
  } else {
    node.textContent = "No resume stored yet.";
  }
}

function populateAutofillSettings(autofillSettings) {
  document.getElementById("autofill-mode").value = autofillSettings.mode || "conservative";
  document.getElementById("ai-fallback-enabled").checked = Boolean(autofillSettings.aiFallbackEnabled);
  for (const input of document.querySelectorAll(".jm-platform-override")) {
    input.checked = autofillSettings.platformOverrides?.[input.dataset.platform] !== false;
  }
}

async function refresh() {
  const [stateResponse, countsResponse] = await Promise.all([
    callExtension("jobmaster:get-state"),
    callExtension("jobmaster:summary-counts")
  ]);
  if (!stateResponse.ok) {
    throw new Error(stateResponse.error);
  }
  populateProfile(stateResponse.state.profile);
  document.getElementById("answers-json").value = JSON.stringify(stateResponse.state.answers, null, 2);
  document.getElementById("candidate-sources-json").value = JSON.stringify(stateResponse.state.candidateSources, null, 2);
  document.getElementById("cover-letter-template").value = stateResponse.state.coverLetterTemplate;
  populateResume(stateResponse.state.resumeMeta, stateResponse.state.profile);
  populateAutofillSettings(stateResponse.state.autofillSettings);
  populateTrackerSummary(countsResponse.counts ?? {});
}

document.getElementById("profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const profile = formToObject(event.currentTarget);
  const response = await callExtension("jobmaster:save-profile", { profile });
  flash(response.ok ? "Profile saved." : response.error, !response.ok);
  if (response.ok) {
    populateProfile(response.profile);
  }
});

document.getElementById("generate-summary").addEventListener("click", async () => {
  const response = await callExtension("jobmaster:generate-summary");
  flash(response.ok ? "Professional summary regenerated." : response.error, !response.ok);
  if (response.ok) {
    populateProfile(response.profile);
  }
});

document.getElementById("answers-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const answers = JSON.parse(document.getElementById("answers-json").value);
    const response = await callExtension("jobmaster:save-answers", { answers });
    flash(response.ok ? "Answer bank saved." : response.error, !response.ok);
  } catch (error) {
    flash(error.message || "Answers JSON is invalid.", true);
  }
});

document.getElementById("autofill-settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const autofillSettings = {
    mode: document.getElementById("autofill-mode").value,
    aiFallbackEnabled: document.getElementById("ai-fallback-enabled").checked,
    platformOverrides: Object.fromEntries(
      [...document.querySelectorAll(".jm-platform-override")].map((input) => [input.dataset.platform, input.checked])
    )
  };
  const response = await callExtension("jobmaster:save-autofill-settings", { autofillSettings });
  flash(response.ok ? "Autofill settings saved." : response.error, !response.ok);
  if (response.ok) {
    populateAutofillSettings(response.autofillSettings);
  }
});

document.getElementById("candidate-sources-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const candidateSources = JSON.parse(document.getElementById("candidate-sources-json").value);
    const response = await callExtension("jobmaster:save-candidate-sources", { candidateSources });
    flash(response.ok ? "Candidate source data saved." : response.error, !response.ok);
  } catch (error) {
    flash(error.message || "Candidate source JSON is invalid.", true);
  }
});

document.getElementById("template-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const coverLetterTemplate = document.getElementById("cover-letter-template").value;
  const response = await callExtension("jobmaster:save-cover-letter-template", { coverLetterTemplate });
  flash(response.ok ? "Cover letter template saved." : response.error, !response.ok);
});

document.getElementById("resume-upload").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  const response = await callExtension("jobmaster:save-resume", {
    file: {
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
      data: await file.arrayBuffer()
    }
  });
  flash(response.ok ? "Resume stored in extension." : response.error, !response.ok);
  if (response.ok) {
    await refresh();
  }
  event.target.value = "";
});

document.getElementById("clear-resume").addEventListener("click", async () => {
  const response = await callExtension("jobmaster:clear-resume");
  flash(response.ok ? "Resume cleared." : response.error, !response.ok);
  if (response.ok) {
    await refresh();
  }
});

document.getElementById("export-package").addEventListener("click", async () => {
  const response = await callExtension("jobmaster:export-package");
  if (!response.ok) {
    flash(response.error, true);
    return;
  }
  const blob = new Blob([JSON.stringify(response.packageData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "jobmaster-extension-package.json";
  link.click();
  URL.revokeObjectURL(url);
  flash("Extension package exported.");
});

document.getElementById("import-package").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  try {
    const packageData = JSON.parse(await file.text());
    const response = await callExtension("jobmaster:import-package", { packageData });
    flash(response.ok ? "Extension package imported." : response.error, !response.ok);
    if (response.ok) {
      await refresh();
    }
  } catch (error) {
    flash(error.message || "Could not import package.", true);
  }
  event.target.value = "";
});

refresh().catch((error) => {
  flash(error.message || "Could not load settings.", true);
});
