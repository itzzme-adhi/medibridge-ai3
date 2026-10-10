# Four-minute demonstration

**0:00–0:30 — Problem and promise**
“Medical histories are spread across prescriptions, lab reports and hospital paperwork. MediBridge brings these documents into a patient-controlled timeline. Our principle is simple: one patient, one medical timeline, complete control.”

Open the landing page and choose Explore live demo. Explain that Alex Morgan and every sample record are fictional. This is the local persistent demo, not a live clinical deployment.

**0:30–1:30 — Upload and review**
Open Add record. Download the sample prescription and upload it. Show the actual source text extracted from the PDF beside the structured details. Explain: “This sample uses deterministic extraction for a reliable demonstration. Other documents use actual OCR and manual review unless a live AI provider is configured.”

Check medication name, dosage and dates. Point out “Current use unconfirmed”. Confirm review. Open Health timeline and show the new event linked to the source document.

**1:30–2:30 — Consent and doctor access**
Open Doctor access. Select just one record, choose one hour and create a link. Open it in another tab. Show that the doctor has read-only access to the selected document and its extracted details. No unrelated records are present. Return to the patient tab, revoke access, then refresh the doctor tab to demonstrate rejection.

“We validate the grant on every document request. The guest model authenticates possession of the link, not a verified doctor's identity. Previously downloaded copies cannot be recalled.”

**2:30–3:20 — Emergency access**
Select only display name and allergies in Emergency card. Generate the QR and open the access link. Show the minimal profile. Rotate or revoke it, then refresh the old link.

“The QR contains an opaque access link, not embedded medical details. Only the patient-approved fields are returned. A phone demonstration requires the deployed HTTPS origin; localhost links work only on this machine.”

**3:20–4:00 — Transparency and limits**
Open Access history to show patient, guest and emergency events. Open Review & safety and explain that medication interactions are labelled synthetic demonstrations; no clinical interaction database is connected.

“Our novelty is the combination of source-backed review, a longitudinal timeline, scoped consent, and limited emergency access. We have verified the local workflow with automated tests. Cloud auth, storage and deployment configuration are prepared and require live environment validation before real patient use.”
