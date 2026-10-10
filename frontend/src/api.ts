import { createClient } from "@supabase/supabase-js";
export const base = import.meta.env.VITE_API_URL || "";
export const supabase =
  import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    ? createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      )
    : null;
export async function token() {
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || "";
  }
  return localStorage.getItem("medibridge-demo-token") || "";
}
async function detail(response: Response): Promise<never> {
  let data;
  try {
    data = await response.json();
  } catch {
    data = { detail: "Service unavailable." };
  }
  if (response.status === 401)
    window.dispatchEvent(new Event("session-expired"));
  throw new Error(
    typeof data.detail === "string"
      ? data.detail
      : "Please check the form values.",
  );
}
export async function api<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
  access?: string,
): Promise<T> {
  const jwt = access ? "" : await token();
  const response = await fetch(base + "/api" + path, {
    method,
    headers: {
      ...(jwt ? { Authorization: "Bearer " + jwt } : {}),
      ...(access ? { "X-Access-Token": access } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) return detail(response);
  return response.json();
}
export async function download(
  path: string,
  name: string,
  access?: string,
  preview = false,
) {
  const jwt = access ? "" : await token();
  const r = await fetch(base + "/api" + path, {
    headers: access
      ? { "X-Access-Token": access }
      : { Authorization: "Bearer " + jwt },
  });
  if (!r.ok) return detail(r);
  const url = URL.createObjectURL(await r.blob());
  if (preview) {
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (!w) {
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
    }
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function uploadFile(
  file: File,
  onProgress: (n: number) => void,
): Promise<MedicalRecord> {
  if (
    !/\.(pdf|png|jpe?g)$/i.test(file.name) ||
    file.size > 10 * 1024 * 1024 ||
    !file.size
  )
    throw new Error("Choose a PDF, PNG or JPEG up to 10 MB.");
  const jwt = await token();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", base + "/api/records");
    xhr.setRequestHeader("Authorization", "Bearer " + jwt);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () =>
      reject(new Error("Upload failed. Check the connection."));
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status < 300) resolve(data);
        else
          reject(
            new Error(
              typeof data.detail === "string"
                ? data.detail
                : "Upload rejected.",
            ),
          );
      } catch {
        reject(new Error("Service unavailable."));
      }
    };
    const body = new FormData();
    body.append("file", file);
    xhr.send(body);
  });
}
export type MedicalRecord = {
  id: string;
  title: string;
  filename: string;
  type: string;
  date: string | null;
  size: number;
  status: string;
  created_at: string;
};
export type Medication = {
  id?: string;
  record_id?: string;
  name: string;
  dosage: string;
  frequency: string;
  status: "unknown" | "current" | "historical";
  start_date: string | null;
  end_date: string | null;
  source_text: string;
};
export type Allergy = {
  id?: string;
  record_id?: string;
  name: string;
  severity: string;
  source_text: string;
};
export type Lab = {
  name: string;
  value: string;
  reference_range: string;
  source_text: string;
};
export type Extraction = {
  document_type: string;
  document_date: string | null;
  provider: string | null;
  diagnoses: string[];
  medications: Medication[];
  allergies: Allergy[];
  labs: Lab[];
  procedures: string[];
  follow_up: string[];
  uncertain_fields: string[];
  source_text: string;
  confidence: string;
};
export type Analysis = {
  record_id: string;
  extraction: Extraction;
  original_extraction: Extraction;
  mode: string;
  method: string;
  reviewed: boolean;
};
export type Event = {
  id: string;
  record_id: string;
  title: string;
  type: string;
  date: string | null;
  provider: string | null;
};
export type Grant = {
  id: string;
  label: string;
  record_ids: string[];
  expires_at: string;
  revoked: boolean;
  token?: string;
};
export type Emergency = {
  display_name: string;
  blood_group: string;
  allergies: string;
  medications: string;
  conditions: string;
  contact_name: string;
  contact_phone: string;
  include: string[];
};
export type Audit = {
  id: string;
  action: string;
  actor: string;
  created_at: string;
  record_id: string | null;
};
