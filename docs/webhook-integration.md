# Webhook Integration Reference

## Overview

The Website Reveals webhook endpoint accepts form submissions from external websites. When a client fills out a website questionnaire on your site, submit the collected data to this endpoint. It will create a form session, send DNS instructions to the client, notify the agency, and queue an automated website build.

There are three form types corresponding to different questionnaire depths:
- **quick** -- minimal intake, ~16 fields across 2 steps
- **standard** -- moderate intake, ~40 fields across 6 steps
- **in-depth** -- full 11-step questionnaire, ~100+ fields

Use whichever form type matches the depth of data you collected.

---

## Authentication

Every request must include two headers:

| Header | Description |
|---|---|
| `x-api-key` | The shared secret. Must match the `WEBHOOK_API_KEY` environment variable on the server. |
| `Origin` | The origin of the calling site. Checked against the comma-separated list in `WEBHOOK_ALLOWED_ORIGINS`. If `WEBHOOK_ALLOWED_ORIGINS` is not set, all origins are allowed. |

If the API key is missing or invalid, the endpoint returns `401 Unauthorized`.
If the origin is not in the allowed list, the endpoint returns `403 Forbidden`.

Rate limiting: 10 requests per IP per hour by default (configurable via `WEBHOOK_RATE_LIMIT`).

---

## Endpoint

```
POST /api/webhooks/submit
Content-Type: application/json
x-api-key: <your-api-key>
```

---

## Request Format

```json
{
  "form_type": "quick" | "standard" | "in-depth",
  "form_data": {
    "business_name": "string (required)",
    "contact_email": "string (required)",
    ...additional fields per form type
  }
}
```

- `form_type` -- must be exactly one of `"quick"`, `"standard"`, or `"in-depth"`.
- `form_data` -- an object containing the collected field values.

---

## Required Fields

These two fields are **always required** regardless of form type:

| Field ID | Type | Description |
|---|---|---|
| `business_name` | string | The client's business name |
| `contact_email` | email string | The client's email address for project communication |

If either is missing, the endpoint returns `400` with an error listing the missing fields.

---

## Field Reference -- Quick

Quick mode collects essential information in 2 steps (~16 fields).

### Step 1: Tell Us About Your Business

| Field ID | Label | Type | Required | Options / Notes |
|---|---|---|---|---|
| `business_name` | What is your business name? | text | Yes | |
| `contact_email` | Your email (so we can reach you) | email | Yes | |
| `contact_phone` | Your phone number | tel | No | |
| `phone` | Phone number for customers to call | tel | No | |
| `email` | Email address for customers | email | No | |
| `service_areas` | What cities or regions do you serve? | textarea | No | |
| `contact_method` | How do you prefer customers to reach you? (select all that apply) | checkbox | No | `["Phone call", "Text message", "Email", "Contact form"]` -- submit as JSON array of selected strings |
| `domain_owned` | Do you already own your domain name? | radio | No | `"Yes"`, `"No"`, `"Not sure"` -- submit as single string |
| `domain_name` | If yes, what is your domain name? | text | No | e.g. `"yourbusiness.com"` |
| `dns_provider` | Who manages your domain/DNS? | string | No | Plain string, e.g. `"GoDaddy"`, `"Cloudflare"`, `"Namecheap"` |

### Step 2: Your Website

| Field ID | Label | Type | Required | Options / Notes |
|---|---|---|---|---|
| `all_services` | What services or products do you offer? | textarea | No | |
| `standard_pages` | What pages do you need? | checkbox | No | `["Home", "About", "Services", "Individual service pages", "Contact", "FAQ", "Blog", "Gallery", "Testimonials", "Financing", "Careers", "Team", "Resources", "Privacy Policy", "Terms and Conditions"]` -- submit as JSON array of selected strings |
| `why_building` | Why are you building or redesigning your website right now? | textarea | No | |
| `differentiators` | What makes your business different from competitors? | textarea | No | |
| `inspiration_sites` | Any websites you love or want yours to look similar to? | textarea | No | |
| `anything_else` | Anything else we should know? | textarea | No | |

---

## Field Reference -- Standard

Standard mode collects moderate detail in 6 steps (~40 fields). Fields marked with (+) are additional beyond the Quick form.

### Step 1: Tell Us About Your Business

