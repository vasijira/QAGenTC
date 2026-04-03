/*
  © 2026 Vasin Jirasukrujee
  Internal QA Tool
  All Rights Reserved

  Unauthorized copying or reuse is prohibited.
*/

/* ============================================================
   GLOBAL STATE
============================================================ */
let pastedImages = [];
let jsonOutput = [];

// ✅ Feature flag: Toggle Option 4 enrichment
const ENABLE_OPTION_4_ENRICH = true;

/* ============================================================
   COLUMN STRUCTURE (Editable + Default Value)
============================================================ */
let dynamicColumns = [
  { name: "Req ID.", value: "" },
  { name: "Story Card", value: "" },
  { name: "Req Description", value: "" },
  { name: "TC Level", value: "" },
  { name: "Positive/Negative", value: "" },
  { name: "Functional/Non-Functional", value: "" },
  { name: "TC no.", value: "" },
  { name: "Feature", value: "" },
  { name: "Sub-feature", value: "" },
  { name: "Test case description", value: "" },
  { name: "Prerequisite", value: "" },
  { name: "Step no.", value: "" },
  { name: "Step description", value: "" },
  { name: "Expected result", value: "" },
  { name: "Test data", value: "" },
  { name: "Test by", value: "" },
  { name: "Test Period", value: "" },
  { name: "Test result", value: "" },
  { name: "Remark", value: "" },
  { name: "Defect (Jira no.)", value: "" }
];

/* ============================================================
   ✅ PROMPT – DETAILED + MULTI-IMAGE ENFORCED
============================================================ */
const PROMPT = `
You are a professional QA Engineer working on an enterprise system.

==============================
SOURCE OF TRUTH (VERY IMPORTANT)
==============================

The ONLY valid sources for generating test cases are:
1. The Requirement text provided below
2. ALL attached images

IMPORTANT:
- Multiple images may be provided.
- ALL images represent REQUIRED context.
- You MUST consider ALL images together before generating test cases.
- Do NOT base test cases on only one image.
+ - Adding more images MUST NOT reduce coverage.
+ - If more UI elements or rules are visible,
+   expand test cases within the SAME scope.


DO NOT use external knowledge.
DO NOT infer generic flows (Login, Registration, Authentication)
unless explicitly mentioned in the Requirement or visible in images.

==============================
STRICT DOMAIN RULES
==============================

Generate test cases ONLY within the scope of the Requirement and images.
If unsure whether a test case is in scope:
- DISCARD it.

==============================
OUTPUT RULES
==============================

- Respond ONLY in English.
- Output ONLY a valid JSON array.
- Steps MUST NOT include numbering.

==============================
FORMAT
==============================

[
  {
    "Title": "",
    "Type": "",
    "Pre-conditions": [],
    "Steps": [],
    "Expected Result": []
  }
]

==============================
INPUT
==============================

Requirement:
{{REQUIREMENT}}

Flow rule:
{{FLOW_RULE}}
`;

/* ============================================================
   PROMPT BUILDER
============================================================ */
function buildPrompt(req, flowRule) {
  return PROMPT
    .replace("{{REQUIREMENT}}", req)
    .replace("{{FLOW_RULE}}", flowRule)
    + getLanguageRule();
}

/* ============================================================
   สร้าง Language Rule
============================================================ */
function getLanguageRule() {
  const lang = document.getElementById("outputLanguage")?.value || "en";

  if (lang === "th") {
    return `
LANGUAGE RULE:
- Generate ALL test cases in Thai language.
- Use professional Thai QA wording.
- Do NOT mix English and Thai in the output.
`;
  }

  // default English
  return `
LANGUAGE RULE:
- Generate ALL test cases in English.
- Use professional QA wording.
- Do NOT mix languages in the output.
`;
}

/* ============================================================
   UTILITIES
============================================================ */
function extractJson(text) {
  const s = text.indexOf("[");
  const e = text.lastIndexOf("]") + 1;
  if (s === -1 || e === -1) return null;
  return text.substring(s, e);
}

function normalizeArray(v) {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  return [v];
}

function stripNumber(t) {
  return String(t).replace(/^\s*\d+[\.\)]\s*/, "");
}

function generateTCNumber(i) {
  return `TC-${String(i + 1).padStart(3, "0")}`;
}

function normalizeTestCase(tc) {
  return {
    title: tc.Title || "",
    type: tc.Type || "",
    preconditions: normalizeArray(tc["Pre-conditions"]),
    steps: normalizeArray(tc.Steps),
    expected: normalizeArray(tc["Expected Result"])
  };
}

