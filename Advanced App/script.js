/* =========================================================
   SUBTITLE CORRECTION TOOL
========================================================= */

/*
    Current functionality:

    ✓ Upload SRT
    ✓ Parse SRT
    ✓ Display subtitles
    ✓ Display timestamps
    ✓ Edit individual subtitle
    ✓ Save manual edits
    ✓ Keep original text separately
    ✓ Download edited SRT
    ✓ Preserve subtitle ordering
    ✓ Preserve timestamps
    ✓ Future-ready AI correction structure
    ✓ Future-ready translation structure

    Not implemented yet:

    - AI analysis
    - AI spelling corrections
    - AI punctuation corrections
    - Audio comparison warnings
    - Apply AI corrections
    - Translation
*/


/* =========================================================
   APPLICATION STATE
========================================================= */

let state = {
    file: null,
    fileName: "",
    originalFileName: "",

    subtitles: [],

    currentEditingIndex: null,
    selectedSubtitleIndex: null,

    aiAnalysisRunning: false,
    aiCorrectionCount: 0,

    translationLanguage: null
};

let activeShortcutType = "spelling";


/* =========================================================
   DOM ELEMENTS
========================================================= */

const fileInput = document.getElementById("fileInput");

const uploadBtn = document.getElementById("uploadBtn");
const analyzeBtn = document.getElementById("analyzeButton");
const downloadBtn = document.getElementById("downloadBtn");
const translateBtn = document.getElementById("translateBtn");

const emptyState = document.getElementById("emptyState");
const subtitleApp = document.getElementById("subtitleApp");

const fileNameElement = document.getElementById("fileName");
const subtitleStats = document.getElementById("subtitleStats");
const subtitleList = document.getElementById("subtitleList");


/* Modal */

const editModal = document.getElementById("editModal");

const closeModalBtn = document.getElementById("closeModalBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const saveEditBtn = document.getElementById("saveEditBtn");

const editTextarea = document.getElementById("editTextarea");

const modalSubtitleNumber =
    document.getElementById("modalSubtitleNumber");

const modalTimestamp =
    document.getElementById("modalTimestamp");


/* Loading */

const loadingOverlay =
    document.getElementById("loadingOverlay");

const loadingTitle =
    document.getElementById("loadingTitle");

const loadingText =
    document.getElementById("loadingText");

const progressBar =
    document.getElementById("progressBar");


/* =========================================================
   UPLOAD
========================================================= */

uploadBtn.addEventListener("click", () => {

    fileInput.click();

});


fileInput.addEventListener("change", async (event) => {

    const file = event.target.files[0];

    if (!file) {
        return;
    }

    await loadSrtFile(file);

    /*
        Reset file input.

        This allows the user to upload the same file again
        after making changes.
    */

    fileInput.value = "";

});


/* =========================================================
   LOAD SRT FILE
========================================================= */

async function loadSrtFile(file) {

    if (!file.name.toLowerCase().endsWith(".srt")) {

        alert("Please select an SRT file.");

        return;
    }


    try {

        const text = await file.text();

        const subtitles = parseSRT(text);


        if (subtitles.length === 0) {

            alert(
                "No valid subtitles were found in this SRT file."
            );

            return;
        }


        state.file = file;

        state.fileName = file.name;

        state.subtitles = subtitles;

        state.currentEditingIndex = null;


        renderApplication();
        translateBtn.disabled = false;

    } catch (error) {

        console.error(error);

        alert(
            "There was a problem reading the SRT file."
        );

    }

}


/* =========================================================
   SRT PARSER
========================================================= */

function parseSRT(content) {

    /*
        Normalize line endings.

        SRT files can use:
        \r\n
        \r
        \n
    */

    const normalized = content
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/^\uFEFF/, "");


    /*
        Subtitle entries are separated by blank lines.
    */

    const blocks = normalized
        .split(/\n\s*\n/)
        .map(block => block.trim())
        .filter(Boolean);


    const subtitles = [];


    blocks.forEach((block, index) => {

        const lines = block.split("\n");

        if (lines.length < 2) {
            return;
        }


        let number;
        let timestampLine;
        let textStartIndex;


        /*
            Standard SRT:

            1
            00:00:00,000 --> 00:00:02,000
            Hello
        */


        if (
            /^\d+$/.test(lines[0].trim()) &&
            lines[1].includes("-->")
        ) {

            number = parseInt(lines[0].trim(), 10);

            timestampLine = lines[1].trim();

            textStartIndex = 2;

        }

        /*
            Some SRT files don't have a valid numeric index.
        */

        else if (lines[0].includes("-->")) {

            number = index + 1;

            timestampLine = lines[0].trim();

            textStartIndex = 1;

        }

        else {

            return;
        }


        /*
            Subtitle text can contain multiple lines.

            We preserve those line breaks.
        */

        const text = lines
            .slice(textStartIndex)
            .join("\n")
            .trim();


        subtitles.push({

            number,

            timestamp: timestampLine,

            originalText: text,

            /*
                Manual editing.
                null means no manual edit has been made.
            */

            editedText: null,

            /*
                Reserved for future AI functionality.
            */

            aiCorrection: null,

            /*
                Reserved for future AI functionality.

                Example:

                [
                    {
                        type: "spelling",
                        original: "ражбането",
                        corrected: "раждането"
                    }
                ]
            */

            aiIssues: []

        });

    });


    return subtitles;

}


