/**
 * TargetProfile — the SELECTABLE bidding profile for an account.
 * Drives which projects get fetched + how the AI scores them. Fully user-configurable
 * (the user picks skills, budget range, what to avoid) — nothing hardcoded.
 */
import { Schema, model, models, type Model, type Types } from "mongoose";

export interface ITargetProfile {
  _id: Types.ObjectId;
  accountId: Types.ObjectId;
  name: string; // e.g. "WordPress + Shopify focus"
  active: boolean;
  skills: string[]; // selected skill keys (see lib/skills.ts)
  minBudgetUsd: number; // ignore projects below this
  maxBudgetUsd?: number; // optional ceiling
  projectTypes: ("fixed" | "hourly")[];
  avoid: {
    contests: boolean;
    sealed: boolean; // NDA / sealed bids
    unverifiedClients: boolean; // no payment verified
    vague: boolean; // one-line / low-effort posts
  };
  createdAt: Date;
  updatedAt: Date;
}

const TargetProfileSchema = new Schema<ITargetProfile>(
  {
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true, index: true },
    name: { type: String, required: true, default: "My bidding profile" },
    active: { type: Boolean, default: true },
    skills: { type: [String], default: [] },
    minBudgetUsd: { type: Number, default: 0 },
    maxBudgetUsd: Number,
    projectTypes: { type: [String], default: ["fixed", "hourly"] },
    avoid: {
      contests: { type: Boolean, default: true },
      sealed: { type: Boolean, default: true },
      unverifiedClients: { type: Boolean, default: false },
      vague: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

export const TargetProfile: Model<ITargetProfile> =
  (models.TargetProfile as Model<ITargetProfile>) ||
  model<ITargetProfile>("TargetProfile", TargetProfileSchema);
