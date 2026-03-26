/* ============================================================
   ✅ GLOBAL STATE
============================================================ */
let pastedImages = [];
let jsonOutput = [];

let dynamicColumns = [
    "Test Case ID",
    "Title",
    "Type",
    "Pre-conditions",
    "Steps",
    "Expected Result"
];

/* ============================================================
   ✅ UTIL
============================================================ */
function extractJson(text) {
    try {
        const start = text.indexOf("[");
        const end = text.lastIndexOf("]") + 1;
        if (start === -1 || end === -1) return null;
        return text.substring(start, end);
    } catch {
        return null;
    }
}

function stripLeadingNumber(text) {
    return text.replace(/^\s*\d+[\.\)]\s*/, "");
}

/* ============================================================
   ✅ COLUMN STRUCTURE (DOM SAFE)
============================================================ */
function renderColumnTable() {
    const tbody = document.getElementById("columnTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    dynamicColumns.forEach((col, i) => {
        const tr = document.createElement("tr");

        const tdIndex = document.createElement("td");
        tdIndex.className = "border p-2 text-center";
        tdIndex.textContent = i + 1;

        const tdName = document.createElement("td");
        tdName.className = "border p-2";

        const input = document.createElement("input");
        input.className = "w-full p-1 border rounded";
        input.value = col;
        input.onchange = () => dynamicColumns[i] = input.value;

        tdName.appendChild(input);

        const tdAction = document.createElement("td");
        tdAction.className = "border p-2 text-center";

        const btn = document.createElement("button");
        btn.textContent = "ลบ";
        btn.className = "px-3 py-1 bg-red-600 text-white rounded";
        btn.onclick = () => removeColumn(i);

        tdAction.appendChild(btn);

        tr.appendChild(tdIndex);
        tr.appendChild(tdName);
        tr.appendChild(tdAction);
        tbody.appendChild(tr);
    });
}

function addColumn() {
    dynamicColumns.push("New Column");
    renderColumnTable();
}

function removeColumn(i) {
    dynamicColumns.splice(i, 1);
    renderColumnTable();
}

/* ============================================================
   ✅ IMAGE HANDLING + PREVIEW
============================================================ */
function renderImages() {
    const box = document.getElementById("imagePreviewContainer");
    if (!box) return;
    box.innerHTML = "";

    pastedImages.forEach((img, i) => {
        const wrapper = document.createElement("div");
        wrapper.className =
            "relative border p-1 rounded shadow bg-white w-32 h-32 flex items-center justify-center overflow-hidden";

        const image = document.createElement("img");
        image.src = img;
        image.className = "max-w-full max-h-full object-contain rounded";

        const btn = document.createElement("button");
        btn.textContent = "✕";
        btn.className =
            "absolute -top-2 -right-2 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full text-xs flex items-center justify-center";
        btn.onclick = () => removeImg(i);

        wrapper.appendChild(image);
        wrapper.appendChild(btn);
        box.appendChild(wrapper);
    });
}

function removeImg(i) {
    pastedImages.splice(i, 1);
    renderImages();
}

function handleUpload(event) {
    for (let f of event.target.files) {
        const reader = new FileReader();
        reader.onload = ev => {
            pastedImages.push(ev.target.result);
            renderImages();
        };
        reader.readAsDataURL(f);
    }
    event.target.value = "";
}

/* ============================================================
   ✅ FLOW MODE
============================================================ */
function getFlowMode() {
    const selected = document.querySelector('input[name="flowMode"]:checked');
    return selected ? selected.value : "multiple";
}