| Field ID | Label | Type | Required | Options / Notes |
|---|---|---|---|---|
| `business_name` | What is your business name? | text | Yes | |
| `contact_email` | Your email (so we can reach you) | email | Yes | |
| `contact_phone` | Your phone number | tel | No | |
| `phone` | Primary business phone number | tel | No | |
| `email` | Primary business email address | email | No | |
| `address` | Business address | text | No | (+) |
| `address_display` | Show address on website? | radio | No | `"Full address"`, `"City/State only"`, `"Don't show address"` (+) |
| `service_areas` | Cities, regions, or service areas you serve | textarea | No | |
| `contact_method` | Preferred customer contact method (select all that apply) | checkbox | No | `["Phone call", "Text message", "Email", "Contact form"]` -- JSON array |
| `social_media` | Social media accounts to link on the website | textarea | No | (+) |
| `domain_owned` | Do you already own your domain name? | radio | No | `"Yes"`, `"No"`, `"Not sure"` |
| `domain_name` | If yes, what is your domain name? | text | No | e.g. `"yourbusiness.com"` |
| `dns_provider` | Who manages your domain/DNS? | string | No | Plain string |

### Step 2: What Should This Website Do?

| Field ID | Label | Type | Required | Options / Notes |
|---|---|---|---|---|
| `why_building` | Why are you building or redesigning your website right now? | textarea | No | |
| `top_goals` | What are the top 3 goals for this website? | textarea | No | (+) |
| `visitor_actions` | What actions do you want visitors to take? | textarea | No | (+) |
| `success_definition` | What would make this website a success in your eyes? | textarea | No | (+) |
| `customer_type` | Is this website mainly for: | radio | No | `"New customers"`, `"Returning customers"`, `"Both"` (+) |

### Step 3: Who Are You Trying to Reach?

All fields in this step are additional beyond Quick (+).

| Field ID | Label | Type | Required | Options / Notes |
|---|---|---|---|---|
| `ideal_customer` | Who is your ideal customer? | textarea | No | (+) |
| `customer_problems` | What problems are customers typically dealing with before they contact you? | textarea | No | (+) |
| `motivation_to_reach_out` | What motivates them to finally reach out? | textarea | No | (+) |
| `what_they_care_about` | What do they care about most when choosing a business like yours? | textarea | No | (+) |
| `objections` | What concerns or objections do they usually have before buying? | textarea | No | (+) |

### Step 4: Your Brand Look and Feel

| Field ID | Label | Type | Required | Options / Notes |
|---|---|---|---|---|
| `has_logo` | Do you have an existing logo? | radio | No | `"Yes"`, `"No"`, `"In progress"` (+) |
| `logo_files` | Upload your logo files | file | No | Skip -- provide URLs in a textarea field instead (+) |
| `brand_colors` | What are your brand colors? | textarea | No | (+) |
| `look_and_feel` | How would you describe the desired look and feel? | textarea | No | (+) |
| `brand_personality` | Words that should describe your brand personality | textarea | No | (+) |
| `brand_feel` | Should the site feel more: | radio | No | `"Personal"`, `"Corporate"`, `"Local"`, `"Premium"`, `"Mix of several"` (+) |

### Step 5: Services and What Makes You Different

| Field ID | Label | Type | Required | Options / Notes |
|---|---|---|---|---|
| `all_services` | List all services you offer | textarea | No | |
| `priority_services` | Which services are highest priority to promote? | textarea | No | (+) |
| `differentiators` | What differentiates your business from competitors? | textarea | No | |
| `why_choose_you` | Why do customers choose you instead of someone else? | textarea | No | (+) |
| `trust_builders` | Guarantees, warranties, certifications, awards, or credentials | textarea | No | (+) |
| `inspiration_sites` | Share 2-3 websites you love (any industry) | textarea | No | |

### Step 6: Final Details

| Field ID | Label | Type | Required | Options / Notes |
|---|---|---|---|---|
| `standard_pages` | What pages do you need? | checkbox | No | `["Home", "About", "Services", "Individual service pages", "Contact", "FAQ", "Blog", "Gallery", "Testimonials", "Financing", "Careers", "Team", "Resources", "Privacy Policy", "Terms and Conditions"]` -- JSON array |
| `testimonials` | Do you have testimonials or reviews to feature? | textarea | No | (+) |
| `main_faqs` | What are the main FAQs you want answered on the site? | textarea | No | (+) |
| `anything_else` | Is there anything important we haven't asked that we should know? | textarea | No | |
| `specific_requests` | Any specific concerns, requests, or must-haves for this project? | textarea | No | (+) |

---

## Field Reference -- In-Depth

The full 11-step questionnaire collecting comprehensive information (~100+ fields). This is the most detailed form type.

### Step 1: Tell Us About Your Business