/* =========================================================
   RENDER APPLICATION
========================================================= */

function renderApplication() {

    emptyState.classList.add("hidden");

    subtitleApp.classList.remove("hidden");


    fileNameElement.textContent = state.fileName;


    subtitleStats.textContent =
        `${state.subtitles.length} subtitle` +
        (state.subtitles.length === 1 ? "" : "s");


    /*
        Download becomes available once a file exists.
    */

    downloadBtn.disabled = false;

    downloadBtn.classList.remove("disabled");


    renderSubtitles();

}


/* =========================================================
   RENDER SUBTITLES
========================================================= */

function renderSubtitles() {

    subtitleList.innerHTML = "";


    state.subtitles.forEach((subtitle, index) => {

        const block =
            createSubtitleElement(subtitle, index);

        subtitleList.appendChild(block);

    });

}


/* =========================================================
   CREATE SUBTITLE ELEMENT
========================================================= */

function createSubtitleElement(subtitle, index) {

    const block = document.createElement("article");
    block.className = "subtitle-block";

    block.tabIndex = 0;

    block.addEventListener("click", () => {
        selectSubtitle(index);
    });

    if (state.selectedSubtitleIndex === index) {
        block.classList.add("selected-subtitle");
    }

    /* =====================================================
       META
    ===================================================== */

    const meta = document.createElement("div");
    meta.className = "subtitle-meta";

    const number = document.createElement("span");
    number.className = "subtitle-number";
    number.textContent = subtitle.number;

    const timestamp = document.createElement("span");
    timestamp.className = "timestamp";
    timestamp.textContent = subtitle.timestamp;

    meta.appendChild(number);
    meta.appendChild(timestamp);


    /* =====================================================
       CONTENT
    ===================================================== */

    const content = document.createElement("div");
    content.className = "subtitle-content";

    const originalLine = document.createElement("div");
    originalLine.className = "original-line";


    /* =====================================================
       DISPLAYED TEXT
    ===================================================== */

    const textContainer = document.createElement("div");
    textContainer.className = "subtitle-text-container";

    const displayedText = document.createElement("p");
    displayedText.className = "original-text";

    displayedText.textContent =
        subtitle.editedText !== null
            ? subtitle.editedText
            : subtitle.originalText;

    textContainer.appendChild(displayedText);


    /* =====================================================
       BUTTONS
    ===================================================== */

    const actions = document.createElement("div");
    actions.className = "subtitle-actions";


    /* EDIT BUTTON */

    const editButton = document.createElement("button");

    editButton.className = "edit-btn";
    editButton.type = "button";
    editButton.title = "Edit subtitle";
    editButton.setAttribute(
        "aria-label",
        "Edit subtitle"
    );

    editButton.textContent = "✏️";

    editButton.addEventListener("click", () => {
        openEditModal(index);
    });


    /* APPLY AI BUTTON */

    const applyButton = document.createElement("button");

    applyButton.className = "apply-btn";
    applyButton.type = "button";

    applyButton.title =
        subtitle.aiCorrection
            ? "Apply AI correction"
            : "No AI correction available";

    applyButton.setAttribute(
        "aria-label",
        "Apply AI correction"
    );

    applyButton.textContent = "✅";


    if (!subtitle.aiCorrection) {

        applyButton.disabled = true;

    } else {

        applyButton.disabled = false;

        applyButton.addEventListener(
            "click",
            () => applyAICorrection(index)
        );
    }


    actions.appendChild(editButton);
    actions.appendChild(applyButton);


    /* DISCARD AI CORRECTION BUTTON */

    const discardButton =
        document.createElement("button");

    discardButton.className =
        "discard-btn";

    discardButton.type =
        "button";

    discardButton.title =
        subtitle.aiCorrection
            ? "Discard AI correction"
            : "No AI correction to discard";

    discardButton.setAttribute(
        "aria-label",
        "Discard AI correction"
    );

    discardButton.textContent = "❌";


    if (!subtitle.aiCorrection) {

        discardButton.disabled = true;

    } else {

        discardButton.disabled = false;

        discardButton.addEventListener(
            "click",
            () => discardAICorrection(index)
        );
    }


    actions.appendChild(
        discardButton
    );

    originalLine.appendChild(textContainer);
    originalLine.appendChild(actions);

    content.appendChild(originalLine);


    /* =====================================================
       AI CORRECTED VERSION
    ===================================================== */

    if (subtitle.aiCorrection) {

        const correctedContainer =
            document.createElement("div");

        const correctionType =
        getCorrectionType(subtitle);

        correctedContainer.className =
            "corrected-container";

        if (correctionType) {

            correctedContainer.classList.add(
                `corrected-${correctionType}`
            );
        }


        const correctedLabel =
            document.createElement("div");

        correctedLabel.className =
            "corrected-label";

        correctedLabel.textContent =
            "Corrected version";


        const correctedText =
            document.createElement("p");

        correctedText.className =
            "corrected-text";


        /*
            AI correction is stored as a STRING.

            The highlighting function converts the
            correction into HTML with the appropriate
            red / yellow / blue highlights.
        */

        if (
            subtitle.aiIssues &&
            subtitle.aiIssues.length > 0
        ) {

            correctedText.innerHTML =
                createHighlightedCorrection(
                    subtitle,
                    subtitle.aiCorrection
                );

        } else {

            correctedText.textContent =
                subtitle.aiCorrection;
        }


        correctedContainer.appendChild(
            correctedLabel
        );

        correctedContainer.appendChild(
            correctedText
        );

        content.appendChild(
            correctedContainer
        );
    }


    block.appendChild(meta);
    block.appendChild(content);

    return block;
}