/* ============================================================
   ✅ GENERATE TEST CASES (MIXED MODE – FIXED)
============================================================ */
async function generateTC() {

    // =========================
    // 1️⃣ READ INPUT
    // =========================
    const apiKey = document.getElementById("apiKey").value.trim();
    const baseUrl = document.getElementById("baseUrl").value.trim().replace(/\/$/, "");
    const model = document.getElementById("modelName").value;
    const role = document.getElementById("aiRole").value;
    const req = document.getElementById("requirement").value;
    const stepsInput = document.getElementById("testSteps").value;

    // =========================
    // 2️⃣ VALIDATION (CONFIG)
    // =========================
    if (!apiKey || !baseUrl) {
        alert("Please enter BASE URL and API KEY");
        return; // ❌ ไม่แตะ result เก่า
    }

    // =========================
    // 3️⃣ VALIDATION (CONTENT)
    // =========================
    const hasRequirement = req && req.trim().length > 0;
    const hasImages = pastedImages.length > 0;

    if (!hasRequirement && !hasImages) {
        alert("Please provide at least a Requirement or an Image before generating test cases.");
        return; // ✅ สำคัญมาก: ไม่ clear result
    }

    // =========================
    // 4️⃣ ผ่าน validation แล้ว ค่อยเริ่ม generate
    // =========================
    document.getElementById("loading").classList.remove("hidden");
    document.getElementById("result").innerHTML = "";

    // =========================
    // 5️⃣ FLOW MODE
    // =========================
    const flowMode = getFlowMode();
    let imageParts = [];
    let flowInstruction = "";

    if (flowMode === "single") {
        flowInstruction = `
All images represent steps of ONE user flow.
Generate 10–15 test cases for this flow.
`;
        imageParts = pastedImages.flatMap((img, i) => ([
            { type: "text", text: `Flow Step ${i + 1}` },
            { type: "image_url", image_url: { url: img } }
        ]));
    } else {
        flowInstruction = `
Each image represents a DIFFERENT user flow.

IMPORTANT:
- You MUST return ONE flat JSON ARRAY.
- Do NOT group test cases by flow.
- Do NOT return objects like { "Flow 1": [...] }.
- Generate 5–7 test cases PER IMAGE.
`;
        imageParts = pastedImages.flatMap((img, i) => ([
            { type: "text", text: `Flow ${i + 1}` },
            { type: "image_url", image_url: { url: img } }
        ]));
    }

    // =========================
    // 6️⃣ PROMPT
    // =========================
    const prompt = `
You are ${role}.
Respond ONLY in English.
Output ONLY valid JSON.

IMPORTANT:
- Steps MUST NOT include numbering.

JSON FORMAT:
[
  {
    "Test Case ID": "",
    "Title": "",
    "Type": "",
    "Pre-conditions": [],
    "Steps": [],
    "Expected Result": []
  }
]

Requirement:
${req}

Test Steps:
${stepsInput}

${flowInstruction}
`;

    // =========================
    // 7️⃣ CALL API
    // =========================
    try {
        const res = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: "user", content: [{ type: "text", text: prompt }, ...imageParts] }
                ],
                temperature: 0.15
            })
        });

        const json = await res.json();
        const cleaned = extractJson(json?.choices?.[0]?.message?.content || "");
        if (!cleaned) throw new Error("Invalid JSON");

        jsonOutput = JSON.parse(cleaned);

        // ✅ Guard สำหรับ Multi Flow
        if (!Array.isArray(jsonOutput)) {
            throw new Error("Model did not return a JSON array");
        }

        renderAccordion(jsonOutput);
        document.getElementById("exportSection").classList.remove("hidden");

    } catch (err) {
        console.error(err);
        alert("Error generating test cases");
    } finally {
        document.getElementById("loading").classList.add("hidden");
    }
}

