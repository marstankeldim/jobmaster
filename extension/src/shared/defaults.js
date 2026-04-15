export const STATUS_OPTIONS = [
  "saved",
  "applying",
  "submitted",
  "interview",
  "offer",
  "rejected",
  "withdrawn"
];

export const STORAGE_KEYS = {
  profile: "jm.profile",
  answers: "jm.answers",
  candidateSources: "jm.candidateSources",
  coverLetterTemplate: "jm.coverLetterTemplate",
  jobs: "jm.jobs",
  events: "jm.events",
  resumeMeta: "jm.resumeMeta"
};

export const DEFAULT_PROFILE = {
  full_name: "Your Name",
  email: "you@example.com",
  phone: "555-555-5555",
  location: "Your City, State",
  linkedin: "https://www.linkedin.com/in/your-name",
  github: "https://github.com/your-name",
  portfolio: "",
  resume_path: "",
  summary: "Generate your professional summary from the candidate source data.",
  top_skills: "Python, automation, APIs, backend engineering",
  work_authorization: "Yes",
  sponsorship_needed: "No",
  salary_expectation: "",
  available_start_date: "Two weeks after offer",
  preferred_workplace: "Remote or hybrid"
};

export const DEFAULT_ANSWERS = {
  answers: [
    {
      question: "Are you legally authorized to work in the United States?",
      answer: "Yes",
      aliases: ["authorized to work", "work authorization", "eligible to work"]
    },
    {
      question: "Will you now or in the future require visa sponsorship?",
      answer: "No",
      aliases: ["sponsorship", "visa sponsorship", "require sponsorship"]
    },
    {
      question: "What is your preferred work arrangement?",
      answer: "Remote or hybrid",
      aliases: ["remote", "hybrid", "onsite", "work arrangement"]
    }
  ]
};

export const DEFAULT_CANDIDATE_SOURCES = {
  resume: {
    path: "",
    extracted_text: "",
    notes: ""
  },
  linkedin: {
    url: "",
    headline: "",
    location: "",
    status: "",
    notes: ""
  },
  github: {
    url: "",
    display_name: "",
    username: "",
    bio: "",
    location: "",
    orcid: "",
    repository_count: 0,
    starred_count: 0,
    repositories: []
  },
  education: {
    school: "",
    degree: "",
    graduation: "",
    notes: ""
  },
  experience_highlights: [],
  project_highlights: [],
  preferences: {
    target_roles: "",
    industries: "",
    work_modes: ""
  },
  extra_context: ""
};

export const DEFAULT_COVER_LETTER_TEMPLATE = String.raw`\documentclass[11pt]{letter}
\usepackage[margin=1in]{{geometry}}
\usepackage[T1]{{fontenc}}
\usepackage{{lmodern}}
\signature{{{full_name}}}
\address{{{full_name} \\ {location} \\ {email} \\ {phone}}}
\date{{{today}}}

\begin{{document}}

\begin{{letter}}{{{company} Hiring Team \\ {location}}}
\opening{{Dear {company} Hiring Team,}}

I am excited to apply for the {title} role at {company}. My background aligns well with the work your team is doing, especially across {top_skills}.

{summary}

I would welcome the opportunity to contribute to {company} and discuss how I can add value to the team.

\closing{{Sincerely,}}
\end{{letter}}

\end{{document}}`;

export function createDefaultState() {
  return {
    profile: structuredClone(DEFAULT_PROFILE),
    answers: structuredClone(DEFAULT_ANSWERS),
    candidateSources: structuredClone(DEFAULT_CANDIDATE_SOURCES),
    coverLetterTemplate: DEFAULT_COVER_LETTER_TEMPLATE,
    jobs: [],
    events: [],
    resumeMeta: null
  };
}