function discardAICorrection(index) {

    const subtitle =
        state.subtitles[index];

    if (!subtitle) {
        return;
    }


    /*
     * Remove only the pending AI correction.
     *
     * originalText remains untouched.
     * editedText remains untouched.
     */

    subtitle.aiCorrection = null;
    subtitle.aiIssues = [];


    /*
     * Re-render the subtitle.
     */

    renderSubtitles();


    /*
     * Update counters and scrollbar shortcuts.
     */

    updateCorrectionCount();
    updateAIShortcuts();
}

function createHighlightedCorrection(subtitle, correctedText) {

    const originalText =
        subtitle.editedText !== null
            ? subtitle.editedText
            : subtitle.originalText;

    const issues =
        subtitle.aiIssues || [];

    const diff =
        calculateTextDiff(
            originalText,
            correctedText
        );

    let html = "";

    diff.forEach(part => {

        const text =
            escapeHtml(part.text);

        if (part.type === "same") {

            html += text;
            return;
        }

        const issueType =
            findIssueType(
                part.text,
                issues,
                part
            );

        let className =
            "ai-spelling";

        if (issueType === "punctuation") {
            className = "ai-punctuation";
        }

        if (issueType === "audio") {
            className = "ai-audio-check";
        }

        /*
         * Changed/inserted characters.
         */
        if (part.type === "changed") {

            html +=
                `<span class="${className}">${text}</span>`;

            return;
        }

        /*
         * Deleted characters cannot physically exist
         * in the corrected text, so show the deleted
         * character as a small struck-through marker.
         */
        if (part.type === "deleted") {

            html +=
                `<span class="${className} ai-deleted" title="Removed from original">${text}</span>`;
        }
    });

    return html;
}
function calculateTextDiff(original, corrected) {

    const a = Array.from(original);
    const b = Array.from(corrected);

    const rows = a.length + 1;
    const cols = b.length + 1;

    const matrix = Array.from(
        { length: rows },
        () => Array(cols).fill(0)
    );


    /*
     * Longest Common Subsequence.
     */
    for (let i = 1; i < rows; i++) {

        for (let j = 1; j < cols; j++) {

            if (a[i - 1] === b[j - 1]) {

                matrix[i][j] =
                    matrix[i - 1][j - 1] + 1;

            } else {

                matrix[i][j] =
                    Math.max(
                        matrix[i - 1][j],
                        matrix[i][j - 1]
                    );
            }
        }
    }


    const result = [];

    let i = a.length;
    let j = b.length;


    while (i > 0 || j > 0) {

        /*
         * Same character.
         */
        if (
            i > 0 &&
            j > 0 &&
            a[i - 1] === b[j - 1]
        ) {

            result.unshift({
                type: "same",
                text: b[j - 1]
            });

            i--;
            j--;

            continue;
        }


        /*
         * Character exists in corrected text.
         */
        if (
            j > 0 &&
            (
                i === 0 ||
                matrix[i][j - 1] >
                matrix[i - 1][j]
            )
        ) {

            result.unshift({
                type: "changed",
                text: b[j - 1]
            });

            j--;

            continue;
        }


        /*
         * Character was removed from original text.
         *
         * IMPORTANT:
         * We preserve it in the HTML as a deleted marker
         * so the user can see exactly what disappeared.
         */
        if (i > 0) {

            result.unshift({
                type: "deleted",
                text: a[i - 1]
            });

            i--;
        }
    }


    /*
     * Combine adjacent identical sections.
     */
    const combined = [];

    result.forEach(part => {

        const last =
            combined[combined.length - 1];

        if (
            last &&
            last.type === part.type
        ) {

            last.text += part.text;

        } else {

            combined.push({
                type: part.type,
                text: part.text
            });
        }
    });


    return combined;
}
function findIssueType(text, issues, part) {

    /*
     * First use the issue information returned by AI.
     */
    for (const issue of issues) {

        const corrected =
            issue.corrected || "";

        const original =
            issue.original || "";


        if (
            corrected &&
            corrected.includes(text)
        ) {

            return issue.type;
        }


        if (
            original &&
            original.includes(text)
        ) {

            return issue.type;
        }
    }


    /*
     * Automatically identify punctuation.
     */
    if (
        /^[\s.,!?;:"'„“”‘’()\-–—…]+$/.test(text)
    ) {

        return "punctuation";
    }


    return "spelling";
}
function getCorrectionType(subtitle) {

    const issues =
        subtitle.aiIssues || [];

    if (
        issues.some(
            issue => issue.type === "spelling"
        )
    ) {
        return "spelling";
    }

    if (
        issues.some(
            issue => issue.type === "punctuation"
        )
    ) {
        return "punctuation";
    }

    if (
        issues.some(
            issue => issue.type === "audio"
        )
    ) {
        return "audio";
    }

    return null;
}

function updateAIShortcuts() {

    const types = [
        "spelling",
        "punctuation",
        "audio"
    ];


    types.forEach(type => {

        const button =
            document.querySelector(
                `.ai-shortcut[data-type="${type}"]`
            );

        if (!button) {
            return;
        }


        const matchingIndexes = [];


        state.subtitles.forEach(
            (subtitle, index) => {

                const issues =
                    subtitle.aiIssues || [];


                if (
                    issues.some(
                        issue =>
                            issue.type === type
                    )
                ) {

                    matchingIndexes.push(index);
                }
            }
        );


        button.disabled =
            matchingIndexes.length === 0;


        /*
            Clicking the shortcut cycles through
            all corrections of that type.
        */

        button.onclick = () => {

            if (!matchingIndexes.length) {
                return;
            }


            let currentPosition =
                Number(
                    button.dataset.position || 0
                );


            const subtitleIndex =
                matchingIndexes[
                    currentPosition %
                    matchingIndexes.length
                ];


            const blocks =
                document.querySelectorAll(
                    ".subtitle-block"
                );


            const block =
                blocks[subtitleIndex];


            if (block) {

                block.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });


                block.classList.add(
                    "ai-shortcut-target"
                );


                setTimeout(() => {

                    block.classList.remove(
                        "ai-shortcut-target"
                    );

                }, 1200);
            }


            button.dataset.position =
                (
                    currentPosition + 1
                ) %
                matchingIndexes.length;
        };
    });
}


