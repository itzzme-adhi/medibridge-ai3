from datetime import date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Medication(Strict):
    name: str = Field(min_length=1, max_length=160)
    dosage: str = Field(default="", max_length=160)
    frequency: str = Field(default="", max_length=160)
    status: Literal["unknown", "current", "historical"] = "unknown"
    start_date: date | None = None
    end_date: date | None = None
    source_text: str = Field(default="", max_length=1000)


class Allergy(Strict):
    name: str = Field(min_length=1, max_length=160)
    severity: Literal["unknown", "mild", "moderate", "severe"] = "unknown"
    source_text: str = Field(default="", max_length=1000)


class Lab(Strict):
    name: str = Field(min_length=1, max_length=160)
    value: str = Field(max_length=160)
    reference_range: str = Field(default="", max_length=160)
    source_text: str = Field(default="", max_length=1000)


class Extraction(Strict):
    document_type: Literal[
        "Prescription",
        "Lab Report",
        "Consultation",
        "Discharge Summary",
        "Scan",
        "Other",
    ] = "Other"
    document_date: date | None = None
    provider: str | None = Field(default=None, max_length=250)
    diagnoses: list[str] = Field(default_factory=list, max_length=30)
    medications: list[Medication] = Field(default_factory=list, max_length=40)
    allergies: list[Allergy] = Field(default_factory=list, max_length=40)
    labs: list[Lab] = Field(default_factory=list, max_length=80)
    procedures: list[str] = Field(default_factory=list, max_length=30)
    follow_up: list[str] = Field(default_factory=list, max_length=30)
    uncertain_fields: list[str] = Field(default_factory=list, max_length=60)
    source_text: str = Field(default="", max_length=50000)
    confidence: Literal["unverified", "low", "medium", "high"] = "unverified"


class Review(Strict):
    extraction: Extraction
    confirmed: Literal[True]


class Share(Strict):
    label: str = Field(min_length=1, max_length=100)
    record_ids: list[str] = Field(min_length=1, max_length=100)
    expires_hours: int = Field(default=24, ge=1, le=168)


class Profile(Strict):
    display_name: str = Field(min_length=1, max_length=100)


class Emergency(Strict):
    display_name: str = Field(default="", max_length=100)
    blood_group: Literal[
        "Unknown", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"
    ] = "Unknown"
    allergies: str = Field(default="", max_length=1000)
    medications: str = Field(default="", max_length=2000)
    conditions: str = Field(default="", max_length=2000)
    contact_name: str = Field(default="", max_length=100)
    contact_phone: str = Field(default="", max_length=40)
    include: list[
        Literal[
            "display_name",
            "blood_group",
            "allergies",
            "medications",
            "conditions",
            "contact_name",
            "contact_phone",
        ]
    ] = Field(default_factory=list)


class EmergencyGrant(Strict):
    expires_days: int = Field(default=30, ge=1, le=365)
