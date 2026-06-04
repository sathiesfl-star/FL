/**
 * Project — a Freelancer.com project we fetched, scoped to an account (multi-tenant).
 * Stores the raw project + (later) AI score + generated proposal + bid status.
 */
import { Schema, model, models, type Model, type Types } from "mongoose";

export type ProjectStatus = "new" | "shortlisted" | "proposal_ready" | "bid_manually" | "skipped";

export interface IProject {
  _id: Types.ObjectId;
  accountId: Types.ObjectId;
  freelancerId: string; // project id on freelancer.com (for dedupe + the bid link)
  title: string;
  description: string;
  url: string; // direct link to bid on freelancer.com
  skills: string[]; // skill/job names from the project
  budgetMin?: number;
  budgetMax?: number;
  currency: string; // e.g. "USD"
  projectType: "fixed" | "hourly";
  bidCount: number;
  clientCountry?: string;
  clientPaymentVerified?: boolean;
  sealed: boolean;
  postedAt: Date;

  // Phase 2 (AI) — filled later
  aiScore?: number; // 1-10 fit
  aiReasons?: string[];
  redFlags?: string[];
  proposal?: string;

  status: ProjectStatus;
  fetchedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProject>(
  {
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true, index: true },
    freelancerId: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    url: { type: String, default: "" },
    skills: { type: [String], default: [] },
    budgetMin: Number,
    budgetMax: Number,
    currency: { type: String, default: "USD" },
    projectType: { type: String, enum: ["fixed", "hourly"], default: "fixed" },
    bidCount: { type: Number, default: 0 },
    clientCountry: String,
    clientPaymentVerified: Boolean,
    sealed: { type: Boolean, default: false },
    postedAt: { type: Date, default: Date.now },

    aiScore: Number,
    aiReasons: [String],
    redFlags: [String],
    proposal: String,

    status: { type: String, enum: ["new", "shortlisted", "proposal_ready", "bid_manually", "skipped"], default: "new" },
    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Per-tenant dedupe + listing
ProjectSchema.index({ accountId: 1, freelancerId: 1 }, { unique: true });
ProjectSchema.index({ accountId: 1, postedAt: -1 });
ProjectSchema.index({ accountId: 1, aiScore: -1 });

export const Project: Model<IProject> =
  (models.Project as Model<IProject>) || model<IProject>("Project", ProjectSchema);
