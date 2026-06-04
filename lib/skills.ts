/**
 * Selectable skills, grouped — drives the Target Profile UI and project relevance.
 * This is the user's REAL Freelancer.com skill set, so the `match` keywords line up with
 * actual project tags/descriptions on the platform.
 */

export interface SkillDef {
  key: string;
  label: string;
  group: string;
  match: string[]; // lowercase keywords to match against a project's skills/title/description
}

export const SKILL_GROUPS = [
  "Web Development",
  "Frontend",
  "Backend & Languages",
  "WordPress & CMS",
  "E-Commerce",
  "Mobile",
  "Cloud, DevOps & Hosting",
  "Integrations & APIs",
  "AI & Data",
  "Marketing & SEO",
  "Design",
  "Other",
] as const;

const s = (key: string, label: string, group: string, match: string[]): SkillDef => ({ key, label, group, match });

export const SKILLS: SkillDef[] = [
  // Web Development
  s("web-development", "Web Development", "Web Development", ["web development", "web developer"]),
  s("website-build", "Website Build", "Web Development", ["website build", "build website", "website development"]),
  s("web-application", "Web Application", "Web Development", ["web application", "web app"]),
  s("full-stack", "Full Stack Development", "Web Development", ["full stack", "full-stack", "fullstack"]),
  s("website-management", "Website Management", "Web Development", ["website management", "website maintenance"]),
  s("website-optimization", "Website Optimization", "Web Development", ["website optimization", "performance optimization", "page speed"]),
  s("landing-pages", "Landing Pages", "Web Development", ["landing page", "landing pages"]),
  s("parallax", "Parallax Scrolling", "Web Development", ["parallax"]),

  // Frontend
  s("html", "HTML / HTML5", "Frontend", ["html", "html5"]),
  s("css", "CSS / CSS3 / Sass", "Frontend", ["css", "css3", "less", "sass", "scss"]),
  s("javascript", "JavaScript", "Frontend", ["javascript", "js"]),
  s("jquery", "jQuery / AJAX", "Frontend", ["jquery", "ajax"]),
  s("bootstrap", "Bootstrap", "Frontend", ["bootstrap"]),
  s("react", "React.js", "Frontend", ["react", "react.js", "reactjs", "next.js", "nextjs"]),
  s("angular", "AngularJS", "Frontend", ["angular", "angularjs"]),
  s("frontend", "Frontend Development", "Frontend", ["frontend", "front-end", "front end"]),
  s("webflow", "Webflow", "Frontend", ["webflow"]),
  s("wix", "Wix", "Frontend", ["wix"]),
  s("squarespace", "Squarespace", "Frontend", ["squarespace"]),
  s("figma", "Figma", "Frontend", ["figma"]),

  // Backend & Languages
  s("php", "PHP", "Backend & Languages", ["php"]),
  s("laravel", "Laravel", "Backend & Languages", ["laravel"]),
  s("codeigniter", "CodeIgniter", "Backend & Languages", ["codeigniter"]),
  s("cakephp", "CakePHP", "Backend & Languages", ["cakephp"]),
  s("symfony", "Symfony", "Backend & Languages", ["symfony"]),
  s("node", "Node.js / Express", "Backend & Languages", ["node.js", "nodejs", "express", "express js"]),
  s("python", "Python", "Backend & Languages", ["python", "django", "flask", "fastapi"]),
  s("mysql", "MySQL", "Backend & Languages", ["mysql"]),
  s("database", "Database Management", "Backend & Languages", ["database", "phpmyadmin", "database management"]),
  s("elasticsearch", "Elasticsearch", "Backend & Languages", ["elasticsearch"]),
  s("backend", "Backend Development", "Backend & Languages", ["backend", "back-end", "back end"]),
  s("software-dev", "Software Development", "Backend & Languages", ["software development", "programming", "coding"]),
  s("algorithm", "Algorithm", "Backend & Languages", ["algorithm"]),
  s("git", "Git", "Backend & Languages", ["git", "github", "gitlab"]),
  s("xml", "XML / JSON", "Backend & Languages", ["xml", "json"]),
  s("matlab", "MATLAB", "Backend & Languages", ["matlab"]),

  // WordPress & CMS
  s("wordpress", "WordPress", "WordPress & CMS", ["wordpress", "wp"]),
  s("wp-plugin", "WordPress Plugin", "WordPress & CMS", ["wordpress plugin", "wp plugin", "custom plugin"]),
  s("wp-design", "WordPress Design", "WordPress & CMS", ["wordpress design", "wordpress theme"]),
  s("elementor", "Elementor", "WordPress & CMS", ["elementor"]),
  s("joomla", "Joomla", "WordPress & CMS", ["joomla"]),
  s("drupal", "Drupal", "WordPress & CMS", ["drupal"]),
  s("typo3", "TYPO3", "WordPress & CMS", ["typo3"]),
  s("cms", "CMS", "WordPress & CMS", ["cms", "content management"]),
  s("vbulletin", "vBulletin", "WordPress & CMS", ["vbulletin"]),
  s("lms", "LMS", "WordPress & CMS", ["lms", "learning management"]),
  s("blog", "Blog", "WordPress & CMS", ["blog"]),

  // E-Commerce
  s("ecommerce", "eCommerce", "E-Commerce", ["ecommerce", "e-commerce", "online store"]),
  s("woocommerce", "WooCommerce", "E-Commerce", ["woocommerce", "woo commerce"]),
  s("shopify", "Shopify", "E-Commerce", ["shopify", "liquid", "shopify template"]),
  s("magento", "Magento / Magento 2", "E-Commerce", ["magento", "magento 2"]),
  s("prestashop", "PrestaShop", "E-Commerce", ["prestashop"]),
  s("opencart", "OpenCart", "E-Commerce", ["opencart", "open cart"]),
  s("bigcommerce", "BigCommerce", "E-Commerce", ["bigcommerce"]),
  s("oscommerce", "osCommerce", "E-Commerce", ["oscommerce"]),
  s("zencart", "Zen Cart", "E-Commerce", ["zen cart", "zencart"]),
  s("cscart", "CS-Cart", "E-Commerce", ["cs-cart", "cscart"]),
  s("virtuemart", "VirtueMart", "E-Commerce", ["virtuemart"]),
  s("cart-integration", "Shopping Cart Integration", "E-Commerce", ["shopping cart", "cart integration"]),
  s("payment-gateway", "Payment Gateway / PayPal / Stripe", "E-Commerce", ["payment gateway", "paypal", "stripe", "payment integration"]),

  // Mobile
  s("mobile-app", "Mobile App Development", "Mobile", ["mobile app", "mobile application", "app development"]),
  s("android", "Android", "Mobile", ["android", "android app"]),
  s("ios", "iOS Development", "Mobile", ["ios", "iphone", "swift"]),
  s("app-testing", "Mobile App Testing", "Mobile", ["app testing", "mobile testing"]),
  s("push", "Push Notification", "Mobile", ["push notification"]),

  // Cloud, DevOps & Hosting
  s("cloud", "Cloud Computing", "Cloud, DevOps & Hosting", ["cloud computing", "cloud"]),
  s("digitalocean", "DigitalOcean", "Cloud, DevOps & Hosting", ["digitalocean", "digital ocean"]),
  s("linux", "Linux / Ubuntu", "Cloud, DevOps & Hosting", ["linux", "ubuntu"]),
  s("hosting", "Web Hosting / Plesk / WHMCS", "Cloud, DevOps & Hosting", ["web hosting", "hosting", "plesk", "whmcs", "cpanel"]),
  s("dns", "DNS", "Cloud, DevOps & Hosting", ["dns"]),
  s("troubleshooting", "Troubleshooting", "Cloud, DevOps & Hosting", ["troubleshooting", "bug fix", "debug"]),
  s("script-install", "Script Install", "Cloud, DevOps & Hosting", ["script install", "install script"]),

  // Integrations & APIs
  s("api", "API / Web API", "Integrations & APIs", ["api", "web api", "rest api"]),
  s("api-dev", "API Development", "Integrations & APIs", ["api development"]),
  s("api-integration", "API Integration", "Integrations & APIs", ["api integration", "third party integration"]),
  s("restful", "RESTful", "Integrations & APIs", ["restful", "rest"]),
  s("oauth", "OAuth", "Integrations & APIs", ["oauth"]),
  s("curl", "cURL", "Integrations & APIs", ["curl"]),
  s("zapier", "Zapier", "Integrations & APIs", ["zapier"]),
  s("facebook-api", "Facebook / Instagram API", "Integrations & APIs", ["facebook api", "instagram api"]),
  s("twitter-api", "Twitter API", "Integrations & APIs", ["twitter api"]),
  s("google-maps", "Google Maps API", "Integrations & APIs", ["google maps", "maps api"]),
  s("mailchimp", "Mailchimp / Newsletters", "Integrations & APIs", ["mailchimp", "newsletter", "newsletters"]),
  s("crm", "CRM / Salesforce / Zoho", "Integrations & APIs", ["crm", "salesforce", "zoho"]),
  s("erp", "ERP Software", "Integrations & APIs", ["erp", "erp software"]),

  // AI & Data
  s("ai", "Artificial Intelligence", "AI & Data", ["artificial intelligence", "ai ", "machine learning"]),
  s("chatbot", "AI Chatbot Development", "AI & Data", ["chatbot", "ai chatbot", "chat bot"]),
  s("chatgpt", "ChatGPT", "AI & Data", ["chatgpt", "gpt", "openai"]),
  s("data-processing", "Data Processing", "AI & Data", ["data processing"]),
  s("data-entry", "Data Entry", "AI & Data", ["data entry"]),
  s("web-search", "Web Search / Leads", "AI & Data", ["web search", "leads", "lead generation"]),
  s("excel", "Excel / Google Sheets", "AI & Data", ["excel", "google sheets", "spreadsheet"]),
  s("documentation", "Documentation", "AI & Data", ["documentation", "technical writing"]),

  // Marketing & SEO
  s("seo", "SEO / SEO Auditing", "Marketing & SEO", ["seo", "search engine optimization", "seo audit"]),
  s("adwords", "Google Adwords", "Marketing & SEO", ["google adwords", "google ads", "adwords", "ppc"]),
  s("analytics", "Google Analytics / Website Analytics", "Marketing & SEO", ["google analytics", "website analytics"]),
  s("social-media", "Social Media Management", "Marketing & SEO", ["social media", "social networking", "social media management"]),
  s("content-writing", "Content Writing", "Marketing & SEO", ["content writing", "copywriting"]),

  // Design
  s("website-design", "Website Design", "Design", ["website design", "web design", "ui/ux", "ui ux"]),
  s("graphic-design", "Graphic Design", "Design", ["graphic design"]),
  s("logo-design", "Logo Design", "Design", ["logo design", "logo"]),
  s("banner-design", "Banner Design", "Design", ["banner design", "banner"]),
  s("corporate-identity", "Corporate Identity", "Design", ["corporate identity", "brand identity"]),
  s("fashion-design", "Fashion Design", "Design", ["fashion design"]),
  s("3d-rendering", "3D Rendering", "Design", ["3d rendering", "3d render"]),
  s("coreldraw", "Corel Draw", "Design", ["corel draw", "coreldraw"]),

  // Other
  s("web-security", "Web Security", "Other", ["web security", "security", "penetration"]),
  s("website-testing", "Website Testing", "Other", ["website testing", "qa", "testing"]),
  s("startups", "Startups", "Other", ["startup", "startups", "mvp"]),
];

export function skillByKey(key: string): SkillDef | undefined {
  return SKILLS.find((sk) => sk.key === key);
}

/** All match-keywords for a set of selected skill keys. */
export function matchKeywordsFor(skillKeys: string[]): string[] {
  return skillKeys.flatMap((k) => skillByKey(k)?.match ?? []);
}