function escapeHtml(text) {

    const div = document.createElement("div");
    div.textContent = text;

    return div.innerHTML;
}


function escapeRegExp(text) {

    return text.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
}

function updateCorrectionCount() {

    const counter =
        document.getElementById("correctionCount");

    if (!counter) {
        return;
    }

    const count = state.subtitles.filter(
        subtitle =>
            subtitle.aiCorrection !== null
    ).length;

    counter.textContent =
        `Corrections: ${count}`;
}


/* =========================================================
   EDIT MODAL
========================================================= */

function openEditModal(index) {

    const subtitle = state.subtitles[index];

    if (!subtitle) {
        return;
    }


    state.currentEditingIndex = index;


    modalSubtitleNumber.textContent =
        `Subtitle ${subtitle.number}`;


    modalTimestamp.textContent =
        subtitle.timestamp;


    /*
        If the subtitle has already been manually edited,
        show the edited version.

        Otherwise show the original.
    */

    editTextarea.value =
        subtitle.editedText !== null
            ? subtitle.editedText
            : subtitle.originalText;


    editModal.classList.remove("hidden");


    /*
        Automatically focus the text field.
    */

    setTimeout(() => {

        editTextarea.focus();

        editTextarea.select();

    }, 50);

}




/* =========================================================
   CLOSE MODAL
========================================================= */

