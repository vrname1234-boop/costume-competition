/**
 * Rejection reason codes.
 *
 * `minor` (yellow) means the student fixes it and resubmits straight away — the
 * ordinary case. `serious` (red) locks the entry so it cannot be resubmitted
 * until a teacher unlocks it face to face; it is for conduct, not for mistakes.
 * Keeping the list here rather than in the database means the severity of a
 * code cannot be quietly downgraded from the browser.
 *
 * The label and severity are shown to the student as well as recorded in the
 * audit log. Only the free-text staff note stays private.
 */
export interface RejectionReason {
  code: string;
  label: string;
  severity: 'minor' | 'serious';
  /** Suggested wording for the message the student sees. Staff can edit it. */
  suggestedMessage: string;
}

/** Wording used in both staff and student screens, so they match. */
export const SEVERITY_LABEL: Record<RejectionReason['severity'], string> = {
  minor: 'Yellow',
  serious: 'Red',
};

export const REJECTION_REASONS: readonly RejectionReason[] = [
  {
    code: 'photo_blurry',
    label: 'Photo is blurry or too dark',
    severity: 'minor',
    suggestedMessage: 'Your photo is too blurry to review. Take a clearer photo in good light.',
  },
  {
    code: 'photo_not_full_body',
    label: 'Photo does not show the full costume',
    severity: 'minor',
    suggestedMessage: 'Your photo does not show the whole costume. Upload a full-body photo.',
  },
  {
    code: 'photo_wrong_subject',
    label: 'Photo is not of the costume',
    severity: 'minor',
    suggestedMessage: 'The photo does not show your costume. Upload a photo of you wearing it.',
  },
  {
    code: 'photo_others_visible',
    label: 'Other people are identifiable in the photo',
    severity: 'minor',
    suggestedMessage:
      'Other students can be identified in your photo. Upload a photo of just you in your costume.',
  },
  {
    code: 'details_incomplete',
    label: 'Entry details are incomplete or unclear',
    severity: 'minor',
    suggestedMessage: 'Some of your entry details are missing or unclear. Please complete them.',
  },
  {
    code: 'details_incorrect',
    label: 'Name, year or class is wrong',
    severity: 'minor',
    suggestedMessage: 'Your name, year or class is not correct. Please fix it and resubmit.',
  },
  {
    code: 'wrong_category',
    label: 'Wrong category chosen',
    severity: 'minor',
    suggestedMessage: 'Your entry is in the wrong category. Please choose the right one.',
  },
  {
    code: 'duplicate_entry',
    label: 'Duplicate of another entry',
    severity: 'minor',
    suggestedMessage: 'This entry duplicates one already submitted. Submit one entry only.',
  },
  {
    code: 'dress_code_minor',
    label: 'Small dress code problem (fixable)',
    severity: 'minor',
    suggestedMessage:
      'Your costume does not quite meet the dress code. Read the dress code and resubmit.',
  },
  {
    code: 'test_entry',
    label: 'Test or joke entry',
    severity: 'minor',
    suggestedMessage: 'This does not look like a real entry. Submit your actual costume.',
  },

  {
    code: 'inappropriate_content',
    label: 'Inappropriate or offensive content',
    severity: 'serious',
    suggestedMessage: 'Your entry breaks the school rules and has been referred to staff.',
  },
  {
    code: 'offensive_costume',
    label: 'Costume is offensive or discriminatory',
    severity: 'serious',
    suggestedMessage: 'Your entry breaks the school rules and has been referred to staff.',
  },
  {
    code: 'unsafe_costume',
    label: 'Costume is unsafe (weapon, mask, hazard)',
    severity: 'serious',
    suggestedMessage: 'Your entry breaks the school rules and has been referred to staff.',
  },
  {
    code: 'impersonation',
    label: 'Entry impersonates another person',
    severity: 'serious',
    suggestedMessage: 'Your entry has been referred to staff.',
  },
  {
    code: 'harassment',
    label: 'Targets or harasses another student or staff member',
    severity: 'serious',
    suggestedMessage: 'Your entry has been referred to staff.',
  },
  {
    code: 'repeated_breach',
    label: 'Repeated breaches after a warning',
    severity: 'serious',
    suggestedMessage: 'Your entry has been referred to staff.',
  },
  {
    code: 'other_serious',
    label: 'Other serious concern (explain in the staff note)',
    severity: 'serious',
    suggestedMessage: 'Your entry has been referred to staff.',
  },
] as const;

export const REJECTION_REASON_CODES = REJECTION_REASONS.map((r) => r.code) as [string, ...string[]];

export function findRejectionReason(code: string): RejectionReason | undefined {
  return REJECTION_REASONS.find((reason) => reason.code === code);
}
