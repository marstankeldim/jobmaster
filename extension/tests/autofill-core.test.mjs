import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const rootDir = process.cwd();
const corePath = path.join(rootDir, "extension/src/content/autofill-core.js");

async function loadCore() {
  const source = await readFile(corePath, "utf8");
  const context = { globalThis: {} };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.JobmasterAutofillCore;
}

function makeContext(overrides = {}) {
  return {
    profile: {
      full_name: "Ayan Ospan",
      preferred_name: "Ayan",
      email: "ayan@example.com",
      phone: "555-000-1111",
      city: "New York",
      state_region: "NY",
      postal_code: "10001",
      country: "United States",
      linkedin: "https://www.linkedin.com/in/ayan-ospan",
      github: "https://github.com/marstankeldim",
      personal_website: "https://ayan.dev",
      work_authorization: "Yes",
      sponsorship_needed: "No",
      summary: "Built automation and robotics systems.",
      top_skills: "Python, C++, automation"
    },
    answers: {
      answers: [
        {
          question: "Why are you interested in this role?",
          aliases: ["why do you want this job", "motivation"],
          answer: "I enjoy building reliable automation for real users.",
          answerType: "long_text",
          aiHint: "",
          platformHints: ["linkedin"]
        },
        {
          question: "Are you legally authorized to work in the United States?",
          aliases: ["authorized to work", "work authorization"],
          answer: "Yes",
          answerType: "boolean",
          aiHint: "",
          platformHints: ["workday", "greenhouse"]
        }
      ]
    },
    candidateSources: {
      linkedin: {
        url: "https://www.linkedin.com/in/ayan-ospan",
        headline: "Automation-focused engineering student",
        location: "New York, NY"
      },
      github: {
        url: "https://github.com/marstankeldim",
        display_name: "Ayan Ospan",
        bio: "Builds robotics and automation systems",
        location: "New York, NY"
      },
      education: {
        school: "Penn State",
        degree: "B.S. Electrical Engineering",
        graduation: "May 2027"
      },
      preferences: {
        work_modes: "Remote or hybrid"
      }
    },
    coverLetterText: "This is my cover letter.",
    coverLetterLatex: "\\\\documentclass{letter}",
    resumeMeta: { name: "resume.pdf" },
    autofillSettings: {
      mode: "conservative",
      aiFallbackEnabled: false
    },
    ...overrides
  };
}

test("parseAutocompleteAttribute keeps detail tokens and strips control tokens", async () => {
  const core = await loadCore();
  const parsed = core.parseAutocompleteAttribute("section-app shipping given-name");
  assert.deepEqual([...parsed.tokens], ["section-app", "shipping", "given-name"]);
  assert.deepEqual([...parsed.detailTokens], ["given-name"]);
});

test("buildStructuredProfile derives canonical fields", async () => {
  const core = await loadCore();
  const context = makeContext();
  const structured = core.buildStructuredProfile(context.profile, context);
  assert.equal(structured.given_name, "Ayan");
  assert.equal(structured.family_name, "Ospan");
  assert.equal(structured.linkedin_url, "https://www.linkedin.com/in/ayan-ospan");
  assert.equal(structured.resume_file, "resume.pdf");
  assert.equal(structured.school, "Penn State");
  assert.equal(structured.highest_degree, "B.S. Electrical Engineering");
});

test("matchResolvedField prefers autocomplete over heuristics", async () => {
  const core = await loadCore();
  const answerContext = core.buildAnswerContext(makeContext());
  const match = core.matchResolvedField(
    {
      fieldId: "name-1",
      kind: "text",
      accessibleName: "First name",
      groupName: "",
      sectionPath: "Contact",
      signalText: "First name",
      signalTextNormalized: "first name",
      questionText: "First name",
      questionNormalized: "first name",
      questionTokens: ["first", "name"],
      autocompleteTokens: ["given-name"],
      adapterHints: [],
      options: [],
      policyBucket: ""
    },
    answerContext,
    "generic"
  );
  assert.equal(match.decision, "fill");
  assert.equal(match.taxonomyKey, "given_name");
  assert.equal(match.source, "autocomplete");
  assert.equal(match.selectedAnswer, "Ayan");
});

test("matchResolvedField routes medium-confidence longform prompts to review", async () => {
  const core = await loadCore();
  const answerContext = core.buildAnswerContext(makeContext());
  const match = core.matchResolvedField(
    {
      fieldId: "motivation-1",
      kind: "textarea",
      accessibleName: "Why do you want this job?",
      groupName: "",
      sectionPath: "Application Questions",
      signalText: "Why do you want this job?",
      signalTextNormalized: "why do you want this job",
      questionText: "Why do you want this job?",
      questionNormalized: "why do you want this job",
      questionTokens: ["why", "do", "you", "want", "this", "job"],
      autocompleteTokens: [],
      adapterHints: [],
      options: [],
      policyBucket: ""
    },
    answerContext,
    "linkedin"
  );
  assert.equal(match.decision, "review");
  assert.equal(match.source, "question_bank");
  assert.match(match.selectedAnswer, /automation/i);
});

test("policy bucket blocks unrelated answers from equal opportunity sections", async () => {
  const core = await loadCore();
  const answerContext = core.buildAnswerContext(makeContext());
  const match = core.matchResolvedField(
    {
      fieldId: "eeo-1",
      kind: "text",
      accessibleName: "Equal Employment Opportunity",
      groupName: "Voluntary Self Identification",
      sectionPath: "Equal Employment Opportunity",
      signalText: "portfolio url equal employment opportunity",
      signalTextNormalized: "portfolio url equal employment opportunity",
      questionText: "Portfolio URL",
      questionNormalized: "portfolio url",
      questionTokens: ["portfolio", "url"],
      autocompleteTokens: [],
      adapterHints: [],
      options: [],
      policyBucket: "eeo"
    },
    answerContext,
    "generic"
  );
  assert.equal(match.decision, "skip");
});

test("generated candidate answers use existing candidate data instead of duplicate canned questions", async () => {
  const core = await loadCore();
  const answerContext = core.buildAnswerContext(makeContext());
  const match = core.matchResolvedField(
    {
      fieldId: "background-1",
      kind: "textarea",
      accessibleName: "Tell us about your background",
      groupName: "",
      sectionPath: "Application Questions",
      signalText: "Tell us about your background",
      signalTextNormalized: "tell us about your background",
      questionText: "Tell us about your background",
      questionNormalized: "tell us about your background",
      questionTokens: ["tell", "us", "about", "your", "background"],
      autocompleteTokens: [],
      adapterHints: [],
      options: [],
      policyBucket: ""
    },
    answerContext,
    "generic"
  );
  assert.equal(match.source, "generated");
  assert.match(match.selectedAnswer, /Penn State|automation/i);
});
