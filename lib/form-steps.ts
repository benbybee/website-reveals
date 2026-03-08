export type QuestionnaireMode = "quick" | "standard" | "in-depth";

export interface Question {
  id: string;
  label: string;
  type: "text" | "textarea" | "email" | "tel" | "radio" | "checkbox" | "file" | "dns-selector";
  placeholder?: string;
  options?: string[];
  required?: boolean;
  hint?: string;
}

export interface FormStep {
  step: number;
  title: string;
  subtitle: string;
  icon: string;
  questions: Question[];
}

export const FORM_STEPS: FormStep[] = [
  {
    step: 1,
    title: "Tell Us About Your Business",
    subtitle: "Business Basics",
    icon: "🏢",
    questions: [
      { id: "business_name", label: "What is your business name?", type: "text", required: true },
      { id: "website_name", label: "What name should appear on the website?", type: "text" },
      { id: "phone", label: "Primary business phone number", type: "tel" },
      { id: "email", label: "Primary business email address", type: "email" },
      { id: "address", label: "Business address", type: "text" },
      { id: "address_display", label: "Show address on website?", type: "radio", options: ["Full address", "City/State only", "Don't show address"] },
      { id: "service_areas", label: "Cities, regions, or service areas you serve", type: "textarea" },
      { id: "excluded_areas", label: "Any locations you do NOT want to target?", type: "textarea" },
      { id: "contact_person", label: "Best contact person for this project", type: "text" },
      { id: "business_hours", label: "Business hours", type: "textarea" },
      { id: "contact_method", label: "Preferred customer contact method", type: "radio", options: ["Phone call", "Text message", "Email", "Contact form", "Multiple"] },
      { id: "social_media", label: "Social media accounts to link on the website", type: "textarea", hint: "e.g. facebook.com/yourbusiness, instagram.com/yourbusiness" },
      { id: "domain_owned", label: "Do you already own your domain name?", type: "radio", options: ["Yes", "No", "Not sure"] },
      { id: "domain_name", label: "If yes, what is your domain name?", type: "text", placeholder: "yourbusiness.com" },
      { id: "dns_provider", label: "Who manages your domain/DNS?", type: "dns-selector" },
    ],
  },
  {
    step: 2,
    title: "What Should This Website Do?",
    subtitle: "Website Goals",
    icon: "🎯",
    questions: [
      { id: "why_building", label: "Why are you building or redesigning your website right now?", type: "textarea" },
      { id: "top_goals", label: "What are the top 3 goals for this website?", type: "textarea" },
      { id: "visitor_actions", label: "What actions do you want visitors to take?", type: "textarea" },
      { id: "success_definition", label: "What would make this website a success in your eyes?", type: "textarea" },
      { id: "current_site_problems", label: "What are the biggest problems with your current website?", type: "textarea" },
      { id: "missing_online", label: "If no current website, what has been missing from your online presence?", type: "textarea" },
      { id: "what_hasnt_worked", label: "What has NOT worked well for you in the past with marketing or websites?", type: "textarea" },
      { id: "business_goals", label: "Business goals this site should support over the next 6–12 months", type: "textarea" },
      { id: "customer_type", label: "Is this website mainly for:", type: "radio", options: ["New customers", "Returning customers", "Both"] },
    ],
  },
  {
    step: 3,
    title: "Who Are You Trying to Reach?",
    subtitle: "Target Audience",
    icon: "👥",
    questions: [
      { id: "ideal_customer", label: "Who is your ideal customer?", type: "textarea" },
      { id: "profitable_customer", label: "What type of customer is most profitable for your business?", type: "textarea" },
      { id: "geographic_priority", label: "What geographic areas are most important for new customers?", type: "textarea" },
      { id: "customer_problems", label: "What problems are customers typically dealing with before they contact you?", type: "textarea" },
      { id: "motivation_to_reach_out", label: "What motivates them to finally reach out?", type: "textarea" },
      { id: "objections", label: "What concerns or objections do they usually have before buying?", type: "textarea" },
      { id: "what_they_care_about", label: "What do they care about most when choosing a business like yours?", type: "textarea" },
      { id: "customer_outcome", label: "What are customers hoping to achieve after working with you?", type: "textarea" },
      { id: "unwanted_customers", label: "Are there customer types you do NOT want to attract?", type: "textarea" },
      { id: "search_phrases", label: "What would customers search on Google to find you?", type: "textarea", hint: "e.g. 'plumber near me', 'best pizza in Austin'" },
    ],
  },
  {
    step: 4,
    title: "Your Brand Look and Feel",
    subtitle: "Brand Identity",
    icon: "🎨",
    questions: [
      { id: "has_logo", label: "Do you have an existing logo?", type: "radio", options: ["Yes", "No", "In progress"] },
      { id: "logo_files", label: "Upload your logo files", type: "file" },
      { id: "has_alternate_logos", label: "Do you have alternate logo versions?", type: "radio", options: ["Yes", "No"] },
      { id: "brand_colors", label: "What are your brand colors?", type: "textarea", hint: "e.g. Navy blue and gold" },
      { id: "hex_codes", label: "Exact hex codes if you know them", type: "text", placeholder: "#1a2b3c, #d4af37" },
      { id: "brand_fonts", label: "Do you have brand fonts to use on the website?", type: "radio", options: ["Yes", "No"] },
      { id: "font_names", label: "If yes, what are the font names?", type: "text" },
      { id: "brand_guidelines", label: "Upload brand guidelines or style guide", type: "file" },
      { id: "look_and_feel", label: "How would you describe the desired look and feel?", type: "textarea" },
      { id: "brand_personality", label: "Words that should describe your brand personality", type: "textarea", hint: "e.g. Professional, warm, approachable, bold" },
      { id: "brand_not", label: "Words that should NOT describe your brand", type: "textarea" },
      { id: "avoid_design", label: "Any colors, styles, or design trends to avoid?", type: "textarea" },
      { id: "brand_photos", label: "Upload any photos that reflect your brand", type: "file" },
      { id: "brand_feel", label: "Should the site feel more:", type: "radio", options: ["Personal", "Corporate", "Local", "Premium", "Mix of several"] },
    ],
  },
  {
    step: 5,
    title: "What Makes You Different?",
    subtitle: "Competitive Positioning",
    icon: "⚡",
    questions: [
      { id: "differentiators", label: "What differentiates your business from competitors?", type: "textarea" },
      { id: "why_choose_you", label: "Why do customers choose you instead of someone else?", type: "textarea" },
      { id: "do_better", label: "What do you do better than others in your industry?", type: "textarea" },
      { id: "compliments", label: "What do customers compliment you on most often?", type: "textarea" },
      { id: "unique_offerings", label: "Do you offer anything unique that competitors typically do not?", type: "textarea" },
      { id: "selling_points", label: "What are your strongest selling points?", type: "textarea" },
      { id: "trust_builders", label: "Guarantees, warranties, certifications, awards, or credentials", type: "textarea" },
      { id: "media_features", label: "Have you been featured in media or local organizations?", type: "textarea" },
      { id: "misconceptions", label: "Common misconceptions about your business the website should clear up", type: "textarea" },
      { id: "never_say", label: "What do you NEVER want your website copy to say or imply?", type: "textarea" },
    ],
  },
  {
    step: 6,
    title: "Existing Website + Sites You Love",
    subtitle: "Inspiration",
    icon: "🔍",
    questions: [
      { id: "current_url", label: "What is your current website URL?", type: "text", placeholder: "https://yoursite.com" },
      { id: "current_likes", label: "What do you like about your current website?", type: "textarea" },
      { id: "current_dislikes", label: "What do you dislike about your current website?", type: "textarea" },
      { id: "keep_content", label: "What pages or content from your current site should definitely stay?", type: "textarea" },
      { id: "remove_content", label: "What pages or content should be removed or replaced?", type: "textarea" },
      { id: "inspiration_sites", label: "Share 2–3 websites you love (any industry)", type: "textarea", hint: "Include what you like about each one" },
      { id: "dislike_styles", label: "Are there any website styles you strongly dislike?", type: "textarea" },
      { id: "content_preference", label: "Do you prefer:", type: "radio", options: ["Image-heavy", "Text-driven", "Balance of both"] },
    ],
  },
  {
    step: 7,
    title: "What You Sell and How You Explain It",
    subtitle: "Services & Offers",
    icon: "💼",
    questions: [
      { id: "all_services", label: "List all services you offer", type: "textarea" },
      { id: "priority_services", label: "Which services are highest priority to promote?", type: "textarea" },
      { id: "profitable_services", label: "Which services are most profitable?", type: "textarea" },
      { id: "most_leads", label: "Which services do you want the most leads for?", type: "textarea" },
      { id: "seasonal_services", label: "Any seasonal services or limited-time offers?", type: "textarea" },
      { id: "service_details", label: "For each main service, describe: name, short description, who it's for, main problem it solves, main benefit, starting price, common questions", type: "textarea" },
      { id: "packages", label: "Do you have service packages, tiers, or bundles?", type: "textarea" },
      { id: "downplay_services", label: "Any services you want to downplay or not feature prominently?", type: "textarea" },
      { id: "financing", label: "Do you have financing options, payment plans, or promotions?", type: "textarea" },
      { id: "products", label: "Any products sold online or in person that should be included?", type: "textarea" },
    ],
  },
  {
    step: 8,
    title: "What Your Customers Struggle With",
    subtitle: "Problems & Solutions",
    icon: "🔧",
    questions: [
      { id: "pre_find_problems", label: "What problems are customers experiencing before they find you?", type: "textarea" },
      { id: "problem_impact", label: "How do those problems affect their life, business, comfort, time, or money?", type: "textarea" },
      { id: "do_nothing", label: "What happens if they do nothing?", type: "textarea" },
      { id: "how_you_solve", label: "How does your business solve those problems?", type: "textarea" },
      { id: "results", label: "What results do customers typically get after working with you?", type: "textarea" },
      { id: "fears", label: "What fears or hesitations do people have before buying from you?", type: "textarea" },
      { id: "confidence_builders", label: "What do customers need to hear to feel confident contacting you?", type: "textarea" },
      { id: "pre_buy_questions", label: "Top questions customers ask before they buy", type: "textarea" },
      { id: "common_objections", label: "What objections do customers commonly raise?", type: "textarea" },
      { id: "overcome_objections", label: "What would you say to overcome those objections?", type: "textarea" },
    ],
  },
  {
    step: 9,
    title: "Content, Messaging, and FAQs",
    subtitle: "Content Strategy",
    icon: "✍️",
    questions: [
      { id: "rewrite_content", label: "Do you want us to rewrite and improve your current content?", type: "radio", options: ["Yes, rewrite everything", "Improve what I have", "Keep my content as-is"] },
      { id: "existing_pages", label: "What pages do you already have content for?", type: "textarea" },
      { id: "main_faqs", label: "What are the main FAQs you want answered on the site?", type: "textarea" },
      { id: "specific_phrases", label: "Specific phrases, terminology, or messaging you want used", type: "textarea" },
      { id: "avoid_phrases", label: "Words or phrases you do NOT want used", type: "textarea" },
      { id: "testimonials", label: "Do you have testimonials or reviews to feature?", type: "textarea", hint: "Paste them here or let us know where to find them" },
      { id: "team_bios", label: "Do you have team bios to include?", type: "textarea" },
      { id: "company_story", label: "Do you have a company story or About Us story?", type: "textarea" },
      { id: "mission_statement", label: "Mission statement, vision statement, or core values?", type: "textarea" },
      { id: "want_blog", label: "Do you want blog content or resources on the site?", type: "radio", options: ["Yes", "No", "Maybe later"] },
    ],
  },
  {
    step: 10,
    title: "Pages and Navigation",
    subtitle: "Site Structure",
    icon: "🗺️",
    questions: [
      { id: "needed_pages", label: "What pages do you think the website needs?", type: "textarea" },
      { id: "standard_pages", label: "Which of these standard pages do you need?", type: "checkbox", options: ["Home", "About", "Services", "Individual service pages", "Contact", "FAQ", "Blog", "Gallery", "Testimonials", "Financing", "Careers", "Team", "Resources", "Privacy Policy", "Terms and Conditions"] },
      { id: "want_blog_section", label: "Do you want a blog or article section?", type: "radio", options: ["Yes", "No", "Not sure yet"] },
    ],
  },
  {
    step: 11,
    title: "Anything Else We Should Know?",
    subtitle: "Final Notes",
    icon: "📝",
    questions: [
      { id: "anything_else", label: "Is there anything important we haven't asked that we should know?", type: "textarea" },
      { id: "specific_requests", label: "Any specific concerns, requests, or must-haves for this project?", type: "textarea" },
      { id: "definitely_not", label: "Is there anything you definitely do NOT want on the website?", type: "textarea" },
      { id: "success_feeling", label: "What would make you feel like this project was a win?", type: "textarea" },
    ],
  },
];