function closeEditModal() {

    editModal.classList.add("hidden");

    state.currentEditingIndex = null;

}


closeModalBtn.addEventListener(
    "click",
    closeEditModal
);


cancelEditBtn.addEventListener(
    "click",
    closeEditModal
);


/*
    Clicking outside the modal closes it.
*/

editModal.addEventListener("click", (event) => {

    if (event.target === editModal) {

        closeEditModal();

    }

});


/*
    Escape closes modal.
*/

document.addEventListener("keydown", (event) => {

    if (
        event.key === "Escape" &&
        !editModal.classList.contains("hidden")
    ) {

        closeEditModal();

    }

});


/* =========================================================
   SAVE MANUAL EDIT
========================================================= */

// saveEditBtn.addEventListener("click", () => {

//     const index = state.currentEditingIndex;

//     if (index === null) {
//         return;
//     }

//     const newText = editTextarea.value;

//     /*
//         Store the manual edit separately.
//         originalText is NEVER modified.
//     */

//     state.subtitles[index].editedText = newText;

//     closeEditModal();

//     /*
//         Re-render the subtitle list.
//         The updated createSubtitleElement()
//         will now display editedText.
//     */

//     renderSubtitles();

// });

saveEditBtn.addEventListener("click", saveCurrentEdit);

/* =========================================================
   GET CURRENT SUBTITLE TEXT
========================================================= */

function getCurrentSubtitleText(subtitle) {

    /*
        Priority:

        1. Manual edit
        2. AI correction after Apply
        3. Original

        AI correction will eventually be stored separately
        as well.
    */

    if (subtitle.editedText !== null) {

        return subtitle.editedText;

    }


    return subtitle.originalText;

}


/* =========================================================
   APPLY AI CORRECTION
========================================================= */

/*
    Placeholder for future AI functionality.

    When AI is implemented, aiCorrection could look like:

    {
        text: "за раждането",
        highlightedHTML:
            "за раж<span class='ai-spelling'>д</span>ането"
    }

*/

function applyAICorrection(index) {
    const subtitle = state.subtitles[index];

    if (!subtitle.aiCorrection) return;

    subtitle.editedText = subtitle.aiCorrection;
    subtitle.aiCorrection = null;
    subtitle.aiIssues = [];

    renderSubtitles();
    updateCorrectionCount();
    updateAIShortcuts();

    selectSubtitle(index);
}


