import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../../api/client";
import type { SiteData, StudentSubmission } from "../../api/types";
import { PhotoCapture } from "../../components/PhotoCapture";
import { Banner, Button, Card, Field, PageHeader } from "../../components/ui";
import { fileSize } from "../../lib/format";
import { text, useSite } from "../../lib/useSite";

const YEAR_GROUPS = [
  "Year 7",
  "Year 8",
  "Year 9",
  "Year 10",
  "Year 11",
  "Year 12",
];

const CONFIRMATIONS = [
  { key: "ownCostume", label: "This is my costume." },
  {
    key: "followsRules",
    label: "The image follows the school rules and dress code.",
  },
  {
    key: "clearFullBody",
    label: "The image is clear and shows the full costume.",
  },
  {
    key: "understandsDeadline",
    label: "I understand submissions close at the deadline shown.",
  },
] as const;

type ConfirmationKey = (typeof CONFIRMATIONS)[number]["key"];

/**
 * Typed-but-unsent answers survive maintenance starting, the tab closing or
 * the phone locking, so a student can pick up where they left off. The photo
 * itself cannot be kept this way, so it is simply asked for again.
 */
const DRAFT_KEY = "costume-entry-draft";

type Draft = {
  fullName: string;
  yearGrade: string;
  classRollGroup: string;
  houseId: string;
  categoryId: string;
  costumeName: string;
  costumeDescription: string;
};

function readDraft(): Partial<Draft> {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Partial<Draft>)
      : {};
  } catch {
    return {};
  }
}

function draftValue(
  draft: Partial<Draft>,
  key: keyof Draft,
  fallback: string,
): string {
  const value = draft[key];
  return typeof value === "string" && value ? value : fallback;
}

interface Props {
  existing: StudentSubmission | null;
}

