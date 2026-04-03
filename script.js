/* ============================================================
   GLOBAL STATE
============================================================ */
let pastedImages = [];
let jsonOutput = [];

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
   PROMPT
============================================================ */
const PROMPT = `
You are a professional QA Engineer.

RULES:
- Respond ONLY in English.
- Output ONLY a valid JSON array.
- Steps MUST NOT include numbering.

Generate a MINIMUM of 10 test cases.
Do NOT generate fewer than 10.

MANDATORY FIELDS:
- Type
- Pre-conditions

JSON FORMAT:
[
  {
    "Title": "",
    "Type": "",
    "Pre-conditions": [],
    "Steps": [],
    "Expected Result": []
  }
]

Requirement:
{{REQUIREMENT}}

{{FLOW_RULE}}
`;

function buildPrompt(req, flowRule) {
  return PROMPT
    .replace("{{REQUIREMENT}}", req)
    .replace("{{FLOW_RULE}}", flowRule);
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

/* ============================================================
   NORMALIZE AI RESPONSE
============================================================ */
function normalizeTestCase(tc) {
  return {
    title: tc.Title ?? "Untitled Test Case",
    type: tc.Type ?? "",
    preconditions: normalizeArray(tc["Pre-conditions"]),
    steps: normalizeArray(tc.Steps),
    expected: normalizeArray(tc["Expected Result"])
  };
}

/* ============================================================
   COLUMN STRUCTURE UI
============================================================ */
function renderColumnTable() {
  const tbody = document.getElementById("columnTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  dynamicColumns.forEach((col, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="border p-2 text-center">${i + 1}</td>
      <td class="border p-2">
        <input class="w-full p-1 border rounded" value="${col.name}">
      </td>
      <td class="border p-2">
        <input class="w-full p-1 border rounded bg-yellow-50"
               placeholder="Default value"
               value="${col.value}">
      </td>
      <td class="border p-2 text-center"></td>
    `;

    tr.querySelectorAll("input")[0].oninput = e =>
      (dynamicColumns[i].name = e.target.value);
    tr.querySelectorAll("input")[1].oninput = e =>
      (dynamicColumns[i].value = e.target.value);

    const btn = document.createElement("button");
    btn.className = "bg-red-500 text-white px-2 py-1 rounded";
    btn.innerText = "Remove";
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
   IMAGE PREVIEW – BASE64 SAFE ✅
============================================================ */
function renderImages() {
  const container = document.getElementById("imagePreviewContainer");
  if (!container) return;
  container.innerHTML = "";

  pastedImages.forEach((base64, index) => {
    const wrapper = document.createElement("div");
    wrapper.className =
      "relative w-32 h-32 border rounded bg-white flex items-center justify-center";

    const img = document.createElement("img");
    img.src = base64;
    img.className = "max-w-full max-h-full object-contain";

    const btn = document.createElement("button");
    btn.className =
      "absolute -top-2 -right-2 bg-red-600 text-white w-6 h-6 rounded-full";
    btn.innerText = "✕";
    btn.onclick = () => removeImg(index);

    wrapper.appendChild(img);
    wrapper.appendChild(btn);
    container.appendChild(wrapper);
  });
}

function removeImg(i) {
  pastedImages.splice(i, 1);
  renderImages();
}

function handleUpload(files) {
  for (let file of files) {
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
  const uploadInput = document.getElementById("uploadInput");
  const dropZone = document.getElementById("dropZone");

  if (uploadInput) {
    uploadInput.onchange = e => handleUpload(e.target.files);
  }

  if (dropZone) {
    dropZone.addEventListener("dragover", e => {
      e.preventDefault();
      dropZone.classList.add("bg-slate-200");
    });
    dropZone.addEventListener("dragleave", () =>
      dropZone.classList.remove("bg-slate-200")
    );
    dropZone.addEventListener("drop", e => {
      e.preventDefault();
      dropZone.classList.remove("bg-slate-200");
      handleUpload(e.dataTransfer.files);
    });
  }

  document.addEventListener("paste", e => {
    const items = e.clipboardData?.items || [];
    for (let item of items) {
      if (!item.type.startsWith("image/")) continue;
      const reader = new FileReader();
      reader.onload = ev => {
        pastedImages.push(ev.target.result);
        renderImages();
      };
      reader.readAsDataURL(item.getAsFile());
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
    ? "All images represent one user flow."
    : "Each image represents different flows.";
}

/* ============================================================
   GENERATE TEST CASES
============================================================ */
async function generateTC() {
  const apiKey = document.getElementById("apiKey").value.trim();
  const baseUrl = document.getElementById("baseUrl").value.trim().replace(/\/$/, "");
  const model = document.getElementById("modelName").value;
  const req = document.getElementById("requirement").value;

  if (!apiKey || !baseUrl) return alert("Please enter BASE URL and API KEY");
  if (!req.trim() && pastedImages.length === 0)
    return alert("Please provide Requirement or Image");

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
          content: [{ type: "text", text: buildPrompt(req, getFlowRule()) }]
        }]
      })
    });

    const json = await res.json();
    const cleaned = extractJson(json?.choices?.[0]?.message?.content || "");
    jsonOutput = JSON.parse(cleaned || []);

    renderAccordion(jsonOutput);
    document.getElementById("exportSection").classList.remove("hidden");
  } catch (e) {
    console.error(e);
    alert("Generate failed");
  } finally {
    document.getElementById("loading").classList.add("hidden");
  }
}

/* ============================================================
   RESULT UI (WITH COPY PER TEST CASE ✅)
============================================================ */
function renderAccordion(list) {
  const box = document.getElementById("result");
  box.innerHTML = "";

  list.forEach((rawTc, i) => {
    const tc = normalizeTestCase(rawTc);

    box.insertAdjacentHTML("beforeend", `
      <div class="border rounded shadow bg-white mb-4 p-4">
        <b>${generateTCNumber(i)} — ${tc.title}</b>

        <div class="mt-2"><b>Type:</b> ${tc.type}</div>

        <div class="mt-2"><b>Pre-conditions:</b>
          <ul class="ml-6 list-disc">
            ${tc.preconditions.map(p => `<li>${p}</li>`).join("")}
          </ul>
        </div>

        <div class="mt-2"><b>Steps:</b>
          <ol class="ml-6 list-decimal">
            ${tc.steps.map(s => `<li>${stripNumber(s)}</li>`).join("")}
          </ol>
        </div>

        <div class="mt-2"><b>Expected Result:</b>
          <ul class="ml-6 list-disc">
            ${tc.expected.map(e => `<li>${e}</li>`).join("")}
          </ul>
        </div>

        <div class="mt-4">
          <button
            class="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1 rounded"
            onclick="copySingleToJira(${i})">
            📋 Copy This Test Case
          </button>
        </div>
      </div>
    `);
  });
}

/* ============================================================
   CONTROL BAR FUNCTIONS ✅
============================================================ */
function expandAll() {
  document.querySelectorAll("#result > div").forEach(el =>
    el.classList.remove("hidden"));
}

function collapseAll() {
  document.querySelectorAll("#result > div").forEach(el =>
    el.classList.add("hidden"));
}

/* ============================================================
   COPY FUNCTIONS
============================================================ */
function copySingleToJira(index) {
  const tc = normalizeTestCase(jsonOutput[index]);
  const tcNo = generateTCNumber(index);

  const text = `
${tcNo} — ${tc.title}

Type:
${tc.type}

Pre-conditions:
${tc.preconditions.map(p => `- ${p}`).join("\n")}

Steps:
${tc.steps.map((s, i) => `${i + 1}. ${stripNumber(s)}`).join("\n")}

Expected Result:
${tc.expected.map(e => `- ${e}`).join("\n")}
`.trim();

  navigator.clipboard.writeText(text);
}

function copyAllToJira() {
  let text = "";
  jsonOutput.forEach((rawTc, i) => {
    const tc = normalizeTestCase(rawTc);
    const tcNo = generateTCNumber(i);

    text += `
${tcNo} — ${tc.title}

Type:
${tc.type}

Pre-conditions:
${tc.preconditions.map(p => `- ${p}`).join("\n")}

Steps:
${tc.steps.map((s, idx) => `${idx + 1}. ${stripNumber(s)}`).join("\n")}

Expected Result:
${tc.expected.map(e => `- ${e}`).join("\n")}
--------------------
`.trim() + "\n\n";
  });

  navigator.clipboard.writeText(text);
}

/* ============================================================
   EXPORT EXCEL
============================================================ */
function exportExcel() {
  const headers = dynamicColumns.map(c => c.name);
  const data = [headers];

  jsonOutput.forEach((rawTc, tcIndex) => {
    const tc = normalizeTestCase(rawTc);

    data.push(dynamicColumns.map(col =>
      col.name === "TC no." ? generateTCNumber(tcIndex)
      : col.name === "Test case description" ? tc.title
      : col.value
    ));

    tc.steps.forEach((step, i) => {
      data.push(dynamicColumns.map(col =>
        col.name === "Step no." ? i + 1
        : col.name === "Step description" ? stripNumber(step)
        : col.name === "Expected result" ? tc.expected[i] || ""
        : ""
      ));
    });
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(data),
    "TestCases"
  );
  XLSX.writeFile(wb, "AI_Test_Cases.xlsx");
}

/* ============================================================
   EXPOSE GLOBAL FUNCTIONS ✅
============================================================ */
window.generateTC = generateTC;
window.expandAll = expandAll;
window.collapseAll = collapseAll;
window.copyAllToJira = copyAllToJira;
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
