// One-off: point the saved Target Profile(s) at the new skill keys so the feed works
// immediately after the skills list was expanded. Edit/refine in the UI anytime.
import mongoose from "mongoose";

const SKILLS = [
  "wordpress", "woocommerce", "shopify", "magento", "prestashop", "opencart",
  "php", "laravel", "codeigniter", "node", "python",
  "react", "angular", "frontend", "backend", "full-stack",
  "web-development", "website-build", "web-application",
  "api", "api-integration", "payment-gateway",
  "mobile-app", "android", "ios",
  "seo", "adwords", "website-design",
  "wp-plugin", "wp-design", "elementor",
  "ecommerce", "cms", "joomla", "drupal",
  "chatbot", "chatgpt", "ai",
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: "bidcopilot" });
  const r = await mongoose.connection.db
    .collection("targetprofiles")
    .updateMany({}, { $set: { skills: SKILLS } });
  console.log("Target profiles updated:", r.modifiedCount, "| skills set:", SKILLS.length);
  await mongoose.disconnect();
}
main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