/* =========================================================
   AI ANALYSIS
========================================================= */

/*
    AI is intentionally NOT implemented.

    This button is kept in the UI because the application
    will later connect to an AI backend/API.

    Future flow:

        Analyze with AI
              ↓
        Send subtitle text
              ↓
        AI identifies mistakes
              ↓
        Store aiIssues
              ↓
        Store aiCorrection
              ↓
        Render highlights
              ↓
        Enable Apply button
*/


// analyzeBtn.addEventListener("click", () => {

//     /*
//         Intentionally disabled.

//         Future implementation goes here.
//     */

// });
analyzeBtn.addEventListener("click", analyzeWithAI);

async function analyzeWithAI() {

    if (!state.subtitles.length) {
        alert("Please upload an SRT file first.");
        return;
    }

    if (state.aiAnalysisRunning) {
        return;
    }

    state.aiAnalysisRunning = true;

    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "Analyzing...";

    showLoading("Analyzing subtitles with AI...");

    try {

        const corrections = await analyzeSubtitlesWithAI(
            state.subtitles
        );

        let newCorrections = 0;

        corrections.forEach(correction => {

            const index = state.subtitles.findIndex(
                subtitle => subtitle.number === correction.line
            );

            if (index === -1) {
                return;
            }

            const subtitle = state.subtitles[index];

            const currentText =
                subtitle.editedText !== null
                    ? subtitle.editedText
                    : subtitle.originalText;

            // Do not create a correction if the AI returned
            // exactly the same text.
            if (
                correction.correctedText === currentText &&
                (!correction.issues ||
                    correction.issues.length === 0)
            ) {
                return;
            }

            subtitle.aiCorrection = correction.correctedText;
            subtitle.aiIssues = correction.issues || [];

            newCorrections++;
        });

        state.aiCorrectionCount += newCorrections;

        renderSubtitles();
        updateCorrectionCount();

        if (newCorrections === 0) {
            alert("AI did not find any new corrections.");
        }

    } catch (error) {

        console.error(error);

        alert(
            "AI analysis failed:\n\n" +
            error.message
        );

    } finally {

        hideLoading();

        state.aiAnalysisRunning = false;

        analyzeBtn.disabled = false;
        analyzeBtn.textContent = "Analyze with AI";
    }
    renderSubtitles();
    updateCorrectionCount();
    updateAIShortcuts();
}


/* =========================================================
   DOWNLOAD
========================================================= */

downloadBtn.addEventListener("click", () => {

    if (!state.subtitles.length) {
        return;
    }


    downloadSRT();

});


function downloadSRT() {

  if (!state.subtitles.length) {
        alert("No subtitles available.");
        return;
    }

    /*
        Build the SRT from the current subtitle state.

        This preserves:
        - subtitle numbers
        - timestamps
        - current edited/translated text
    */
    const srtContent =
        createSRTFromSubtitles(
            state.subtitles,
            true
        );

    /*
        Create the filename.
    */

    const baseName =
        (
            state.originalFileName ||
            state.fileName ||
            "subtitles.srt"
        ).replace(
            /\.srt$/i,
            ""
        );

    let fileName;

    if (state.translationLanguage) {

        /*
            Translated file:

            Example:
            Раждане 30 Възстановяване_Edited_Russian.srt
        */

        fileName =
            `${baseName}_Edited_${state.translationLanguage}.srt`;

    } else {

        /*
            Normal original file:

            Example:
            Раждане 30 Възстановяване_Edited.srt
        */

        fileName =
            `${baseName}_Edited.srt`;
    }

    const blob =
        new Blob(
            [srtContent],
            {
                type:
                    "text/plain;charset=utf-8"
            }
        );

    const url =
        URL.createObjectURL(blob);

    const link =
        document.createElement("a");

    link.href = url;
    link.download = fileName;

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);

    // /*
    //     Build SRT content.

    //     We preserve:

    //     - subtitle numbering
    //     - timestamps
    //     - subtitle order
    //     - multiple lines
    // */

    // const srtContent = state.subtitles
    //     .map(subtitle => {

    //         const text =
    //             getCurrentSubtitleText(subtitle);


    //         return [
    //             subtitle.number,
    //             subtitle.timestamp,
    //             text
    //         ].join("\n");

    //     })
    //     .join("\n\n");


    // /*
    //     Create filename.

    //     Example:

    //     Раждане 24 Процедури на бебето.srt

    //     becomes:

    //     Раждане 24 Процедури на бебето_Edited.srt
    // */

    // const originalName =
    //     state.fileName;


    // let baseName = originalName;


    // if (
    //     baseName
    //         .toLowerCase()
    //         .endsWith(".srt")
    // ) {

    //     baseName =
    //         baseName.slice(0, -4);

    // }


    // const downloadName =
    //     `${baseName}_Edited.srt`;


    // /*
    //     UTF-8 Blob.

    //     Bulgarian, Russian and English are therefore
    //     preserved correctly.
    // */

    // const blob = new Blob(
    //     [srtContent],
    //     {
    //         type: "text/plain;charset=utf-8"
    //     }
    // );


    // const url =
    //     URL.createObjectURL(blob);


    // const link =
    //     document.createElement("a");


    // link.href = url;

    // link.download = downloadName;

    // document.body.appendChild(link);

    // link.click();

    // link.remove();


    // /*
    //     Clean up object URL.
    // */

    // setTimeout(() => {

    //     URL.revokeObjectURL(url);

    // }, 1000);

}


