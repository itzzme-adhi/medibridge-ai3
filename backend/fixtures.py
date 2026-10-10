"""Entirely fictional files; exact byte hashes select deterministic demo extraction."""

import hashlib
from pathlib import Path
import pymupdf as fitz

SAMPLES = [
    (
        "consultation",
        "Consultation",
        "2026-09-12",
        "Consultation review",
        {
            "diagnoses": ["Seasonal allergic rhinitis"],
            "allergies": [
                {
                    "name": "Penicillin",
                    "severity": "unknown",
                    "source_text": "Allergy: Penicillin; severity unknown.",
                }
            ],
        },
        "Diagnosis: Seasonal allergic rhinitis.\nAllergy: Penicillin; severity unknown.",
    ),
    (
        "prescription",
        "Prescription",
        "2026-09-21",
        "Prescription",
        {
            "medications": [
                {
                    "name": "Cetirizine",
                    "dosage": "10 mg",
                    "frequency": "Once daily for 5 days",
                    "status": "unknown",
                    "start_date": "2026-09-21",
                    "end_date": "2026-09-25",
                    "source_text": "Cetirizine 10 mg once daily for 5 days.",
                }
            ]
        },
        "Cetirizine 10 mg once daily for 5 days.\nStart: 2026-09-21. End: 2026-09-25.",
    ),
    (
        "discharge",
        "Discharge Summary",
        "2026-09-25",
        "Discharge summary",
        {
            "diagnoses": ["Observation for dehydration"],
            "follow_up": ["Review with primary clinician in one week."],
        },
        "Diagnosis: Observation for dehydration.\nReview with primary clinician in one week.",
    ),
    (
        "blood-test",
        "Lab Report",
        "2026-10-01",
        "Complete blood count",
        {
            "labs": [
                {
                    "name": "Hemoglobin",
                    "value": "13.4 g/dL",
                    "reference_range": "12.0-16.0 g/dL",
                    "source_text": "Hemoglobin: 13.4 g/dL; reference 12.0-16.0 g/dL.",
                }
            ]
        },
        "Hemoglobin: 13.4 g/dL; reference 12.0-16.0 g/dL.",
    ),
]


def fixtures(directory):
    folder = Path(directory) / "samples"
    folder.mkdir(parents=True, exist_ok=True)
    mapping = {}
    files = []
    for key, kind, date, title, fields, body in SAMPLES:
        path = folder / (key + ".pdf")
        if not path.exists():
            doc = fitz.open()
            page = doc.new_page()
            page.insert_text(
                (48, 58), "MEDIBRIDGE / SYNTHETIC DEMONSTRATION", fontsize=16
            )
            page.insert_text(
                (48, 98),
                f"FICTIONAL PATIENT: Alex Morgan\nDemo Care Clinic | {kind}\nDocument date: {date}\n\n{body}\n\nNOT A REAL MEDICAL RECORD. Not for clinical decisions.",
                fontsize=11,
            )
            doc.save(path)
            doc.close()
        mapping[hashlib.sha256(path.read_bytes()).hexdigest()] = {
            "document_type": kind,
            "document_date": date,
            "provider": "Demo Care Clinic",
            "confidence": "unverified",
            "uncertain_fields": ["Synthetic example; patient review is required."],
            **fields,
        }
        files.append({"key": key, "title": title, "path": path})
    return mapping, files