| Field ID | Label | Type | Required | Options / Notes |
|---|---|---|---|---|
| `business_name` | What is your business name? | text | Yes | |
| `website_name` | What name should appear on the website? | text | No | |
| `phone` | Primary business phone number | tel | No | |
| `email` | Primary business email address | email | No | |
| `address` | Business address | text | No | |
| `address_display` | Show address on website? | radio | No | `"Full address"`, `"City/State only"`, `"Don't show address"` |
| `service_areas` | Cities, regions, or service areas you serve | textarea | No | |
| `excluded_areas` | Any locations you do NOT want to target? | textarea | No | |
| `contact_person` | Best contact person for this project | text | No | |
| `contact_email` | Your email (so we can reach you) | email | Yes | |
| `contact_phone` | Your phone number | tel | No | |
| `business_hours` | Business hours | textarea | No | |
| `contact_method` | Preferred customer contact method (select all that apply) | checkbox | No | `["Phone call", "Text message", "Email", "Contact form"]` -- JSON array |
| `social_media` | Social media accounts to link on the website | textarea | No | |
| `domain_owned` | Do you already own your domain name? | radio | No | `"Yes"`, `"No"`, `"Not sure"` |
| `domain_name` | If yes, what is your domain name? | text | No | e.g. `"yourbusiness.com"` |
| `dns_provider` | Who manages your domain/DNS? | string | No | Plain string, e.g. `"GoDaddy"`, `"Cloudflare"` |

### Step 2: What Should This Website Do?

| Field ID | Label | Type | Required | Options / Notes |
|---|---|---|---|---|
| `why_building` | Why are you building or redesigning your website right now? | textarea | No | |
| `top_goals` | What are the top 3 goals for this website? | textarea | No | |
| `visitor_actions` | What actions do you want visitors to take? | textarea | No | |
| `success_definition` | What would make this website a success in your eyes? | textarea | No | |
| `current_site_problems` | What are the biggest problems with your current website? | textarea | No | |
| `missing_online` | If no current website, what has been missing from your online presence? | textarea | No | |
| `what_hasnt_worked` | What has NOT worked well for you in the past with marketing or websites? | textarea | No | |
| `business_goals` | Business goals this site should support over the next 6-12 months | textarea | No | |
| `customer_type` | Is this website mainly for: | radio | No | `"New customers"`, `"Returning customers"`, `"Both"` |

### Step 3: Who Are You Trying to Reach?

| Field ID | Label | Type | Required | Options / Notes |
|---|---|---|---|---|
| `ideal_customer` | Who is your ideal customer? | textarea | No | |
| `profitable_customer` | What type of customer is most profitable for your business? | textarea | No | |
| `geographic_priority` | What geographic areas are most important for new customers? | textarea | No | |
| `customer_problems` | What problems are customers typically dealing with before they contact you? | textarea | No | |
| `motivation_to_reach_out` | What motivates them to finally reach out? | textarea | No | |
| `objections` | What concerns or objections do they usually have before buying? | textarea | No | |
| `what_they_care_about` | What do they care about most when choosing a business like yours? | textarea | No | |
| `customer_outcome` | What are customers hoping to achieve after working with you? | textarea | No | |
| `unwanted_customers` | Are there customer types you do NOT want to attract? | textarea | No | |
| `search_phrases` | What would customers search on Google to find you? | textarea | No | |

### Step 4: Your Brand Look and Feel

| Field ID | Label | Type | Required | Options / Notes |
|---|---|---|---|---|
| `has_logo` | Do you have an existing logo? | radio | No | `"Yes"`, `"No"`, `"In progress"` |
| `logo_files` | Upload your logo files | file | No | Skip -- provide URLs as plain text instead |
| `has_alternate_logos` | Do you have alternate logo versions? | radio | No | `"Yes"`, `"No"` |
| `brand_colors` | What are your brand colors? | textarea | No | |
| `hex_codes` | Exact hex codes if you know them | text | No | e.g. `"#1a2b3c, #d4af37"` |
| `brand_fonts` | Do you have brand fonts to use on the website? | radio | No | `"Yes"`, `"No"` |
| `font_names` | If yes, what are the font names? | text | No | |
| `brand_guidelines` | Upload brand guidelines or style guide | file | No | Skip -- provide URLs as plain text instead |
| `look_and_feel` | How would you describe the desired look and feel? | textarea | No | |
| `brand_personality` | Words that should describe your brand personality | textarea | No | |
| `brand_not` | Words that should NOT describe your brand | textarea | No | |
| `avoid_design` | Any colors, styles, or design trends to avoid? | textarea | No | |
| `brand_photos` | Upload any photos that reflect your brand | file | No | Skip -- provide URLs as plain text instead |
| `brand_feel` | Should the site feel more: | radio | No | `"Personal"`, `"Corporate"`, `"Local"`, `"Premium"`, `"Mix of several"` |

### Step 5: What Makes You Different?