// ─── Quick Mode (< 5 min, 2 steps) ───────────────────────────────────────────

export const QUICK_STEPS: FormStep[] = [
  {
    step: 1,
    title: "Tell Us About Your Business",
    subtitle: "The Basics",
    icon: "🏢",
    questions: [
      { id: "business_name", label: "What is your business name?", type: "text", required: true },
      { id: "phone", label: "Phone number for customers to call", type: "tel" },
      { id: "email", label: "Email address for customers", type: "email" },
      { id: "service_areas", label: "What cities or regions do you serve?", type: "textarea" },
      { id: "contact_method", label: "How do you prefer customers to reach you?", type: "radio", options: ["Phone call", "Text message", "Email", "Contact form"] },
      { id: "domain_owned", label: "Do you already own your domain name?", type: "radio", options: ["Yes", "No", "Not sure"] },
      { id: "domain_name", label: "If yes, what is your domain name?", type: "text", placeholder: "yourbusiness.com" },
      { id: "dns_provider", label: "Who manages your domain/DNS?", type: "dns-selector" },
    ],
  },
  {
    step: 2,
    title: "Your Website",
    subtitle: "What We're Building",
    icon: "🎯",
    questions: [
      { id: "all_services", label: "What services or products do you offer?", type: "textarea" },
      { id: "why_building", label: "Why are you building or redesigning your website right now?", type: "textarea" },
      { id: "differentiators", label: "What makes your business different from competitors?", type: "textarea" },
      { id: "inspiration_sites", label: "Any websites you love or want yours to look similar to?", type: "textarea", hint: "Include what you like about each one" },
      { id: "anything_else", label: "Anything else we should know?", type: "textarea" },
    ],
  },
];