/* ============================================================
   ✅ ACCORDION + CONTROLS
============================================================ */
function renderAccordion(list) {
    const box = document.getElementById("result");
    box.innerHTML = "";

    const bar = document.createElement("div");
    bar.className = "flex gap-3 mb-4";

    const btnExpand = document.createElement("button");
    btnExpand.className = "btn-blue";
    btnExpand.textContent = "Expand All";
    btnExpand.onclick = expandAll;

    const btnCollapse = document.createElement("button");
    btnCollapse.className = "btn-gray";
    btnCollapse.textContent = "Collapse All";
    btnCollapse.onclick = collapseAll;

    const btnCopyAll = document.createElement("button");
    btnCopyAll.className = "btn-copy";
    btnCopyAll.textContent = "📋 Copy All to Jira";
    btnCopyAll.onclick = copyAllToJira;

    bar.appendChild(btnExpand);
    bar.appendChild(btnCollapse);
    bar.appendChild(btnCopyAll);
    box.appendChild(bar);

    list.forEach((tc, i) => {
        const card = document.createElement("div");
        card.className = "border rounded shadow bg-white mb-3";

        const header = document.createElement("button");
        header.className = "w-full text-left p-3 font-bold bg-slate-200 hover:bg-slate-300";
        header.textContent = `🧪 ${tc["Test Case ID"]} — ${tc.Title}`;
        header.onclick = () => toggleAccordion(i);

        const body = document.createElement("div");
        body.id = `acc-${i}`;
        body.className = "p-4 space-y-3 hidden";

        body.innerHTML = `
<b>Type:</b> ${tc.Type}

<b>Pre-conditions:</b>
<ul class="list-disc ml-6">
${tc["Pre-conditions"].map(v => `<li>${v}</li>`).join("")}
</ul>

<b>Steps:</b>
<ol class="list-decimal ml-6">
${tc["Steps"].map(v => `<li>${stripLeadingNumber(v)}</li>`).join("")}
</ol>

<b>Expected Result:</b>
<ul class="list-disc ml-6">
${tc["Expected Result"].map(v => `<li>${stripLeadingNumber(v)}</li>`).join("")}
</ul>
        `;

        const btnCopy = document.createElement("button");
        btnCopy.className = "px-3 py-1 bg-orange-500 hover:bg-orange-600 text-white rounded";
        btnCopy.textContent = "📋 Copy This Test Case";
        btnCopy.onclick = () => copySingleToJira(i);

        body.appendChild(btnCopy);
        card.appendChild(header);
        card.appendChild(body);
        box.appendChild(card);
    });
}

/* ============================================================
   ✅ ACCORDION CONTROLS
============================================================ */
function toggleAccordion(i) {
    const el = document.getElementById(`acc-${i}`);
    if (el) el.classList.toggle("hidden");
}

function expandAll() {
    jsonOutput.forEach((_, i) => {
        const el = document.getElementById(`acc-${i}`);
        if (el) el.classList.remove("hidden");
    });
}

function collapseAll() {
    jsonOutput.forEach((_, i) => {
        const el = document.getElementById(`acc-${i}`);
        if (el) el.classList.add("hidden");
    });
}

/* ============================================================
   ✅ COPY TO JIRA (PLAIN TEXT)
============================================================ */
function copyAllToJira() {
    let out = "";
    jsonOutput.forEach(tc => out += formatTC(tc) + "\n\n");
    navigator.clipboard.writeText(out.trim());
}

function copySingleToJira(i) {
    navigator.clipboard.writeText(formatTC(jsonOutput[i]));
}

function formatTC(tc) {
    const steps = tc["Steps"]
        .map((v, i) => `${i + 1}. ${stripLeadingNumber(v)}`)
        .join("\n");

    const expected = tc["Expected Result"]
        .map(v => "- " + stripLeadingNumber(v))
        .join("\n");

    return `
${tc["Test Case ID"]} — ${tc.Title}

Type: ${tc.Type}

Pre-conditions:
${tc["Pre-conditions"].map(v => "- " + v).join("\n")}

Steps:
${steps}

Expected Result:
${expected}
`.trim();
}

/* ============================================================
   ✅ EXPORT EXCEL
============================================================ */
function exportExcel() {
    const wsData = [
        dynamicColumns,
        ...jsonOutput.map(tc =>
            dynamicColumns.map(col =>
                Array.isArray(tc[col]) ? tc[col].join("\n") : tc[col]
            )
        )
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsData), "TestCases");
    XLSX.writeFile(wb, "TestCases.xlsx");
}

/* ============================================================
   ✅ INIT
============================================================ */
document.addEventListener("DOMContentLoaded", () => {
    renderColumnTable();
});