| Field ID | Label | Type | Required | Options / Notes |
|---|---|---|---|---|
| `differentiators` | What differentiates your business from competitors? | textarea | No | |
| `why_choose_you` | Why do customers choose you instead of someone else? | textarea | No | |
| `do_better` | What do you do better than others in your industry? | textarea | No | |
| `compliments` | What do customers compliment you on most often? | textarea | No | |
| `unique_offerings` | Do you offer anything unique that competitors typically do not? | textarea | No | |
| `selling_points` | What are your strongest selling points? | textarea | No | |
| `trust_builders` | Guarantees, warranties, certifications, awards, or credentials | textarea | No | |
| `media_features` | Have you been featured in media or local organizations? | textarea | No | |
| `misconceptions` | Common misconceptions about your business the website should clear up | textarea | No | |
| `never_say` | What do you NEVER want your website copy to say or imply? | textarea | No | |

### Step 6: Existing Website + Sites You Love

| Field ID | Label | Type | Required | Options / Notes |
|---|---|---|---|---|
| `current_url` | What is your current website URL? | text | No | e.g. `"https://yoursite.com"` |
| `current_likes` | What do you like about your current website? | textarea | No | |
| `current_dislikes` | What do you dislike about your current website? | textarea | No | |
| `keep_content` | What pages or content from your current site should definitely stay? | textarea | No | |
| `remove_content` | What pages or content should be removed or replaced? | textarea | No | |
| `inspiration_sites` | Share 2-3 websites you love (any industry) | textarea | No | |
| `dislike_styles` | Are there any website styles you strongly dislike? | textarea | No | |
| `content_preference` | Do you prefer: | radio | No | `"Image-heavy"`, `"Text-driven"`, `"Balance of both"` |

### Step 7: What You Sell and How You Explain It

| Field ID | Label | Type | Required | Options / Notes |
|---|---|---|---|---|
| `all_services` | List all services you offer | textarea | No | |
| `priority_services` | Which services are highest priority to promote? | textarea | No | |
| `profitable_services` | Which services are most profitable? | textarea | No | |
| `most_leads` | Which services do you want the most leads for? | textarea | No | |
| `seasonal_services` | Any seasonal services or limited-time offers? | textarea | No | |
| `service_details` | For each main service, describe: name, short description, who it's for, main problem it solves, main benefit, starting price, common questions | textarea | No | |
| `packages` | Do you have service packages, tiers, or bundles? | textarea | No | |
| `downplay_services` | Any services you want to downplay or not feature prominently? | textarea | No | |
| `financing` | Do you have financing options, payment plans, or promotions? | textarea | No | |
| `products` | Any products sold online or in person that should be included? | textarea | No | |

### Step 8: What Your Customers Struggle With

| Field ID | Label | Type | Required | Options / Notes |
|---|---|---|---|---|
| `pre_find_problems` | What problems are customers experiencing before they find you? | textarea | No | |
| `problem_impact` | How do those problems affect their life, business, comfort, time, or money? | textarea | No | |
| `do_nothing` | What happens if they do nothing? | textarea | No | |
| `how_you_solve` | How does your business solve those problems? | textarea | No | |
| `results` | What results do customers typically get after working with you? | textarea | No | |
| `fears` | What fears or hesitations do people have before buying from you? | textarea | No | |
| `confidence_builders` | What do customers need to hear to feel confident contacting you? | textarea | No | |
| `pre_buy_questions` | Top questions customers ask before they buy | textarea | No | |
| `common_objections` | What objections do customers commonly raise? | textarea | No | |
| `overcome_objections` | What would you say to overcome those objections? | textarea | No | |

### Step 9: Content, Messaging, and FAQs

| Field ID | Label | Type | Required | Options / Notes |
|---|---|---|---|---|
| `rewrite_content` | Do you want us to rewrite and improve your current content? | radio | No | `"Yes, rewrite everything"`, `"Improve what I have"`, `"Keep my content as-is"` |
| `existing_pages` | What pages do you already have content for? | textarea | No | |
| `main_faqs` | What are the main FAQs you want answered on the site? | textarea | No | |
| `specific_phrases` | Specific phrases, terminology, or messaging you want used | textarea | No | |
| `avoid_phrases` | Words or phrases you do NOT want used | textarea | No | |
| `testimonials` | Do you have testimonials or reviews to feature? | textarea | No | |
| `team_bios` | Do you have team bios to include? | textarea | No | |
| `company_story` | Do you have a company story or About Us story? | textarea | No | |
| `mission_statement` | Mission statement, vision statement, or core values? | textarea | No | |
| `want_blog` | Do you want blog content or resources on the site? | radio | No | `"Yes"`, `"No"`, `"Maybe later"` |

### Step 10: Pages and Navigation

