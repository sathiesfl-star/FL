/**
 * Account — a tenant (one agency). Stallioni is account #1.
 * SaaS-ready: every Project/Profile is scoped to an accountId. Per-account secrets live here.
 */
import { Schema, model, models, type Model, type Types } from "mongoose";

export interface IAgencyProfile {
  oneLiner: string;
  site: string;
  strengths: string[];
  tone: string;
  rules: string[];
  winningProposals: string[]; // editable from the Settings page; AI mimics these
  pastProjects: string; // free-text portfolio (pasted from a doc); AI references relevant ones
}

export interface IAccount {
  _id: Types.ObjectId;
  name: string;
  // Per-account Freelancer credentials (never global). Encrypt at rest in production.
  freelancerOAuthToken?: string;
  freelancerUserId?: string;
  agencyProfile?: IAgencyProfile;
  createdAt: Date;
  updatedAt: Date;
}

const AgencyProfileSchema = new Schema<IAgencyProfile>(
  {
    oneLiner: { type: String, default: "" },
    site: { type: String, default: "" },
    strengths: { type: [String], default: [] },
    tone: { type: String, default: "" },
    rules: { type: [String], default: [] },
    winningProposals: { type: [String], default: [] },
    pastProjects: { type: String, default: "" },
  },
  { _id: false }
);

const AccountSchema = new Schema<IAccount>(
  {
    name: { type: String, required: true },
    freelancerOAuthToken: { type: String, select: false },
    freelancerUserId: String,
    agencyProfile: AgencyProfileSchema,
  },
  { timestamps: true }
);

export const Account: Model<IAccount> =
  (models.Account as Model<IAccount>) || model<IAccount>("Account", AccountSchema);