/* =========================================================
   TRANSLATION
========================================================= */

/*
    Translation is intentionally NOT implemented.

    The future requested behavior is:

        Translate
             ↓
        Loading
             ↓
        Open English browser window
             ↓
        Open Russian browser window
             ↓
        Each window loads the translated SRT
             ↓
        Download:
            filename_English.srt

        and:

            filename_Russian.srt
*/


translateBtn.addEventListener("click", () => {

    /*
        Intentionally disabled until translation is added.
    */

});


/* =========================================================
   FUTURE TRANSLATION WINDOW
========================================================= */

/*
    This function is NOT currently called.

    It demonstrates the intended architecture for later.

    A future version can create:

        window.open(
            "english.html",
            "_blank"
        );

    and:

        window.open(
            "russian.html",
            "_blank"
        );

    The translated SRT could then be passed to those windows
    through localStorage, IndexedDB, URL state, or a backend.
*/

function openTranslationWindows() {

    // Future implementation.

}


/* =========================================================
   FUTURE LOADING BAR
========================================================= */

function showLoading(title, message) {

    loadingTitle.textContent = title;

    loadingText.textContent = message;

    progressBar.style.width = "0%";

    loadingOverlay.classList.remove("hidden");

}


function updateLoadingProgress(percent) {

    progressBar.style.width =
        `${Math.max(0, Math.min(100, percent))}%`;

}


function hideLoading() {

    loadingOverlay.classList.add("hidden");

}


/* =========================================================
   FUTURE AI HIGHLIGHT HELPER
========================================================= */

/*
    This function will eventually be useful when AI returns
    individual corrections.

    Example issue:

        {
            type: "spelling",
            original: "ражбането",
            corrected: "раждането"
        }

    Colors:

        spelling       → red
        punctuation    → yellow
        audio-check    → blue
*/

function getIssueClass(type) {

    switch (type) {

        case "spelling":
            return "ai-spelling";

        case "punctuation":
            return "ai-punctuation";

        case "audio":
            return "ai-audio-check";

        default:
            return "";

    }

}


/* =========================================================
   INITIAL STATE
========================================================= */

/*
    Nothing is displayed except the navigation bar when
    the page initially loads.
*/

function saveCurrentEdit() {

    const index = state.currentEditingIndex;

    if (index === null) {
        return;
    }

    const subtitle = state.subtitles[index];

    if (!subtitle) {
        return;
    }

    const newText = editTextarea.value.trim();

    /*
        Don't save an empty subtitle.
    */
    if (!newText) {
        return;
    }

    /*
        Keep the originalText untouched.
        Only update editedText.
    */
    subtitle.editedText = newText;

    /*
        Close editing.
    */
    editModal.classList.add("hidden");

    state.currentEditingIndex = null;

    /*
        Re-render the subtitle.
    */
    renderSubtitles();

    updateCorrectionCount();
    updateAIShortcuts();

    /*
        Keep the edited subtitle selected.
    */
    selectSubtitle(index);
}