| Field ID | Label | Type | Required | Options / Notes |
|---|---|---|---|---|
| `needed_pages` | What pages do you think the website needs? | textarea | No | |
| `standard_pages` | Which of these standard pages do you need? | checkbox | No | `["Home", "About", "Services", "Individual service pages", "Contact", "FAQ", "Blog", "Gallery", "Testimonials", "Financing", "Careers", "Team", "Resources", "Privacy Policy", "Terms and Conditions"]` -- JSON array |
| `want_blog_section` | Do you want a blog or article section? | radio | No | `"Yes"`, `"No"`, `"Not sure yet"` |

### Step 11: Anything Else We Should Know?

| Field ID | Label | Type | Required | Options / Notes |
|---|---|---|---|---|
| `anything_else` | Is there anything important we haven't asked that we should know? | textarea | No | |
| `specific_requests` | Any specific concerns, requests, or must-haves for this project? | textarea | No | |
| `definitely_not` | Is there anything you definitely do NOT want on the website? | textarea | No | |
| `success_feeling` | What would make you feel like this project was a win? | textarea | No | |

---

## Response Format

### Success

```json
{
  "ok": true,
  "token": "uuid-string"
}
```

Status: `200 OK`

The `token` is a UUID that identifies the form session. It can be used to check build status or export the submission.

### Validation Error

```json
{
  "error": "Missing required fields",
  "fields": ["business_name", "contact_email"]
}
```

Status: `400 Bad Request`

Other 400 errors (without `fields` array):
- `"Invalid JSON"` -- request body is not valid JSON
- `"form_type must be one of: quick, standard, in-depth"` -- invalid or missing form_type
- `"form_data is required"` -- form_data is missing or not an object

### Unauthorized

```json
{
  "error": "Unauthorized"
}
```

Status: `401 Unauthorized` -- API key is missing or invalid.

### Forbidden

```json
{
  "error": "Forbidden"
}
```

Status: `403 Forbidden` -- request origin is not in the allowed origins list.

### Rate Limited

```json
{
  "error": "Rate limit exceeded"
}
```

Status: `429 Too Many Requests` -- more than 10 requests from this IP in the past hour.

---

## Example Payloads

### Quick Form

```bash
curl -X POST https://your-domain.com/api/webhooks/submit \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-here" \
  -d '{
    "form_type": "quick",
    "form_data": {
      "business_name": "Riverside Plumbing",
      "contact_email": "mike@riversideplumbing.com",
      "contact_phone": "555-867-5309",
      "phone": "555-123-4567",
      "email": "info@riversideplumbing.com",
      "service_areas": "Austin, Round Rock, Cedar Park, Georgetown",
      "contact_method": ["Phone call", "Email"],
      "domain_owned": "Yes",
      "domain_name": "riversideplumbing.com",
      "dns_provider": "GoDaddy",
      "all_services": "Drain cleaning, water heater installation, leak repair, sewer line replacement, bathroom remodeling",
      "standard_pages": ["Home", "About", "Services", "Individual service pages", "Contact", "FAQ", "Testimonials"],
      "why_building": "Current site is 8 years old and not mobile friendly. Need to show up better in local search.",
      "differentiators": "Family-owned since 1998, 24/7 emergency service, licensed master plumber on every job",
      "inspiration_sites": "https://example-plumber.com - clean layout, easy to find phone number\nhttps://another-example.com - love the service page design",
      "anything_else": "We want a prominent phone number in the header and a click-to-call button on mobile."
    }
  }'
```

### Standard Form