function extractFieldName(title) {
  if (!title) return null;

  // QA-style heuristic:
  // "Verify <Field> ..." → extract <Field>
  const match = title.match(
    /^verify\s+(.+?)(\s+when|\s+is|\s+are|\s+display|\s+behavior|$)/i
  );

  return match ? match[1].trim() : null;
}
``

/**
 * Option 1:
 * Split test cases that combine multiple fields into separate test cases
 * without creating new scenarios.
 */
function splitCombinedTestCases(tcList) {
  const result = [];

  tcList.forEach(tc => {
    const title = tc.Title || "";

    // ถ้า Title มี "and" หรือ ","
    if (title.includes(" and ") || title.includes(",")) {

      // แยกด้วย "and" มาก่อน ถ้าไม่มีค่อยใช้ comma
      const parts = title.includes(" and ")
        ? title.split(" and ")
        : title.split(",");

      parts.forEach(part => {
        const clean = part.trim();
        if (!clean) return;

        result.push({
          ...tc,
          Title: clean,
          Type: tc.Type || "Functional"
        });
      });

    } else {
      // ถ้าไม่ต้อง split ใช้ของเดิม
      result.push(tc);
    }
  });

  return result;
}

function enrichNegativeAndEmpty(tcList) {
  if (!ENABLE_OPTION_4_ENRICH) return tcList;

  const enriched = [...tcList];
  const coverage = {}; // { fieldName: { negative: bool, empty: bool } }

  // วิเคราะห์ coverage ที่มีอยู่
  tcList.forEach(tc => {
    const field = extractFieldName(tc.Title);
    if (!field) return;

    coverage[field] = coverage[field] || { negative: false, empty: false };

    const t = (tc.Title + " " + (tc.Type || "")).toLowerCase();
    if (t.includes("invalid") || t.includes("negative")) {
      coverage[field].negative = true;
    }
    if (t.includes("empty") || t.includes("blank") || t.includes("missing")) {
      coverage[field].empty = true;
    }
  });

  // ใช้ Functional TC เป็น base
  const baseTCs = tcList.filter(tc =>
    (tc.Type || "").toLowerCase().includes("functional")
  );

  baseTCs.forEach(baseTC => {
    const field = extractFieldName(baseTC.Title);
    if (!field) return;

    coverage[field] = coverage[field] || { negative: false, empty: false };

    // ✅ Negative (1 ครั้งต่อ field)
    if (!coverage[field].negative) {
      enriched.push({
        ...baseTC,
        Title: `Verify ${field} validation when invalid value is entered`,
        Type: "Negative",
        ExpectedResult: [
          "System displays validation message and prevents saving invalid data"
        ]
      });
      coverage[field].negative = true;
    }

    // ✅ Empty (1 ครั้งต่อ field)
    if (!coverage[field].empty) {
      enriched.push({
        ...baseTC,
        Title: `Verify ${field} behavior when mandatory field is left empty`,
        Type: "Edge Case",
        ExpectedResult: [
          "System enforces mandatory field rule and displays appropriate message"
        ]
      });
      coverage[field].empty = true;
    }
  });

  return enriched;
}

/**
 * Option 4:
 * Enrich test cases with Negative and Empty scenarios
 * without inventing new features.
 */
function enrichNegativeAndEmpty(tcList) {
  const enriched = [...tcList];

  const hasNegative = tcList.some(tc =>
    (tc.Type || "").toLowerCase().includes("negative") ||
    (tc.Title || "").toLowerCase().includes("invalid")
  );

  const hasEmpty = tcList.some(tc =>
    (tc.Title || "").toLowerCase().includes("empty") ||
    (tc.Title || "").toLowerCase().includes("blank") ||
    (tc.Title || "").toLowerCase().includes("missing")
  );

  // ใช้ test case แรกที่เป็น Functional เป็น base
  const baseTC = tcList.find(tc =>
    (tc.Type || "").toLowerCase().includes("functional")
  ) || tcList[0];

  if (!baseTC) return enriched;

  // ✅ เติม Negative
  if (!hasNegative) {
    enriched.push({
      ...baseTC,
      Title: `${baseTC.Title} - invalid value`,
      Type: "Negative",
      ExpectedResult: [
        "System displays validation error and prevents saving invalid value"
      ]
    });
  }

  // ✅ เติม Empty / Missing
  if (!hasEmpty) {
    enriched.push({
      ...baseTC,
      Title: `${baseTC.Title} - empty or missing value`,
      Type: "Edge Case",
      ExpectedResult: [
        "System handles empty value according to validation rules"
      ]
    });
  }

  return enriched;
}



