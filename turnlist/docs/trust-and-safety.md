# Trust and safety

Draft procedures for legal and operational review. The policy text users see is in `src/pages/public/Legal.tsx` and is marked "Draft prepared for legal review" in the product.

## Independent contractor positioning

- Every listing is an independent contractor opportunity. The footer, How It Works, sign-up, and the apply dialog say Turnlist is not an employer, staffing agency, or payment processor and that applying does not guarantee work.
- Turnlist does not set rates, schedule, supervise, or pay. Ratings are reviews of completed jobs, not performance management.
- Counsel to review: classification language against NRS 608.0155 and federal guidance; whether "Select" wording or any recurring-work features create control indicators.

## Listing moderation

1. New business accounts start with `trust_level = 'new'`. While the market's `require_review_for_new_accounts` is on, their listings are created as `pending` and are invisible to contractors.
2. An admin approves, or rejects with a reason the business sees. Approval notifies matching contractors.
3. After a record of legitimate listings, the admin marks the account trusted and future listings publish immediately (post-moderation).
4. Any signed-in user can report a listing. Reports appear in the admin queue and on the user list.
5. Removal of a live listing cancels it and notifies applicants.
6. Grounds for rejection or removal: not real or not available; asks contractors to pay, buy products, or share banking details; misstated pay; licensed work without disclosure; discrimination; duplicates.
7. Suspension closes the account's open listings and blocks sign-in and all RPCs.
8. Every decision is written to `admin_actions` with the admin and reason.

## Licensing

Plumbing, electrical, and HVAC are flagged `requires_license` with a Nevada State Contractors Board disclosure. Listings in those categories are always marked license-required, and contractors without a license on their profile are not counted as qualified or sent matching alerts. Admins can flag more categories.

## Verification workflow

1. The user submits a request (license, insurance, business, or identity) with a document. Files go to the private `verification-docs` bucket under the user's own folder; the database rejects paths outside it.
2. The request is `pending`; no badge is shown. Self-reported licenses and insurance are labeled self-reported everywhere.
3. An admin opens the document through a two-minute signed URL, checks it (license numbers against the NSCB lookup), sets an expiry date, and must tick "I checked this document myself" before approving. Rejection requires a note.
4. Approval creates the badge through `verified_badges()`. `run_maintenance()` expires the verification after its date and the badge disappears.
5. No background-check badge exists. One should be added only with an FCRA-compliant provider and process.

## Privacy controls

- Exact addresses: never public. Visible to the posting business, admins, and contractors the business explicitly shares with.
- Contact details: a contractor's phone and email become visible to a business when the contractor applies to that business's job; a business's contact becomes visible to a contractor when selected.
- Messaging opens only between parties connected by an application (or a contractor the business saved).
- Demo mode never stores uploaded documents.

## Open items for counsel

- Terms: limitation of liability, warranty disclaimer, indemnity, governing law and venue, dispute resolution.
- Privacy: retention periods, deletion and access requests, NRS 603A notices.
- Messaging and email consent; SMS opt-in (TCPA) before enabling texts.
- Fees: any charge to businesses, and confirmation that contractor-side fees remain prohibited.