```bash
curl -X POST https://your-domain.com/api/webhooks/submit \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-here" \
  -d '{
    "form_type": "standard",
    "form_data": {
      "business_name": "Summit Roofing Co.",
      "contact_email": "sarah@summitroofing.com",
      "contact_phone": "555-234-5678",
      "phone": "555-999-8888",
      "email": "office@summitroofing.com",
      "address": "450 Industrial Blvd, Denver, CO 80202",
      "address_display": "City/State only",
      "service_areas": "Denver metro, Boulder, Lakewood, Arvada, Aurora, Centennial",
      "contact_method": ["Phone call", "Text message", "Contact form"],
      "social_media": "facebook.com/summitroofingco\ninstagram.com/summitroofingco",
      "domain_owned": "Yes",
      "domain_name": "summitroofing.com",
      "dns_provider": "Cloudflare",
      "why_building": "We grew 40% last year and our website does not reflect the quality of our work.",
      "top_goals": "1. Generate more leads for residential re-roofing\n2. Showcase our work with before/after photos\n3. Rank for 'Denver roofing contractor'",
      "visitor_actions": "Request a free inspection, call us, fill out the quote form",
      "success_definition": "Getting 20+ qualified leads per month from the website",
      "customer_type": "New customers",
      "ideal_customer": "Homeowners in Denver metro with homes 15+ years old needing roof replacement or repair",
      "customer_problems": "Leaks, storm damage, aging shingles, insurance claims confusion",
      "motivation_to_reach_out": "A recent storm, visible damage, or a neighbor getting a new roof",
      "what_they_care_about": "Quality of materials, warranty, crew professionalism, price transparency",
      "objections": "Price concerns, worry about scam contractors, not sure if insurance covers it",
      "has_logo": "Yes",
      "brand_colors": "Navy blue and white with orange accents. Hex: #1B3A5C, #FFFFFF, #E87722",
      "look_and_feel": "Professional but approachable. Should feel like a trusted, established company.",
      "brand_personality": "Trustworthy, professional, local, dependable",
      "brand_feel": "Mix of several",
      "all_services": "Residential re-roofing, storm damage repair, roof inspections, gutter installation, skylight installation, commercial roofing",
      "priority_services": "Residential re-roofing and storm damage repair",
      "differentiators": "GAF Master Elite certified (top 2% of contractors), 25-year workmanship warranty, in-house crews (no subcontractors)",
      "why_choose_you": "We handle the entire insurance claim process for the homeowner",
      "trust_builders": "GAF Master Elite, BBB A+ rating, 500+ 5-star Google reviews, fully licensed and insured",
      "inspiration_sites": "https://example-roofing.com - great use of project photos\nhttps://another-roofer.com - clear service breakdown",
      "standard_pages": ["Home", "About", "Services", "Individual service pages", "Contact", "FAQ", "Gallery", "Testimonials"],
      "testimonials": "John D: 'Summit replaced our roof after a hailstorm. They handled everything with our insurance company. Incredible service.'\nMaria S: 'Professional crew, showed up on time, cleaned up perfectly. Best roofing experience we have ever had.'",
      "main_faqs": "How long does a roof replacement take?\nDo you work with insurance companies?\nWhat warranty do you offer?\nHow do I know if I need a new roof?",
      "anything_else": "We want to add a roof age calculator tool eventually. For now, a simple 'Is it time for a new roof?' checklist page would be great.",
      "specific_requests": "Must have before/after photo gallery. Need a prominent 'Free Inspection' CTA on every page."
    }
  }'
```

### In-Depth Form