document.addEventListener("keydown", handleKeyboardShortcuts);

function handleKeyboardShortcuts(event) {
    const activeElement = document.activeElement;

        if (
        state.currentEditingIndex !== null &&
        !editModal.classList.contains("hidden") &&
        event.key === "Enter"
    ) {
        event.preventDefault();
        saveCurrentEdit();
        return;
    }

    // Do not trigger navigation/action shortcuts while typing.
    if (
        activeElement &&
        (
            activeElement.tagName === "INPUT" ||
            activeElement.tagName === "TEXTAREA" ||
            activeElement.isContentEditable
        )
    ) {
        return;
    }

    if (!state.subtitles.length) return;

    switch (event.key) {
        case "ArrowDown":
            event.preventDefault();
            selectSubtitle(
                state.selectedSubtitleIndex === null
                    ? 0
                    : state.selectedSubtitleIndex + 1
            );
            break;

        case "ArrowUp":
            event.preventDefault();
            selectSubtitle(
                state.selectedSubtitleIndex === null
                    ? state.subtitles.length - 1
                    : state.selectedSubtitleIndex - 1
            );
            break;

        case " ":
            event.preventDefault();
            activateSelectedShortcut();
            break;

        case "e":
        case "E":
        case "Е":
        case "е":
            event.preventDefault();
            editSelectedSubtitle();
            break;

        case "a":
        case "A":
        case "А":
        case "а":
            event.preventDefault();
            applySelectedCorrection();
            break;

        case "d":
        case "D":
        case "Д":
        case "д":
            event.preventDefault();
            discardSelectedCorrection();
            break;
    }
}

function selectSubtitle(index) {
    if (!state.subtitles.length) return;

    index = Math.max(
        0,
        Math.min(index, state.subtitles.length - 1)
    );

    state.selectedSubtitleIndex = index;

    const blocks = document.querySelectorAll(
        ".subtitle-block"
    );

    blocks.forEach(block => {
        block.classList.remove("selected-subtitle");
    });

    const selectedBlock = blocks[index];

    if (selectedBlock) {
        selectedBlock.classList.add(
            "selected-subtitle"
        );

        selectedBlock.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
    }
}

function editSelectedSubtitle() {
    const index = state.selectedSubtitleIndex;

    if (index === null) return;

    openEditModal(index);
}

function applySelectedCorrection() {
    const index = state.selectedSubtitleIndex;

    if (index === null) return;

    const subtitle = state.subtitles[index];

    if (!subtitle.aiCorrection) return;

    applyAICorrection(index);
}

function discardSelectedCorrection() {
    const index = state.selectedSubtitleIndex;

    if (index === null) return;

    const subtitle = state.subtitles[index];

    if (!subtitle.aiCorrection) return;

    discardAICorrection(index);
}

function activateSelectedShortcut() {
    const types = [
        "spelling",
        "punctuation",
        "audio"
    ];

    const availableTypes = types.filter(type => {
        return state.subtitles.some(subtitle =>
            (subtitle.aiIssues || []).some(
                issue => issue.type === type
            )
        );
    });

    if (!availableTypes.length) return;

    let currentIndex =
        availableTypes.indexOf(activeShortcutType);

    if (currentIndex === -1) {
        currentIndex = 0;
    }

    const type =
        availableTypes[currentIndex];

    activeShortcutType = type;

    activateShortcutType(type);
}

function activateShortcutType(type) {
    const matchingIndexes = [];

    state.subtitles.forEach((subtitle, index) => {
        const issues = subtitle.aiIssues || [];

        if (
            issues.some(
                issue => issue.type === type
            )
        ) {
            matchingIndexes.push(index);
        }
    });

    if (!matchingIndexes.length) return;

    const currentIndex =
        state.selectedSubtitleIndex === null
            ? -1
            : matchingIndexes.indexOf(
                state.selectedSubtitleIndex
            );

    const nextIndex =
        matchingIndexes[
            (currentIndex + 1) %
            matchingIndexes.length
        ];

    selectSubtitle(nextIndex);
}

emptyState.classList.remove("hidden");

subtitleApp.classList.add("hidden");

downloadBtn.disabled = true;

analyzeBtn.disabled = false;

translateBtn.disabled = true;