export function EntryForm({ existing }: Props) {
  const navigate = useNavigate();
  const { site } = useSite();

  // A saved entry is the truth; the draft only fills in unsent answers.
  const [draft] = useState(() => (existing ? {} : readDraft()));

  const [fullName, setFullName] = useState(
    draftValue(draft, "fullName", existing?.fullName ?? ""),
  );
  const [yearGrade, setYearGrade] = useState(
    draftValue(draft, "yearGrade", existing?.yearGrade ?? ""),
  );
  const [classRollGroup, setClassRollGroup] = useState(
    draftValue(draft, "classRollGroup", existing?.classRollGroup ?? ""),
  );
  const [houseId, setHouseId] = useState(
    draftValue(draft, "houseId", existing?.houseId ?? ""),
  );
  const [categoryId, setCategoryId] = useState(
    draftValue(draft, "categoryId", existing?.categoryId ?? ""),
  );
  const [costumeName, setCostumeName] = useState(
    draftValue(draft, "costumeName", existing?.costumeName ?? ""),
  );
  const [costumeDescription, setCostumeDescription] = useState(
    draftValue(draft, "costumeDescription", existing?.costumeDescription ?? ""),
  );
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [confirmations, setConfirmations] = useState<
    Record<ConfirmationKey, boolean>
  >({
    ownCostume: false,
    followsRules: false,
    clearFullBody: false,
    understandsDeadline: false,
  });
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (existing) return;
    const timer = window.setTimeout(() => {
      const pending: Draft = {
        fullName,
        yearGrade,
        classRollGroup,
        houseId,
        categoryId,
        costumeName,
        costumeDescription,
      };
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(pending));
      } catch {
        // Private browsing or a full quota: the draft is a convenience only.
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    existing,
    fullName,
    yearGrade,
    classRollGroup,
    houseId,
    categoryId,
    costumeName,
    costumeDescription,
  ]);

  const allConfirmed = useMemo(
    () => CONFIRMATIONS.every((item) => confirmations[item.key]),
    [confirmations],
  );

  const accept =
    site?.competition.allowedFileTypes.join(",") ??
    "image/jpeg,image/png,image/webp";
  const maxMb = site?.competition.maxFileSizeMb ?? 10;

  const validateFile = (chosen: File): string | null => {
    if (site && !site.competition.allowedFileTypes.includes(chosen.type)) {
      return `Choose a ${site.competition.allowedFileTypes
        .map((type) => type.replace("image/", "").toUpperCase())
        .join(", ")} image.`;
    }
    if (chosen.size > maxMb * 1024 * 1024) {
      return `That image is ${fileSize(chosen.size)}. The maximum is ${maxMb} MB.`;
    }
    return null;
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!existing && !file) {
      setError("Choose a photo of your costume.");
      return;
    }
    if (!existing && !allConfirmed) {
      setError("Tick all four confirmations before submitting.");
      return;
    }

    const details = {
      fullName: fullName.trim(),
      yearGrade,
      classRollGroup: classRollGroup.trim(),
      houseId: houseId || null,
      categoryId: categoryId || null,
      costumeName: costumeName.trim(),
      costumeDescription: costumeDescription.trim(),
    };

    setBusy(true);

    const work = async () => {
      if (existing) {
        await api.patch<{ submission: StudentSubmission }>(
          "/api/me/submission",
          details,
        );
        if (file) {
          const form = new FormData();
          form.append("photo", file);
          await api.upload<{ submission: StudentSubmission }>(
            "/api/me/submission/photo",
            form,
            "PUT",
          );
        }
      } else {
        const form = new FormData();
        form.append("details", JSON.stringify({ ...details, confirmations }));
        form.append("photo", file as File);
        await api.upload<{ submission: StudentSubmission }>(
          "/api/me/submission",
          form,
        );
      }
    };

    void work()
      .then(() => {
        window.localStorage.removeItem(DRAFT_KEY);
        navigate("/dashboard", { replace: true });
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          setError(err.message);
          setFieldErrors(err.fieldErrors);
        } else {
          setError("Your entry could not be saved. Please try again.");
        }
      })
      .finally(() => setBusy(false));
  };

  return (
    <>
      <PageHeader
        title={existing ? "Edit your entry" : "Submit your entry"}
        lead={
          existing
            ? "Any change sends your entry back for review by staff."
            : "Read the requirements, then upload a full-body photo of your costume."
        }
      />

      {site ? <RequirementsCard site={site} /> : null}

      <Card title="Your details">
        <form onSubmit={submit} noValidate>
          {error ? <Banner tone="error">{error}</Banner> : null}

          <Field
            label="Full name"
            htmlFor="fullName"
            error={fieldErrors.fullName}
          >
            <input
              id="fullName"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
            />
          </Field>

          <div className="grid grid--two">
            <Field
              label="Year group"
              htmlFor="yearGrade"
              error={fieldErrors.yearGrade}
            >
              <select
                id="yearGrade"
                value={yearGrade}
                onChange={(event) => setYearGrade(event.target.value)}
                required
              >
                <option value="">Choose your year</option>
                {YEAR_GROUPS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Class or roll group"
              htmlFor="classRollGroup"
              error={fieldErrors.classRollGroup}
            >
              <input
                id="classRollGroup"
                value={classRollGroup}
                onChange={(event) => setClassRollGroup(event.target.value)}
                required
              />
            </Field>
          </div>

          <div className="grid grid--two">
            {site && site.houses.length > 0 && (
              <Field label="House (optional)" htmlFor="house">
                <select
                  id="house"
                  value={houseId}
                  onChange={(event) => setHouseId(event.target.value)}
                >
                  <option value="">Not applicable</option>
                  {site.houses.map((house) => (
                    <option key={house.id} value={house.id}>
                      {house.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {site && site.categories.length > 0 && (
              <Field label="Category" htmlFor="category">
                <select
                  id="category"
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="">Choose a category</option>
                  {site.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          <Field
            label="Costume name"
            htmlFor="costumeName"
            error={fieldErrors.costumeName}
          >
            <input
              id="costumeName"
              value={costumeName}
              onChange={(event) => setCostumeName(event.target.value)}
              required
            />
          </Field>

          <Field
            label="Costume description"
            htmlFor="costumeDescription"
            hint="A sentence or two about what your costume is and how you made it."
            error={fieldErrors.costumeDescription}
          >
            <textarea
              id="costumeDescription"
              value={costumeDescription}
              onChange={(event) => setCostumeDescription(event.target.value)}
              required
            />
          </Field>

          <Field
            label={existing ? "Replace photo (optional)" : "Costume photo"}
            htmlFor="photo"
            hint={`Full-body photo. Maximum ${maxMb} MB.`}
          >
            <div className="filedrop">
              {cameraOpen ? (
                <PhotoCapture
                  onCancel={() => setCameraOpen(false)}
                  onCapture={(captured) => {
                    const problem = validateFile(captured);
                    if (problem) {
                      setError(problem);
                      return;
                    }
                    setError(null);
                    setFile(captured);
                    setCameraOpen(false);
                  }}
                />
              ) : (
                <>
                  <input
                    id="photo"
                    type="file"
                    accept={accept}
                    onChange={(event) => {
                      const chosen = event.target.files?.[0] ?? null;
                      if (!chosen) {
                        setFile(null);
                        return;
                      }
                      const problem = validateFile(chosen);
                      if (problem) {
                        setError(problem);
                        setFile(null);
                        event.target.value = "";
                        return;
                      }
                      setError(null);
                      setFile(chosen);
                    }}
                  />
                  <p className="small muted" style={{ margin: "0.6rem 0 0" }}>
                    On a phone or tablet you can take the photo now instead of
                    choosing a file.
                  </p>
                  <div className="button-row" style={{ marginTop: "0.4rem" }}>
                    <Button
                      variant="secondary"
                      onClick={() => setCameraOpen(true)}
                    >
                      Use camera
                    </Button>
                  </div>
                </>
              )}
              {previewUrl ? (
                <div style={{ marginTop: "0.75rem" }}>
                  <img
                    className="photo photo--preview"
                    src={previewUrl}
                    alt="Preview of your costume"
                  />
                  <p className="small muted">
                    {file?.name} · {file ? fileSize(file.size) : ""}
                  </p>
                </div>
              ) : null}
            </div>
          </Field>

          {!existing && (
            <fieldset style={{ border: 0, padding: 0, margin: "0 0 1rem" }}>
              <legend className="field__label">
                Before submitting, please confirm
              </legend>
              {CONFIRMATIONS.map((item) => (
                <label className="checkbox" key={item.key}>
                  <input
                    type="checkbox"
                    checked={confirmations[item.key]}
                    onChange={(event) =>
                      setConfirmations((prev) => ({
                        ...prev,
                        [item.key]: event.target.checked,
                      }))
                    }
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </fieldset>
          )}

          <div className="button-row">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : existing ? "Save changes" : "Submit entry"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate("/dashboard")}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}

function RequirementsCard({ site }: { site: SiteData }) {
  return (
    <Card title="Photo requirements">
      <p className="prose">{text(site.content, "photo_requirements")}</p>
      <p className="prose small">{text(site.content, "dress_code")}</p>
    </Card>
  );
}