```bash
curl -X POST https://your-domain.com/api/webhooks/submit \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-here" \
  -d '{
    "form_type": "in-depth",
    "form_data": {
      "business_name": "Greenleaf Landscaping & Design",
      "website_name": "Greenleaf Landscapes",
      "phone": "555-777-3333",
      "email": "hello@greenleaflandscapes.com",
      "address": "1200 Garden Way, Portland, OR 97201",
      "address_display": "City/State only",
      "service_areas": "Portland, Lake Oswego, West Linn, Tigard, Beaverton, Hillsboro",
      "excluded_areas": "East Portland, Gresham",
      "contact_person": "Jamie Chen",
      "contact_email": "jamie@greenleaflandscapes.com",
      "contact_phone": "555-777-3334",
      "business_hours": "Mon-Fri 7am-5pm, Sat 8am-2pm, Closed Sunday",
      "contact_method": ["Phone call", "Email", "Contact form"],
      "social_media": "instagram.com/greenleafpdx\nfacebook.com/greenleaflandscapes\npinterest.com/greenleafdesign",
      "domain_owned": "Yes",
      "domain_name": "greenleaflandscapes.com",
      "dns_provider": "Namecheap",
      "why_building": "Our current site was built on Wix 5 years ago. It is slow, hard to update, and does not rank well in search.",
      "top_goals": "1. Rank for 'Portland landscape design'\n2. Showcase our portfolio to convert high-end clients\n3. Reduce phone calls for basic questions with a good FAQ",
      "visitor_actions": "Request a design consultation, view our portfolio, read about our process",
      "success_definition": "Getting 10 qualified design consultation requests per month from organic traffic",
      "current_site_problems": "Slow loading, outdated design, no portfolio filtering, poor mobile experience",
      "missing_online": "",
      "what_hasnt_worked": "Paid ads on Google brought low-quality leads looking for cheap mowing services",
      "business_goals": "Grow high-end residential design-build projects by 30%",
      "customer_type": "New customers",
      "ideal_customer": "Homeowners with properties valued at $600K+ who want a complete outdoor living transformation",
      "profitable_customer": "Full design-build projects: patio + planting + lighting + irrigation. Average project $25K-$75K.",
      "geographic_priority": "Lake Oswego, West Linn, and SW Portland have the highest-value properties",
      "customer_problems": "Outdated yard, no usable outdoor space, drainage issues, overgrown landscaping they inherited when buying the home",
      "motivation_to_reach_out": "Just bought a new home, planning to sell and want curb appeal, hosting a big event, tired of looking at a neglected yard",
      "objections": "Price (landscaping is expensive), timeline (how long will this take), disruption to daily life during construction",
      "what_they_care_about": "Design quality, attention to detail, plant knowledge, reliability, not having to manage the project themselves",
      "customer_outcome": "A beautiful, functional outdoor space they are proud to show off and actually use for entertaining",
      "unwanted_customers": "People looking for one-time mow-and-blow service or lowest-bid maintenance contracts",
      "search_phrases": "landscape designer Portland, outdoor living Portland, patio design Portland OR, backyard remodel Portland",
      "has_logo": "Yes",
      "has_alternate_logos": "Yes",
      "brand_colors": "Forest green and warm cream, with terracotta accents",
      "hex_codes": "#2D5016, #F5F0E8, #C4704B",
      "brand_fonts": "Yes",
      "font_names": "Playfair Display for headings, Inter for body text",
      "look_and_feel": "Elegant, natural, high-end but not stuffy. Should feel like a premium design studio that works with nature.",
      "brand_personality": "Creative, knowledgeable, refined, approachable",
      "brand_not": "Cheap, corporate, generic, cookie-cutter",
      "avoid_design": "Avoid stock photos of generic gardens. No bright neon colors. Nothing that looks like a template.",
      "brand_feel": "Premium",
      "differentiators": "Licensed landscape architect on staff, in-house design-build (no subcontractors for design), 3D renderings before any work begins",
      "why_choose_you": "Clients see exactly what their yard will look like before we break ground. Our 3D design process eliminates surprises.",
      "do_better": "Design quality and plant selection. We use native and climate-adapted plants that thrive without excessive watering.",
      "compliments": "Attention to detail, how the finished result exceeds expectations, the design process being enjoyable and collaborative",
      "unique_offerings": "3D landscape renderings, smart irrigation systems, landscape lighting design, ongoing seasonal care plans",
      "selling_points": "Licensed landscape architect, 3D design previews, native plant expertise, 5-year plant guarantee",
      "trust_builders": "APLD certified, Oregon Landscape Contractors Board licensed, 200+ completed projects, featured in Portland Monthly",
      "media_features": "Portland Monthly 'Best of Portland' 2024, featured in Sunset Magazine garden tour",
      "misconceptions": "People think landscape designers just pick plants. We do full site engineering including drainage, grading, and hardscaping.",
      "never_say": "Never say 'yard work' or 'lawn care'. We do landscape design, not maintenance.",
      "current_url": "https://greenleaflandscapes.wixsite.com/main",
      "current_likes": "The project photos are good. Some of the written content about our process is solid.",
      "current_dislikes": "Wix branding, slow load times, can not filter portfolio by project type, contact form is buried",
      "keep_content": "Our process page content and the project case studies",
      "remove_content": "The blog posts from 2019 that are outdated. The pricing page with old rates.",
      "inspiration_sites": "https://example-landscape.com - love the portfolio grid with filtering\nhttps://example-architect.com - clean, elegant typography and whitespace\nhttps://example-garden.com - how they tell the story of each project",
      "dislike_styles": "Cluttered pages with too many CTAs, sites that auto-play video, dark/moody color schemes",
      "content_preference": "Balance of both",
      "all_services": "Landscape design, hardscape construction (patios, retaining walls, outdoor kitchens), softscape planting, irrigation system design and installation, landscape lighting, seasonal maintenance plans, drainage solutions",
      "priority_services": "Landscape design and hardscape construction",
      "profitable_services": "Full design-build projects combining hardscape and planting",
      "most_leads": "Landscape design consultations",
      "seasonal_services": "Spring garden prep packages, fall cleanup and winterization, holiday lighting installation (Nov-Jan)",
      "service_details": "Landscape Design: Custom design plans from consultation to 3D rendering. For homeowners wanting a complete outdoor transformation. Solves the problem of not knowing where to start. Main benefit: see your yard before we build it. Starting at $2,500 for design. Common question: how long does design take? (2-4 weeks)",
      "packages": "Design Only ($2,500-$5,000), Design + Build (design fee applied to project), Seasonal Care Plan ($200/month)",
      "downplay_services": "Basic lawn mowing - we only offer it as part of seasonal care plans, not standalone",
      "financing": "We offer 12-month interest-free financing on projects over $15,000 through GreenSky",
      "products": "",
      "pre_find_problems": "Ugly yard they are embarrassed by, no functional outdoor space, drainage flooding their basement, dying plants from bad design",
      "problem_impact": "They do not use their backyard. They are embarrassed to have people over. Water damage is costing them money.",
      "do_nothing": "The yard continues to deteriorate, property value suffers, they miss out on outdoor living for another year",
      "how_you_solve": "We design a space that is beautiful and functional, built correctly the first time with proper drainage, grading, and plant selection",
      "results": "A usable, stunning outdoor space. Typical clients say they spend 3x more time outside after their project.",
      "fears": "It will cost too much, it will take too long, the result will not match what they imagined",
      "confidence_builders": "Show them 3D renderings, share similar completed projects, explain our clear timeline and communication process",
      "pre_buy_questions": "How much does landscaping cost? How long will the project take? Do you handle permits? Can I see examples of your work?",
      "common_objections": "The price seems high compared to the guy on Craigslist",
      "overcome_objections": "We explain the difference between a licensed design-build firm and a labor-only crew. Our work is engineered, permitted, and guaranteed.",
      "rewrite_content": "Improve what I have",
      "existing_pages": "Home, About, Services overview, Portfolio (needs reorganizing), Contact",
      "main_faqs": "How much does a landscape project cost?\nHow long does the design process take?\nDo you offer maintenance after the project?\nWhat areas do you serve?\nDo you handle permits?",
      "specific_phrases": "outdoor living, landscape architecture, design-build, native plants, sustainable landscaping",
      "avoid_phrases": "yard work, lawn care, cheap, discount, budget",
      "testimonials": "Mark & Lisa T: 'Greenleaf turned our barren backyard into an oasis. The 3D design let us see it before they started and the result was even better than the rendering.'\nDr. Sarah K: 'Professional from start to finish. They handled permits, HOA approval, and delivered on time and on budget.'",
      "team_bios": "Jamie Chen, Owner & Lead Designer - 15 years experience, APLD certified\nRyan Oakes, Project Manager - manages all field operations\nMia Torres, Landscape Architect - Oregon-licensed LA specializing in native plantings",
      "company_story": "Founded in 2010 by Jamie Chen after leaving a corporate architecture firm to pursue a passion for outdoor spaces. Started with residential gardens and grew into a full design-build firm.",
      "mission_statement": "Creating outdoor spaces that connect people with nature and enhance how they live at home.",
      "want_blog": "Yes",
      "needed_pages": "Home, About/Team, Services overview, Individual service pages for design, hardscape, planting, lighting, and irrigation, Portfolio with filtering, Process page, FAQ, Blog, Contact, Financing",
      "standard_pages": ["Home", "About", "Services", "Individual service pages", "Contact", "FAQ", "Blog", "Gallery", "Testimonials", "Financing", "Team"],
      "want_blog_section": "Yes",
      "anything_else": "We want to integrate with our CRM (HubSpot) for lead capture. The portfolio is the most important section - it needs to filter by project type and show before/after.",
      "specific_requests": "Portfolio filtering by project type is a must. 3D rendering examples should be featured prominently. Need a clear process page showing our 5-step approach.",
      "definitely_not": "No auto-playing video. No chatbot. No pop-ups asking for email.",
      "success_feeling": "When a potential client says 'your website is what convinced me to call you' - that is the win."
    }
  }'
```

