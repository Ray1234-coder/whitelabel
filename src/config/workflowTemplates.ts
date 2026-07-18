import type { WorkflowNode } from "@/lib/types";

// Starter workflow templates shown when building a new workflow — real
// small-business recipes (inspired by Google's "Gemini Flow" concept site),
// written in plain English against whatever apps the agent has connected.
// Picking one just pre-fills the builder; the user can edit everything.

export interface WorkflowTemplate {
  id: string;
  icon: string;
  category: string;
  title: string;
  blurb: string;
  trigger_type: "schedule" | "webhook";
  cadence?: "hourly" | "daily" | "weekly";
  steps: WorkflowNode[];
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "morning-brief",
    icon: "☀️",
    category: "Personal",
    title: "Morning brief",
    blurb: "Start the day with one calm, prioritized plan.",
    trigger_type: "schedule",
    cadence: "daily",
    steps: [
      {
        title: "Look around",
        branches: [
          {
            title: "Calendar",
            steps: [
              {
                title: "Review today's schedule",
                instructions:
                  "Look at today's calendar. Note the meetings, any conflicts, and the open focus blocks.",
              },
            ],
          },
          {
            title: "Email",
            steps: [
              {
                title: "Find what needs attention",
                instructions:
                  "Check unread email and pick out the messages from customers or the team that actually need a reply today.",
              },
            ],
          },
        ],
      },
      {
        title: "Write my morning brief",
        instructions:
          "Combine the schedule and the important emails into a short, upbeat morning brief: top 3 priorities, meetings to prepare for, and anything urgent.",
      },
    ],
  },
  {
    id: "job-dispatch",
    icon: "🚨",
    category: "Home services",
    title: "Emergency job dispatch",
    blurb: "A service request comes in — triage it, log it, line up the visit.",
    trigger_type: "webhook",
    steps: [
      {
        title: "Triage the request",
        instructions:
          "Read the incoming service request. Summarize the customer's problem in one or two sentences and classify how urgent it is (emergency, this week, whenever).",
      },
      {
        title: "Get it scheduled",
        branches: [
          {
            title: "Log it",
            steps: [
              {
                title: "Create the job record",
                instructions:
                  "Add the job to the job list or spreadsheet: customer name, contact, address, problem summary, and urgency.",
              },
            ],
          },
          {
            title: "Book it",
            steps: [
              {
                title: "Find an appointment window",
                instructions:
                  "Look at the calendar and suggest the best available appointment window that matches the urgency.",
              },
            ],
          },
        ],
      },
      {
        title: "Draft the messages",
        instructions:
          "Draft a friendly confirmation for the customer (what we understood, when we can come) and a short job summary for the technician. Do not send — leave them ready for review.",
      },
    ],
  },
  {
    id: "lead-followup",
    icon: "🏠",
    category: "Sales & real estate",
    title: "New lead follow-up",
    blurb: "Answer a new inquiry personally, fast, with a clear next step.",
    trigger_type: "webhook",
    steps: [
      {
        title: "Understand the inquiry",
        instructions:
          "Read the new lead's message. Note what they're asking about, their budget or constraints if given, and how quickly they seem to want to move.",
      },
      {
        title: "Gather context",
        branches: [
          {
            title: "History",
            steps: [
              {
                title: "Check past conversations",
                instructions:
                  "Search email for earlier conversations with this person so we don't repeat what they already know.",
              },
            ],
          },
          {
            title: "Materials",
            steps: [
              {
                title: "Collect the right materials",
                instructions:
                  "Find the documents or listings that match what they asked about (files, brochures, price sheets).",
              },
            ],
          },
        ],
      },
      {
        title: "Draft a personal reply",
        instructions:
          "Draft a warm, personal reply that answers their actual question, references the materials, and proposes ONE clear next step (a call, a tour, a quote). Leave it ready for review.",
      },
    ],
  },
  {
    id: "slot-fill",
    icon: "🦷",
    category: "Healthcare & appointments",
    title: "Fill a cancelled appointment",
    blurb: "Turn a cancellation into a filled slot from the waitlist.",
    trigger_type: "webhook",
    steps: [
      {
        title: "Understand the opening",
        instructions:
          "Read the cancellation details: when the slot is, how long it is, and what kind of appointment fits it.",
      },
      {
        title: "Match the waitlist",
        instructions:
          "Go through the waitlist and pick the best 2–3 people whose needs and availability fit this opening, in order.",
      },
      {
        title: "Draft the offers",
        instructions:
          "Draft a short, friendly offer message for the first person (with the time and how to confirm), plus backups for the next two. One at a time — don't offer the same slot to everyone at once.",
      },
    ],
  },
  {
    id: "opening-readiness",
    icon: "🍽️",
    category: "Hospitality",
    title: "Daily opening readiness",
    blurb: "Know what could block opening before the doors unlock.",
    trigger_type: "schedule",
    cadence: "daily",
    steps: [
      {
        title: "Check everything at once",
        branches: [
          {
            title: "Staffing",
            steps: [
              {
                title: "Check today's staffing",
                instructions:
                  "Look at today's schedule for callouts, uncovered roles, and anything unusual (big reservations, events).",
              },
            ],
          },
          {
            title: "Supplies",
            steps: [
              {
                title: "Review low stock",
                instructions:
                  "Check the inventory list for anything running low that today's service will need.",
              },
            ],
          },
          {
            title: "Messages",
            steps: [
              {
                title: "Scan vendor updates",
                instructions:
                  "Check email for delayed deliveries, repair updates, or anything from vendors that affects today.",
              },
            ],
          },
        ],
      },
      {
        title: "Create the opening checklist",
        instructions:
          "Turn everything found into a prioritized opening checklist: what must be handled before open, who should do it, and anything that could block opening.",
      },
    ],
  },
  {
    id: "estimate-followup",
    icon: "🔨",
    category: "Contractors & trades",
    title: "Estimate follow-up",
    blurb: "Quietly follow up on quotes that never got an answer.",
    trigger_type: "schedule",
    cadence: "daily",
    steps: [
      {
        title: "Find waiting estimates",
        instructions:
          "Look through recent conversations for estimates or quotes we sent that never got a reply (more than 3 days old).",
      },
      {
        title: "Check our availability",
        instructions:
          "Check the calendar so any follow-up only mentions start dates we can still honor.",
      },
      {
        title: "Draft the follow-ups",
        instructions:
          "For each waiting estimate, draft a short, low-pressure follow-up: answer likely concerns, mention the realistic start window, and offer one easy next step. Leave drafts for review.",
      },
    ],
  },
];
