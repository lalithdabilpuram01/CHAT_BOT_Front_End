import type { Project } from "./types";

// Add a project here to reuse the workspace with a different knowledge base.
// These are fictional sample documents, not uploaded or retrieved files.
export const projects: Project[] = [
  {
    id: "product",
    name: "Product knowledge",
    category: "PRODUCT & ENGINEERING",
    initials: "PK",
    description:
      "Connect the dots across your product, decisions, and documentation.",
    prompts: [
      "What are our priorities for the next release?",
      "How does the team make product decisions?",
      "Summarize the onboarding experience",
    ],
    keywords: [
      "priorit",
      "release",
      "product",
      "decision",
      "onboard",
      "roadmap",
    ],
    sources: [
      {
        id: "roadmap",
        title: "Product roadmap",
        kind: "PDF",
        page: 4,
        updated: "Sep 18, 2026",
        excerpt:
          "The next release focuses on guided onboarding, evidence visibility, and workspace reliability. New integrations follow after these foundations are validated.",
      },
      {
        id: "principles",
        title: "Design principles",
        kind: "MD",
        page: 1,
        updated: "Sep 16, 2026",
        excerpt:
          "Make evidence easy to inspect. Prefer a clear statement of uncertainty over an unsupported answer. Product decisions should reduce the time between a question and a verifiable answer.",
      },
      {
        id: "onboarding",
        title: "Onboarding playbook",
        kind: "PDF",
        page: 7,
        updated: "Sep 12, 2026",
        excerpt:
          "The first-run experience guides a new user through selecting a knowledge base, asking a suggested question, and opening the source behind the answer.",
      },
    ],
    answer:
      "The sample product documents point to three connected priorities:\n\n### 1. Make the first answer effortless\nGuide people from choosing a knowledge base to asking their first question. The onboarding playbook ends that flow with opening the supporting source.\n\n### 2. Put evidence within reach\nThe design principles call for easy-to-inspect evidence and clear uncertainty when an answer is unsupported.\n\n### 3. Build a dependable foundation\nThe roadmap prioritizes workspace reliability alongside onboarding and evidence visibility, before new integrations.\n\n**The common thread:** shorten the path from a question to an answer someone can verify.",
  },
  {
    id: "research",
    name: "Research library",
    category: "RESEARCH & DISCOVERY",
    initials: "RL",
    description:
      "Turn your reading into connections, comparisons, and clearer thinking.",
    prompts: [
      "What does the evaluation guide measure?",
      "How should we compare retrieval experiments?",
      "Summarize the research notes",
    ],
    keywords: [
      "evaluat",
      "research",
      "retriev",
      "experiment",
      "measure",
      "compar",
    ],
    sources: [
      {
        id: "evaluation",
        title: "Evaluation guide",
        kind: "MD",
        page: 1,
        updated: "Sep 20, 2026",
        excerpt:
          "Evaluate retrieval and generation separately. Track whether retrieved passages contain the needed evidence, then assess whether the answer is supported by those passages.",
      },
      {
        id: "experiments",
        title: "Experiment notes",
        kind: "PDF",
        page: 3,
        updated: "Sep 17, 2026",
        excerpt:
          "Use a fixed question set when comparing retrieval configurations. Include unanswerable questions and report latency alongside quality. Do not equate similarity scores with calibrated answer confidence.",
      },
    ],
    answer:
      "The sample research library recommends evaluating **retrieval and generation separately**.\n\n- **Retrieval:** do the returned passages contain the evidence needed to answer?\n- **Generation:** does the response stay supported by those passages?\n- **Comparison:** use the same question set for each configuration, including questions the library cannot answer.\n- **Performance:** report latency alongside quality.\n\nA retrieval similarity score is not a calibrated measure of answer confidence. Inspect the supporting evidence instead.",
  },
  {
    id: "team",
    name: "Team handbook",
    category: "PEOPLE & OPERATIONS",
    initials: "TH",
    description: "A shared home for the ways your team works together.",
    prompts: [
      "How do we document team decisions?",
      "What should a project handoff include?",
      "Summarize our working agreements",
    ],
    keywords: [
      "team",
      "decision",
      "handoff",
      "working",
      "agreement",
      "document",
    ],
    sources: [
      {
        id: "agreements",
        title: "Working agreements",
        kind: "MD",
        page: 1,
        updated: "Sep 15, 2026",
        excerpt:
          "Record significant decisions with an owner, date, context, and next action. Share written context before meetings so the discussion can focus on unresolved questions.",
      },
      {
        id: "handoff",
        title: "Project handoff guide",
        kind: "PDF",
        page: 2,
        updated: "Sep 10, 2026",
        excerpt:
          "A project handoff includes the current state, links to source material, known issues, the next milestone, and a named owner for follow-up.",
      },
    ],
    answer:
      "The sample handbook makes written context the foundation of collaboration.\n\n### Document decisions\nCapture the **owner, date, context, and next action** for important decisions. Share the background before meetings.\n\n### Make handoffs actionable\nInclude the current state, source material, known issues, next milestone, and a named follow-up owner.\n\nTogether, these practices give the next person enough context to continue the work.",
  },
];
