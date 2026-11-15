# report-data.json schema

`scripts/build_report.mjs` injects this JSON into `templates/report-template.html`; the template's JavaScript renders every section from it. Field names are load-bearing. Strings are plain text unless noted; the renderer escapes HTML. Arrays may be empty but must exist. All user-facing text is in the report language.

Table of contents of the one JSON block below, its top-level keys in order:

- meta
- verdict
- scorecard
- council
- lean_canvas
- assumptions
- research
- side_project_fit
- autopilot_fit
- risks
- experiments
- thresholds
- appendix
- labels

```jsonc
{
  "meta": {
    "title": "Idea name",                 // required
    "date": "2026-09-03",                 // required, ISO
    "language": "pl",                     // required, BCP-47
    "quick_mode": false,                  // required; true when --quick was used
    "one_liner": "One sentence: what it is, for whom"  // required
  },

  "verdict": {
    "label": "Go" | "Pivot" | "No-Go",    // required, exactly these values
    "conditional_on": "",                 // "" or "experiment #1 (...)"
    "summary": "One-sentence verdict justification",   // required
    "arithmetic": "Weighted total 3.4/5; weakest key dimension Distribution = 2 → cannot be Go",
    "biggest_risk": "Named by council: …",             // required
    "pivot_suggestion": "",               // required when label == Pivot
    "council_warning": ""                 // non-empty → rendered as a warning banner (e.g. unanimity)
  },

  "scorecard": {
    "total": 3.4,                         // required, number
    "dimensions": [                       // required, exactly the 9 dimensions in canonical order
      {
        "name": "Problem strength",       // in report language
        "key": "problem",                 // canonical key: problem | market | competition | advantage | revenue | distribution | timing | side_project_fit | autopilot_fit
        "score": 3,                       // 1-5 integer (primary owner's score)
        "range": "2-4",                   // "" when undisputed
        "weight": 2,
        "confidence": "high" | "medium" | "low",
        "owner": "Target customer",
        "dissenters": ["Skeptic"],
        "justification": "Paragraph quoting members",
        "evidence": [ { "text": "…", "url": "https://…" } ]   // url may be "" with text "no data found"
      }
    ]
  },

  "council": {
    "round2_held": true,
    "health": "Positions differed in round 1 (3 Go / 2 Pivot / 2 No-Go); Growth moved to Pivot in round 2.",
    "agreed": [ "Claim - supported by: Customer, Analyst, Growth, Operator, Risk" ],
    "disputed": [
      {
        "topic": "Whether SEO is a viable channel",
        "sides": [
          { "members": ["Growth"], "argument": "…" },
          { "members": ["Skeptic", "Analyst"], "argument": "…" }
        ],
        "moved_in_round2": "Nobody moved" 
      }
    ],
    "dissent": { "from": ["Visionary", "Customer"], "text": "Multi-paragraph dissent in their words" },  // required
    "members": [                          // required, 7 entries
      {
        "name": "Skeptic / red team",
        "position_r1": "No-Go",
        "position_r2": "No-Go",           // "" if round 2 skipped
        "arguments": [ "…", "…", "…" ],
        "scores": [ { "dimension": "Distribution", "score": 1, "confidence": "medium", "reason": "…" } ],
        "change_my_mind": [ "If ≥5 of 10 interviews …" ],
        "round2_notes": "Responded to Growth arg 2: …"   // "" if skipped
      }
    ]
  },

  "lean_canvas": {                        // required, all 9 keys, strings (use \n for line breaks)
    "problem": "", "customer_segments": "", "uvp": "", "solution": "", "channels": "",
    "revenue": "", "costs": "", "key_metrics": "", "unfair_advantage": ""
  },

  "assumptions": [
    { "id": "A1", "text": "", "category": "desirability", "evidence_level": "none", "risk_rank": 1 }
  ],

  "research": {                           // required; each block has facts / conclusions / open
    "problem":      { "facts": [ { "text": "", "url": "", "outdated": false } ], "conclusions": [""], "open": [""], "quotes": [ { "text": "short verbatim complaint", "url": "" } ] },
    "market":       { "facts": [], "conclusions": [], "open": [],
                      "sizing": [ { "level": "TAM", "value": "", "method": "top-down: …", "sources": ["https://…"] } ],
                      "regulation": [ { "rule": "", "requires": "", "url": "" } ] },
    "competition":  { "facts": [], "conclusions": [], "open": [],
                      "competitors": [ { "name": "", "url": "", "what": "", "pricing": "", "segment": "", "weaknesses": "", "strengths": "", "last_activity": "" } ],
                      "graveyard":   [ { "name": "", "what": "", "when": "", "reason": "" } ],
                      "whitespace": "" },
    "business_model": { "facts": [], "conclusions": [], "open": [], "unit_economics": "" },
    "distribution": { "facts": [], "conclusions": [], "open": [],
                      "channels": [ { "channel": "", "user_has_access": "yes|partial|no", "cac_or_cost": "", "time_to_signal": "", "autopilot_compatible": "yes|no", "notes": "" } ],
                      "first_channel_to_test": "" }
  },

  "side_project_fit": {
    "score": 3,
    "summary": "",
    "factors": [ { "name": "Time to MVP (non-code)", "assessment": "", "weight": "high" } ]
  },

  "autopilot_fit": {
    "score": 3,
    "hours_per_week_total": "2-4",
    "layers": [ { "name": "Acquire", "hours": "0.5-1", "notes": "" }, { "name": "Deliver", "hours": "", "notes": "" }, { "name": "Maintain", "hours": "", "notes": "" } ],
    "killers": [ { "killer": "", "fix_type": "remove|automate|redesign|none", "fix": "" } ]
  },

  "risks": [
    { "risk": "", "likelihood": "L|M|H", "impact": "L|M|H", "warning_sign": "", "mitigation": "", "mitigable": "yes|partly|no" }
  ],

  "experiments": [                        // required, 3-8 entries, ordered
    { "n": 1, "hypothesis": "", "test": "", "metric": "", "pass": "", "fail": "", "cost": "", "duration": "", "owner": "Growth" }
  ],

  "thresholds": { "go": "", "pivot": "", "no_go": "" },   // required, numeric, written before experiments run

  "appendix": {
    "data_gaps": [""],
    "methodology": "Short description of the run: sources searched, council rounds, weights used",
    "sources": [ { "title": "", "url": "", "date": "", "outdated": false } ],
    "closing_note": "Verdict = worth testing, not worth building …"
  },

  "labels": {                             // required: every UI string in the report language
    "verdict": "Werdykt", "scorecard": "Scorecard", "weighted_total": "Wynik ważony", "confidence": "Pewność",
    "dimension": "Wymiar", "score": "Ocena", "weight": "Waga", "owner": "Właściciel", "dissenters": "Nie zgadza się",
    "evidence": "Dowody", "council": "Rada", "council_health": "Kondycja rady", "agreed": "Punkty zgodne",
    "disputed": "Punkty sporne", "dissent": "Zdanie odrębne", "members": "Opinie członków",
    "round1": "Runda 1", "round2": "Runda 2", "round2_skipped": "Runda 2 pominięta (--quick)",
    "arguments": "Najsilniejsze argumenty", "change_my_mind": "Co zmieniłoby moje zdanie",
    "lean_canvas": "Lean Canvas", "assumptions": "Ukryte założenia", "research": "Research",
    "problem": "Problem i klient", "market": "Rynek", "competition": "Konkurencja", "business_model": "Model biznesowy",
    "distribution": "Dystrybucja", "facts": "Fakty", "conclusions": "Wnioski", "open": "Brak danych / pytania otwarte",
    "quotes": "Głosy użytkowników", "sizing": "Wielkość rynku", "method": "Metoda", "regulation": "Regulacje",
    "competitors": "Konkurenci", "graveyard": "Cmentarz", "whitespace": "Luka", "channels": "Kanały",
    "side_project_fit": "Side-project fit", "autopilot_fit": "Autopilot fit", "hours_per_week": "h/tydz. po starcie",
    "killers": "Zabójcy autopilota", "fix": "Propozycja", "risks": "Ryzyka", "likelihood": "Prawdopodobieństwo",
    "impact": "Wpływ", "warning_sign": "Sygnał ostrzegawczy", "mitigation": "Mitygacja",
    "experiments": "Plan eksperymentów", "hypothesis": "Hipoteza", "test": "Test", "metric": "Metryka",
    "pass": "Próg zaliczenia", "fail": "Próg odrzucenia", "cost": "Koszt", "duration": "Czas",
    "thresholds": "Progi decyzyjne (ustalone z góry)", "appendix": "Aneks", "data_gaps": "Luki w danych",
    "methodology": "Metodologia", "sources": "Źródła", "outdated": "możliwie nieaktualne",
    "closing_note": "Czego ten raport nie mówi", "biggest_risk": "Największe ryzyko", "conditional_on": "Warunkowo, zależnie od",
    "pivot_suggestion": "Co zmienić", "expand_all": "Rozwiń wszystko", "collapse_all": "Zwiń wszystko",
    "generated": "Wygenerowano", "quick_mode_note": "Tryb szybki: rada bez rundy 2",
    "canvas": { "problem": "Problem", "solution": "Rozwiązanie", "uvp": "Unikalna propozycja wartości", "unfair_advantage": "Nieuczciwa przewaga",
                "customer_segments": "Segmenty klientów", "key_metrics": "Kluczowe metryki", "channels": "Kanały", "costs": "Struktura kosztów", "revenue": "Strumienie przychodów" }
  }
}
```

The example label values are Polish only as an illustration; fill them in the report language every time. `scripts/build_report.mjs` falls back to English for any label key that is missing, so a partially filled `labels` object still renders.