---

## Notes

- **File upload fields** (`logo_files`, `brand_guidelines`, `brand_photos`) should be skipped when submitting via webhook. If the client has files to share, collect the URLs and include them as plain text in a textarea field (e.g. put logo URLs in the `brand_colors` or `look_and_feel` field, or add a note in `anything_else`).

- **`dns_provider`** is defined as `dns-selector` in the form UI but should be submitted as a plain string via the webhook (e.g. `"GoDaddy"`, `"Cloudflare"`, `"Namecheap"`, `"Google Domains"`, `"other"`).

- **Checkbox fields** (`contact_method`, `standard_pages`) must be submitted as JSON arrays of strings. Each string must exactly match one of the defined options.
  ```json
  "contact_method": ["Phone call", "Email"]
  ```

- **Radio fields** (`domain_owned`, `address_display`, `customer_type`, `has_logo`, `brand_feel`, `content_preference`, `rewrite_content`, `want_blog`, `want_blog_section`, `has_alternate_logos`, `brand_fonts`) are submitted as a single string matching one of the defined options.
  ```json
  "domain_owned": "Yes"
  ```

- **All other fields** are plain strings (text, textarea, email, tel). Textarea fields can contain newlines for multi-line content.

- **Unknown fields** are silently accepted and stored. The endpoint does not reject extra fields, but they will not be used in the build process.

- **The `_source` and `_mode` tags** are added automatically by the endpoint. Do not include them in `form_data`.