// ─── Standard Mode (~15 min, 6 steps) ────────────────────────────────────────

export const STANDARD_STEPS: FormStep[] = [
  {
    step: 1,
    title: "Tell Us About Your Business",
    subtitle: "Business Basics",
    icon: "🏢",
    questions: [
      { id: "business_name", label: "What is your business name?", type: "text", required: true },
      { id: "phone", label: "Primary business phone number", type: "tel" },
      { id: "email", label: "Primary business email address", type: "email" },
      { id: "address", label: "Business address", type: "text" },
      { id: "address_display", label: "Show address on website?", type: "radio", options: ["Full address", "City/State only", "Don't show address"] },
      { id: "service_areas", label: "Cities, regions, or service areas you serve", type: "textarea" },
      { id: "contact_method", label: "Preferred customer contact method", type: "radio", options: ["Phone call", "Text message", "Email", "Contact form", "Multiple"] },
      { id: "social_media", label: "Social media accounts to link on the website", type: "textarea", hint: "e.g. facebook.com/yourbusiness, instagram.com/yourbusiness" },
      { id: "domain_owned", label: "Do you already own your domain name?", type: "radio", options: ["Yes", "No", "Not sure"] },
      { id: "domain_name", label: "If yes, what is your domain name?", type: "text", placeholder: "yourbusiness.com" },
      { id: "dns_provider", label: "Who manages your domain/DNS?", type: "dns-selector" },
    ],
  },
  {
    step: 2,
    title: "What Should This Website Do?",
    subtitle: "Website Goals",
    icon: "🎯",
    questions: [
      { id: "why_building", label: "Why are you building or redesigning your website right now?", type: "textarea" },
      { id: "top_goals", label: "What are the top 3 goals for this website?", type: "textarea" },
      { id: "visitor_actions", label: "What actions do you want visitors to take?", type: "textarea" },
      { id: "success_definition", label: "What would make this website a success in your eyes?", type: "textarea" },
      { id: "customer_type", label: "Is this website mainly for:", type: "radio", options: ["New customers", "Returning customers", "Both"] },
    ],
  },
  {
    step: 3,
    title: "Who Are You Trying to Reach?",
    subtitle: "Target Audience",
    icon: "👥",
    questions: [
      { id: "ideal_customer", label: "Who is your ideal customer?", type: "textarea" },
      { id: "customer_problems", label: "What problems are customers typically dealing with before they contact you?", type: "textarea" },
      { id: "motivation_to_reach_out", label: "What motivates them to finally reach out?", type: "textarea" },
      { id: "what_they_care_about", label: "What do they care about most when choosing a business like yours?", type: "textarea" },
      { id: "objections", label: "What concerns or objections do they usually have before buying?", type: "textarea" },
    ],
  },
  {
    step: 4,
    title: "Your Brand Look and Feel",
    subtitle: "Brand Identity",
    icon: "🎨",
    questions: [
      { id: "has_logo", label: "Do you have an existing logo?", type: "radio", options: ["Yes", "No", "In progress"] },
      { id: "logo_files", label: "Upload your logo files", type: "file" },
      { id: "brand_colors", label: "What are your brand colors?", type: "textarea", hint: "e.g. Navy blue and gold — hex codes if you have them" },
      { id: "look_and_feel", label: "How would you describe the desired look and feel?", type: "textarea" },
      { id: "brand_personality", label: "Words that should describe your brand personality", type: "textarea", hint: "e.g. Professional, warm, approachable, bold" },
      { id: "brand_feel", label: "Should the site feel more:", type: "radio", options: ["Personal", "Corporate", "Local", "Premium", "Mix of several"] },
    ],
  },
  {
    step: 5,
    title: "Services and What Makes You Different",
    subtitle: "Services & Positioning",
    icon: "💼",
    questions: [
      { id: "all_services", label: "List all services you offer", type: "textarea" },
      { id: "priority_services", label: "Which services are highest priority to promote?", type: "textarea" },
      { id: "differentiators", label: "What differentiates your business from competitors?", type: "textarea" },
      { id: "why_choose_you", label: "Why do customers choose you instead of someone else?", type: "textarea" },
      { id: "trust_builders", label: "Guarantees, warranties, certifications, awards, or credentials", type: "textarea" },
      { id: "inspiration_sites", label: "Share 2–3 websites you love (any industry)", type: "textarea", hint: "Include what you like about each one" },
    ],
  },
  {
    step: 6,
    title: "Final Details",
    subtitle: "Almost Done",
    icon: "📝",
    questions: [
      { id: "testimonials", label: "Do you have testimonials or reviews to feature?", type: "textarea", hint: "Paste them here or let us know where to find them" },
      { id: "main_faqs", label: "What are the main FAQs you want answered on the site?", type: "textarea" },
      { id: "anything_else", label: "Is there anything important we haven't asked that we should know?", type: "textarea" },
      { id: "specific_requests", label: "Any specific concerns, requests, or must-haves for this project?", type: "textarea" },
    ],
  },
];

// ─── Helper ───────────────────────────────────────────────────────────────────

export function getStepsForMode(mode: QuestionnaireMode): FormStep[] {
  if (mode === "quick") return QUICK_STEPS;
  if (mode === "standard") return STANDARD_STEPS;
  return FORM_STEPS;
}