/* ============================================================
   COLUMN STRUCTURE UI (DEFAULT PLACEHOLDER ✅)
============================================================ */
function renderColumnTable() {
  const tbody = document.getElementById("columnTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  dynamicColumns.forEach((col, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="border p-1 text-center">${i + 1}</td>
      <td class="border p-1">
        <input class="w-full p-1 border rounded" value="${col.name}">
      </td>
      <td class="border p-1">
        <input class="w-full p-1 border rounded bg-yellow-50"
               placeholder="Default value"
               value="${col.value}">
      </td>
      <td class="border p-1 text-center"></td>
    `;

    tr.querySelectorAll("input")[0].oninput = e =>
      (dynamicColumns[i].name = e.target.value);
    tr.querySelectorAll("input")[1].oninput = e =>
      (dynamicColumns[i].value = e.target.value);

    const btn = document.createElement("button");
    btn.innerText = "Remove";
    btn.className = "bg-red-600 text-white px-2 py-1 rounded";
    btn.onclick = () => removeColumn(i);

    tr.children[3].appendChild(btn);
    tbody.appendChild(tr);
  });
}

function addColumn() {
  dynamicColumns.push({ name: "New Column", value: "" });
  renderColumnTable();
}

function removeColumn(i) {
  dynamicColumns.splice(i, 1);
  renderColumnTable();
}

/* ============================================================
   IMAGE HANDLING (UPLOAD / DROP / PASTE ✅)
============================================================ */
function renderImages() {
  const box = document.getElementById("imagePreviewContainer");
  if (!box) return;
  box.innerHTML = "";

  pastedImages.forEach((b64, i) => {
    const wrap = document.createElement("div");
    wrap.className = "relative w-24 h-24 border rounded flex items-center justify-center";

    const img = document.createElement("img");
    img.src = b64;
    img.className = "max-w-full max-h-full object-contain";

    const btn = document.createElement("button");
    btn.innerText = "✕";
    btn.className = "absolute -top-2 -right-2 bg-red-600 text-white w-5 h-5 rounded-full";
    btn.onclick = () => {
      pastedImages.splice(i, 1);
      renderImages();
    };

    wrap.appendChild(img);
    wrap.appendChild(btn);
    box.appendChild(wrap);
  });
}

function handleUpload(files) {
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const reader = new FileReader();
    reader.onload = e => {
      pastedImages.push(e.target.result);
      renderImages();
    };
    reader.readAsDataURL(file);
  }
}

function initImageInputs() {
  const upload = document.getElementById("uploadInput");
  const drop = document.getElementById("dropZone");

  if (upload) upload.onchange = e => handleUpload(e.target.files);

  if (drop) {
    drop.addEventListener("dragover", e => {
      e.preventDefault();
      drop.classList.add("dragover");
    });
    drop.addEventListener("dragleave", () =>
      drop.classList.remove("dragover"));
    drop.addEventListener("drop", e => {
      e.preventDefault();
      drop.classList.remove("dragover");
      handleUpload(e.dataTransfer.files);
    });
  }

  // ✅ CTRL + V Paste Image
  document.addEventListener("paste", e => {
    const items = e.clipboardData?.items || [];
    for (let item of items) {
      if (!item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      const reader = new FileReader();
      reader.onload = ev => {
        pastedImages.push(ev.target.result);
        renderImages();
      };
      reader.readAsDataURL(file);
      e.preventDefault();
    }
  });
}

/* ============================================================
   FLOW MODE
============================================================ */
function getFlowRule() {
  const v = document.querySelector('input[name="flowMode"]:checked')?.value;
  return v === "single"
    ? "All images represent one flow."
    : "Each image may represent different flows.";
}

/* ============================================================
   GENERATE TEST CASES
============================================================ */
async function generateTC() {
  const apiKey = document.getElementById("apiKey").value.trim();
  const baseUrl = document.getElementById("baseUrl").value.trim().replace(/\/$/, "");
  const model = document.getElementById("modelName").value;
  const req = document.getElementById("requirement").value;

  if (!apiKey || !baseUrl) return alert("Missing API config");
  if (!req && pastedImages.length === 0)
    return alert("Provide requirement or image");

  document.getElementById("loading").classList.remove("hidden");
  document.getElementById("result").innerHTML = "";

  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: buildPrompt(req, getFlowRule()) },
            ...pastedImages.map(img => ({
              type: "image_url",
              image_url: { url: img }
            }))
          ]
        }]
      })
    });

    const data = await res.json();
    const jsonStr = extractJson(data?.choices?.[0]?.message?.content || "");
    if (!jsonStr) throw new Error("Invalid AI response");

let rawList = JSON.parse(jsonStr);

// ✅ Option 1: split combined test cases
rawList = splitCombinedTestCases(rawList);
rawList = enrichNegativeAndEmpty(rawList);

// ✅ Option 4: enrich Negative + Empty
rawList = enrichNegativeAndEmpty(rawList);

jsonOutput = rawList;
renderAccordion(jsonOutput);
bindToggleSingleTestCase();
document.getElementById("exportSection").classList.remove("hidden");
``

  } catch (e) {
    console.error(e);
    alert("Generate failed");
  } finally {
    document.getElementById("loading").classList.add("hidden");
  }
}

/* ============================================================
   RESULT UI + COPY
============================================================ */
function renderAccordion(list) {
  const box = document.getElementById("result");
  box.innerHTML = "";

  list.forEach((raw, i) => {
    const tc = normalizeTestCase(raw);

    box.insertAdjacentHTML("beforeend", `
      <div class="border rounded bg-white mb-3">

        <!-- HEADER: จะแสดงตลอด -->
        <div class="tc-header p-3 font-semibold bg-slate-100 cursor-pointer">
          ${generateTCNumber(i)} — ${tc.title}
        </div>

        <!-- DETAIL: เอาไว้หุบ/ขยาย -->
        <div class="tc-detail p-4">

          <div><b>Type:</b> ${tc.type}</div>

          <div><b>Pre-conditions:</b>
            <ul>
              ${tc.preconditions.map(p => `<li>${p}</li>`).join("")}
            </ul>
          </div>

          <div><b>Steps:</b>
            <ol>
              ${tc.steps.map(s => `<li>${stripNumber(s)}</li>`).join("")}
            </ol>
          </div>

          <div><b>Expected Result:</b>
            <ul>
              ${tc.expected.map(e => `<li>${e}</li>`).join("")}
            </ul>
          </div>

          <button
            class="bg-orange-600 text-white px-2 py-1 rounded mt-2 text-xs"
            onclick="copySingleToJira(${i})">
            📋 Copy This Test Case
          </button>

        </div>
      </div>
    `);
  });
}

function bindToggleSingleTestCase() {
  document.querySelectorAll(".tc-header").forEach(header => {
    header.onclick = () => {
      const detail = header.nextElementSibling;
      if (!detail) return;

      detail.classList.toggle("hidden");
    };
  });
}
``

function copySingleToJira(i) {
  const tc = normalizeTestCase(jsonOutput[i]);
  navigator.clipboard.writeText(
`${generateTCNumber(i)} — ${tc.title}

Type:
${tc.type}

Pre-conditions:
${tc.preconditions.map(p => `- ${p}`).join("\n")}

Steps:
${tc.steps.map((s, idx) => `${idx + 1}. ${stripNumber(s)}`).join("\n")}

Expected Result:
${tc.expected.map(e => `- ${e}`).join("\n")}
`);
}

function copyAllToJira() {
  let text = "";
  jsonOutput.forEach((_, i) => {
    const tc = normalizeTestCase(jsonOutput[i]);
    text += `
${generateTCNumber(i)} — ${tc.title}

Type:
${tc.type}

Pre-conditions:
${tc.preconditions.map(p => `- ${p}`).join("\n")}

Steps:
${tc.steps.map((s, idx) => `${idx + 1}. ${stripNumber(s)}`).join("\n")}

Expected Result:
${tc.expected.map(e => `- ${e}`).join("\n")}
--------------------
`;
  });
  navigator.clipboard.writeText(text.trim());
}

function exportExcel() {
  const headers = dynamicColumns.map(c => c.name);
  const wsData = [headers];

  jsonOutput.forEach((raw, i) => {
    const tc = normalizeTestCase(raw);

    wsData.push(dynamicColumns.map(col =>
      col.name === "TC no." ? generateTCNumber(i)
      : col.name === "Test case description" ? tc.title
      : col.value
    ));

    tc.steps.forEach((step, idx) => {
      wsData.push(dynamicColumns.map(col =>
        col.name === "Step no." ? idx + 1
        : col.name === "Step description" ? stripNumber(step)
        : col.name === "Expected result" ? tc.expected[idx] || ""
        : ""
      ));
    });
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(wsData),
    "TestCases"
  );
  XLSX.writeFile(wb, "AI_Test_Cases.xlsx");
}

/* ============================================================
   EXPOSE FUNCTIONS (CRITICAL FOR BUTTONS)
============================================================ */
window.generateTC = generateTC;
window.expandAll = () => {
  document.querySelectorAll(".tc-detail")
    .forEach(d => d.classList.remove("hidden"));
};

window.collapseAll = () => {
  document.querySelectorAll(".tc-detail")
    .forEach(d => d.classList.add("hidden"));
};window.copyAllToJira = copyAllToJira;
window.copySingleToJira = copySingleToJira;
window.exportExcel = exportExcel;
window.addColumn = addColumn;
window.removeColumn = removeColumn;

/* ============================================================
   INIT
============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  renderColumnTable();
  initImageInputs();
});
``