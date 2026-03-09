/**
 * End-to-end test: standard form submission flow
 * Tests: start → save form data → submit
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";

async function run() {
  console.log("=== E2E Test: Standard Form Submission ===\n");
  console.log(`Target: ${BASE}\n`);

  // Step 1: Create session
  console.log("1. POST /api/form/start");
  const startRes = await fetch(`${BASE}/api/form/start`, { method: "POST" });
  const startBody = await startRes.json();
  console.log(`   Status: ${startRes.status}`);
  console.log(`   Response: ${JSON.stringify(startBody)}`);
  if (!startRes.ok || !startBody.token) {
    console.error("   FAIL: Could not create session");
    process.exit(1);
  }
  const token = startBody.token;
  console.log(`   Token: ${token}\n`);

  // Step 2: GET session (verify restricted columns)
  console.log("2. GET /api/form/" + token);
  const getRes = await fetch(`${BASE}/api/form/${token}`);
  const getBody = await getRes.json();
  console.log(`   Status: ${getRes.status}`);
  const keys = Object.keys(getBody);
  console.log(`   Returned keys: ${keys.join(", ")}`);
  if (getBody.id || getBody.email || getBody.submitted_at || getBody.file_urls) {
    console.error("   FAIL: Leaking restricted columns (id, email, submitted_at, or file_urls)");
    process.exit(1);
  }
  console.log(`   PASS: Only safe columns returned\n`);

  // Step 3: PUT form data (standard form fields)
  console.log("3. PUT /api/form/" + token + " (save standard form data)");
  const formData = {
    _mode: "standard",
    business_name: "Test Plumbing Co",
    contact_email: "test@example.com",
    contact_phone: "555-123-4567",
    phone: "555-123-4567",
    email: "info@testplumbing.com",
    address: "123 Main St, Austin TX",
    address_display: "Full address",
    service_areas: "Austin, Round Rock, Cedar Park",
    contact_method: ["Phone call", "Email"],
    domain_owned: "Yes",
    domain_name: "testplumbing.com",
    dns_provider: "godaddy",
    why_building: "Need a modern website to attract more customers",
    top_goals: "1. Generate leads\n2. Show services\n3. Build trust",
    visitor_actions: "Call us, fill out contact form, request a quote",
    success_definition: "More phone calls and form submissions from local customers",
    customer_type: "New customers",
    ideal_customer: "Homeowners in Austin area needing plumbing repairs",
    customer_problems: "Leaky faucets, clogged drains, water heater issues",
    motivation_to_reach_out: "Emergency plumbing situations or planned renovations",
    what_they_care_about: "Fast response time, fair pricing, licensed and insured",
    objections: "Price concerns, worry about hidden fees",
    has_logo: "Yes",
    brand_colors: "Navy blue and white",
    look_and_feel: "Professional, trustworthy, clean",
    brand_personality: "Reliable, honest, local",
    brand_feel: "Local",
    all_services: "Drain cleaning, water heater repair, pipe repair, bathroom remodeling",
    priority_services: "Drain cleaning, water heater repair",
    differentiators: "24/7 emergency service, 30+ years experience",
    why_choose_you: "Family owned, no hidden fees, same-day service",
    trust_builders: "Licensed, bonded, insured. A+ BBB rating",
    inspiration_sites: "https://example-plumber.com - clean layout\nhttps://example2.com - good service pages",
    standard_pages: ["Home", "About", "Services", "Individual service pages", "Contact", "FAQ", "Testimonials"],
    testimonials: "Great service! Fixed our leak in 30 minutes. - John D.",
    main_faqs: "Do you offer emergency service? Yes, 24/7.\nWhat areas do you serve? Austin metro area.",
    anything_else: "We want to highlight our emergency services prominently",
    specific_requests: "Include a click-to-call button on mobile",
  };

  const putRes = await fetch(`${BASE}/api/form/${token}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      current_step: 6,
      form_data: formData,
      dns_provider: "godaddy",
    }),
  });
  const putBody = await putRes.json();
  console.log(`   Status: ${putRes.status}`);
  console.log(`   Response: ${JSON.stringify(putBody)}`);
  if (!putRes.ok) {
    console.error("   FAIL: Could not save form data");
    process.exit(1);
  }
  console.log(`   PASS: Form data saved\n`);

  // Step 4: Verify PUT rejects bad input
  console.log("4. PUT /api/form/" + token + " (test validation - bad form_data type)");
  const badPut = await fetch(`${BASE}/api/form/${token}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ form_data: "not-an-object" }),
  });
  console.log(`   Status: ${badPut.status} (expected 400)`);
  if (badPut.status !== 400) {
    console.error("   FAIL: Should have rejected string form_data");
    process.exit(1);
  }
  console.log(`   PASS: Bad input rejected\n`);

  // Step 5: Submit the form
  console.log("5. POST /api/form/" + token + "/submit");
  const submitRes = await fetch(`${BASE}/api/form/${token}/submit`, { method: "POST" });
  const submitBody = await submitRes.json();
  console.log(`   Status: ${submitRes.status}`);
  console.log(`   Response: ${JSON.stringify(submitBody)}`);
  if (!submitRes.ok) {
    console.error("   FAIL: Submission failed");
    process.exit(1);
  }
  console.log(`   PASS: Form submitted\n`);

  // Step 6: Verify double-submit is idempotent
  console.log("6. POST /api/form/" + token + "/submit (double submit - should be idempotent)");
  const doubleRes = await fetch(`${BASE}/api/form/${token}/submit`, { method: "POST" });
  const doubleBody = await doubleRes.json();
  console.log(`   Status: ${doubleRes.status}`);
  console.log(`   Response: ${JSON.stringify(doubleBody)}`);
  if (!doubleRes.ok) {
    console.error("   FAIL: Double submit should succeed (idempotent)");
    process.exit(1);
  }
  console.log(`   PASS: Double submit handled\n`);

  // Step 7: Verify PUT rejects updates to submitted session
  console.log("7. PUT /api/form/" + token + " (should reject - already submitted)");
  const postSubmitPut = await fetch(`${BASE}/api/form/${token}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_step: 1, form_data: {} }),
  });
  console.log(`   Status: ${postSubmitPut.status} (expected 409)`);
  if (postSubmitPut.status !== 409) {
    console.error("   FAIL: Should reject updates to submitted session");
    process.exit(1);
  }
  console.log(`   PASS: Post-submit updates blocked\n`);

  // Step 8: Verify export requires auth
  console.log("8. GET /api/export/" + token + " (should require admin auth)");
  const exportRes = await fetch(`${BASE}/api/export/${token}`);
  console.log(`   Status: ${exportRes.status} (expected 401)`);
  if (exportRes.status !== 401) {
    console.error("   FAIL: Export should require authentication");
    process.exit(1);
  }
  console.log(`   PASS: Export requires auth\n`);

  // Step 9: Verify upload requires token
  console.log("9. POST /api/upload (no token - should be rejected)");
  const uploadForm = new FormData();
  const blob = new Blob(["test"], { type: "image/png" });
  uploadForm.append("file", blob, "test.png");
  const uploadRes = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    body: uploadForm,
  });
  console.log(`   Status: ${uploadRes.status} (expected 400)`);
  if (uploadRes.status !== 400) {
    console.error("   FAIL: Upload should require token");
    process.exit(1);
  }
  console.log(`   PASS: Upload requires token\n`);

  console.log("=== ALL TESTS PASSED ===");
}

run().catch((err) => {
  console.error("Test error:", err.message);
  process.exit(1);
});
