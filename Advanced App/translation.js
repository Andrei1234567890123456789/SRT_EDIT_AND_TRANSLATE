/*
    translation.js

    Handles:
    - Opening English/Russian translation tabs
    - Loading translation jobs
    - Chunking + context
    - Adaptive retry/splitting
    - Translation validation
    - Reconstructing the SRT
*/


const TRANSLATION_CHUNK_SIZE = 80;
const TRANSLATION_CONTEXT_SIZE = 10;
const TRANSLATION_MAX_RETRIES = 3;


/* =========================================================
   TRANSLATION TAB DETECTION
   ========================================================= */

function getTranslationTarget() {

    const params = new URLSearchParams(
        window.location.search
    );

    return params.get("translate");
}


function isTranslationTab() {
    return Boolean(getTranslationTarget());
}


/* =========================================================
   TRANSLATE BUTTON
   ========================================================= */

function initializeTranslationFeature() {

    const translateBtn =
        document.getElementById("translateBtn");

    if (!translateBtn) {
        return;
    }

    translateBtn.addEventListener(
        "click",
        openTranslationTabs
    );

    /*
        If this is a newly opened translation tab,
        automatically start translating.
    */

    const target = getTranslationTarget();

    if (target === "English" || target === "Russian") {

        window.addEventListener(
            "DOMContentLoaded",
            () => {
                startTranslationTab(target);
            }
        );
    }
}


function openTranslationTabs() {

    if (
        typeof state === "undefined" ||
        !state.subtitles ||
        !state.subtitles.length
    ) {
        alert("Please upload an SRT file first.");
        return;
    }

    /*
        Store the complete original SRT data.

        The new tabs will retrieve this data and parse it
        themselves, so the original tab's state remains untouched.
    */

    const sourceSrt =
        createSRTFromSubtitles(
            state.subtitles,
            false
        );

    const jobId =
        `translation_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2)}`;

    const job = {
        id: jobId,
        fileName: state.fileName,
        sourceSrt: sourceSrt
    };

    localStorage.setItem(
        `srt_translation_${jobId}`,
        JSON.stringify(job)
    );

    /*
        Open both tabs immediately as a result of the
        user's click. This avoids popup blockers.
    */

    window.open(
        `index.html?translate=English&job=${encodeURIComponent(jobId)}`,
        "_blank"
    );

    window.open(
        `index.html?translate=Russian&job=${encodeURIComponent(jobId)}`,
        "_blank"
    );
}


/* =========================================================
   TRANSLATION TAB
   ========================================================= */

async function startTranslationTab(language) {

    const params =
        new URLSearchParams(
            window.location.search
        );

    const jobId =
        params.get("job");

    if (!jobId) {
        showTranslationError(
            "Translation job ID is missing."
        );
        return;
    }

    const rawJob =
        localStorage.getItem(
            `srt_translation_${jobId}`
        );

    if (!rawJob) {
        showTranslationError(
            "Translation job could not be found."
        );
        return;
    }

    let job;

    try {
        job = JSON.parse(rawJob);
    } catch (error) {
        showTranslationError(
            "Translation job data is invalid."
        );
        return;
    }

    /*
        Change the document title so the two tabs are easy
        to identify.
    */

    document.title =
        `ASS - ${language}`;

    /*
        Show translation progress before doing anything expensive.
    */

    showTranslationProgress(language);

    try {

        const subtitles =
            parseSRT(job.sourceSrt);

        if (!subtitles.length) {
            throw new Error(
                "The original SRT contains no subtitles."
            );
        }

        updateTranslationProgress(
            5,
            "Preparing subtitles..."
        );

        const translatedSubtitles =
            await translateSubtitles(
                subtitles,
                language
            );

        updateTranslationProgress(
            95,
            "Loading translated subtitles..."
        );

        /*
            Replace the normal application state with the
            translated subtitles.
        */

        state.file = null;

        state.originalFileName =
            job.fileName;

        state.fileName =
            job.fileName;

        state.translationLanguage =
            language;

        state.subtitles =
            translatedSubtitles;

        state.currentEditingIndex = null;
        state.selectedSubtitleIndex = null;
        state.aiAnalysisRunning = false;
        state.aiCorrectionCount = 0;


        /*
            Render the translated subtitles using the
            existing subtitle renderer.
        */
        // renderSubtitles();
        renderApplication();

        updateCorrectionCount();
        updateAIShortcuts();

        hideTranslationProgress();

        updateTranslationUI(language);

        /*
            The temporary job can now be removed only after
            the translated tab has successfully loaded its data.
        */

    } catch (error) {

        console.error(
            "Translation error:",
            error
        );

        showTranslationError(
            error.message
        );
    }
}


/* =========================================================
   TRANSLATION ENGINE
   ========================================================= */

async function translateSubtitles(
    subtitles,
    language
) {

    const translations = {};

    /*
        Primary chunks.

        Each chunk contains up to 80 subtitles.
    */

    const chunks =
        createTranslationChunks(
            subtitles,
            TRANSLATION_CHUNK_SIZE
        );

    for (
        let chunkIndex = 0;
        chunkIndex < chunks.length;
        chunkIndex++
    ) {

        const chunk =
            chunks[chunkIndex];

        const progress =
            10 +
            Math.round(
                (chunkIndex / chunks.length) * 80
            );

        updateTranslationProgress(
            progress,
            `Translating subtitles ${chunk[0].number}–${chunk[chunk.length - 1].number}...`
        );

        const result =
            await translateChunkAdaptive(
                subtitles,
                chunk,
                language
            );

        Object.assign(
            translations,
            result
        );
    }

    /*
        Final validation before reconstruction.
    */

    validateCompleteTranslation(
        subtitles,
        translations
    );

    /*
        Reconstruct using ORIGINAL metadata.
    */

    return subtitles.map(subtitle => {

        const translatedText =
            translations[subtitle.number];

        return {
            number: subtitle.number,
            timestamp: subtitle.timestamp,
            originalText: translatedText,
            editedText: null,
            aiCorrection: null,
            aiIssues: []
        };
    });
}


/* =========================================================
   ADAPTIVE CHUNK TRANSLATION
   ========================================================= */

async function translateChunkAdaptive(
    allSubtitles,
    chunk,
    language
) {

    try {

        return await translateChunkWithRetry(
            allSubtitles,
            chunk,
            language
        );

    } catch (error) {

        console.warn(
            `Chunk ${chunk[0].number}-${chunk[chunk.length - 1].number} failed.`
        );

        /*
            If the chunk is already small, we cannot split it
            further meaningfully.
        */

        if (chunk.length <= 10) {

            /*
                Try recovering individual subtitles.
            */

            return await translateSmallChunkIndividually(
                allSubtitles,
                chunk,
                language
            );
        }

        /*
            Split the failed chunk in half.
        */

        const middle =
            Math.ceil(chunk.length / 2);

        const first =
            chunk.slice(0, middle);

        const second =
            chunk.slice(middle);

        const firstResult =
            await translateChunkAdaptive(
                allSubtitles,
                first,
                language
            );

        const secondResult =
            await translateChunkAdaptive(
                allSubtitles,
                second,
                language
            );

        return {
            ...firstResult,
            ...secondResult
        };
    }
}


/* =========================================================
   RETRY
   ========================================================= */

async function translateChunkWithRetry(
    allSubtitles,
    chunk,
    language
) {

    let lastError = null;

    for (
        let attempt = 1;
        attempt <= TRANSLATION_MAX_RETRIES;
        attempt++
    ) {

        try {

            const result =
                await requestTranslation(
                    allSubtitles,
                    chunk,
                    language
                );

            validateChunkTranslation(
                chunk,
                result
            );

            return result;

        } catch (error) {

            lastError = error;

            console.warn(
                `Translation attempt ${attempt}/${TRANSLATION_MAX_RETRIES} failed:`,
                error
            );
        }
    }

    throw lastError ||
        new Error(
            "Translation failed."
        );
}


/* =========================================================
   SMALL CHUNK RECOVERY
   ========================================================= */

async function translateSmallChunkIndividually(
    allSubtitles,
    chunk,
    language
) {

    const result = {};

    for (const subtitle of chunk) {

        let translated = null;

        for (
            let attempt = 1;
            attempt <= TRANSLATION_MAX_RETRIES;
            attempt++
        ) {

            try {

                const response =
                    await requestTranslation(
                        allSubtitles,
                        [subtitle],
                        language
                    );

                validateChunkTranslation(
                    [subtitle],
                    response
                );

                translated =
                    response[subtitle.number];

                break;

            } catch (error) {

                console.warn(
                    `Individual translation failed for ${subtitle.number}, attempt ${attempt}:`,
                    error
                );
            }
        }

        if (!translated) {

            throw new Error(
                `Unable to translate subtitle ${subtitle.number}.`
            );
        }

        result[subtitle.number] =
            translated;
    }

    return result;
}


/* =========================================================
   OPENAI TRANSLATION REQUEST
   ========================================================= */

async function requestTranslation(
    allSubtitles,
    primaryChunk,
    language
) {

    const context =
        getTranslationContext(
            allSubtitles,
            primaryChunk
        );

    const prompt =
        buildTranslationPrompt(
            context,
            primaryChunk,
            language
        );

    const response =
        await fetch(
            "https://api.openai.com/v1/responses",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",

                    "Authorization":
                        `Bearer ${window.OPENAI_API_KEY}`
                },

                body: JSON.stringify({

                    model:
                        window.OPENAI_MODEL,

                    input:
                        prompt,

                    text: {
                        format: {
                            type:
                                "json_schema",

                            name:
                                "subtitle_translations",

                            strict:
                                true,

                            schema: {

                                type:
                                    "object",

                                properties: {

                                    translations: {

                                        type:
                                            "array",

                                        items: {

                                            type:
                                                "object",

                                            properties: {

                                                line: {
                                                    type:
                                                        "integer"
                                                },

                                                translatedText: {
                                                    type:
                                                        "string"
                                                }

                                            },

                                            required: [
                                                "line",
                                                "translatedText"
                                            ],

                                            additionalProperties:
                                                false
                                        }
                                    }

                                },

                                required: [
                                    "translations"
                                ],

                                additionalProperties:
                                    false
                            }
                        }
                    }
                })
            }
        );

    const rawResponse =
        await response.text();

    if (!response.ok) {

        throw new Error(
            `OpenAI API error ${response.status}: ${rawResponse}`
        );
    }

    let data;

    try {

        data =
            JSON.parse(rawResponse);

    } catch (error) {

        throw new Error(
            "OpenAI returned invalid JSON."
        );
    }

    let outputText =
        data.output_text;

    if (
        !outputText &&
        Array.isArray(data.output)
    ) {

        for (
            const item of data.output
        ) {

            if (
                !Array.isArray(
                    item.content
                )
            ) {
                continue;
            }

            for (
                const content of item.content
            ) {

                if (
                    content.type ===
                        "output_text" &&
                    typeof content.text ===
                        "string"
                ) {

                    outputText =
                        content.text;

                    break;
                }
            }

            if (outputText) {
                break;
            }
        }
    }

    if (!outputText) {

        throw new Error(
            "OpenAI returned no generated text."
        );
    }

    let parsed;

    try {

        parsed =
            JSON.parse(outputText);

    } catch (error) {

        throw new Error(
            "OpenAI returned invalid translation JSON."
        );
    }

    const result = {};

    for (
        const item of
            parsed.translations || []
    ) {

        result[item.line] =
            item.translatedText;
    }

    return result;
}


/* =========================================================
   PROMPT
   ========================================================= */

function buildTranslationPrompt(
    context,
    primaryChunk,
    language
) {

    const contextText =
        context.map(subtitle =>
            `CONTEXT [${subtitle.number}]\n${subtitle.originalText}`
        ).join("\n\n");

    const primaryText =
        primaryChunk.map(subtitle =>
            `TRANSLATE [${subtitle.number}]\n${subtitle.originalText}`
        ).join("\n\n");

    return `
You are translating Bulgarian subtitles into ${language}.

The subtitles are part of a continuous audiovisual program.

Use the surrounding CONTEXT to understand incomplete sentences,
pronouns, terminology, names, and meaning.

IMPORTANT RULES:

1. Translate ONLY the subtitles marked TRANSLATE.
2. Do NOT translate CONTEXT.
3. Preserve every TRANSLATE line number exactly.
4. Return exactly one translation for every TRANSLATE line.
5. Never omit a line.
6. Never invent a line number.
7. Never return timestamps.
8. Never return an SRT file.
9. Never merge subtitle IDs.
10. Preserve the intended meaning.
11. Keep the translation natural for ${language}.
12. Do not add explanations.
13. Return only the requested JSON structure.

CONTEXT:

${contextText}

PRIMARY SUBTITLES:

${primaryText}
`;
}


/* =========================================================
   CONTEXT
   ========================================================= */

function getTranslationContext(
    allSubtitles,
    primaryChunk
) {

    const firstIndex =
        allSubtitles.indexOf(
            primaryChunk[0]
        );

    const lastIndex =
        allSubtitles.indexOf(
            primaryChunk[
                primaryChunk.length - 1
            ]
        );

    const contextStart =
        Math.max(
            0,
            firstIndex -
                TRANSLATION_CONTEXT_SIZE
        );

    const contextEnd =
        Math.min(
            allSubtitles.length,
            lastIndex +
                TRANSLATION_CONTEXT_SIZE +
                1
        );

    return allSubtitles.slice(
        contextStart,
        contextEnd
    ).filter(subtitle =>
        !primaryChunk.includes(subtitle)
    );
}


/* =========================================================
   CHUNKS
   ========================================================= */

function createTranslationChunks(
    subtitles,
    chunkSize
) {

    const chunks = [];

    for (
        let i = 0;
        i < subtitles.length;
        i += chunkSize
    ) {

        chunks.push(
            subtitles.slice(
                i,
                i + chunkSize
            )
        );
    }

    return chunks;
}


/* =========================================================
   VALIDATION
   ========================================================= */

function validateChunkTranslation(
    chunk,
    translations
) {

    const expectedIds =
        chunk.map(
            subtitle => subtitle.number
        );

    const actualIds =
        Object.keys(translations)
            .map(Number);

    const missing =
        expectedIds.filter(
            id =>
                !actualIds.includes(id)
        );

    const unexpected =
        actualIds.filter(
            id =>
                !expectedIds.includes(id)
        );

    if (missing.length) {

        throw new Error(
            `Missing subtitle IDs: ${missing.join(", ")}`
        );
    }

    if (unexpected.length) {

        throw new Error(
            `Unexpected subtitle IDs: ${unexpected.join(", ")}`
        );
    }

    for (const id of expectedIds) {

        if (
            typeof translations[id] !==
                "string" ||
            !translations[id].trim()
        ) {

            throw new Error(
                `Subtitle ${id} has empty translation.`
            );
        }
    }
}


function validateCompleteTranslation(
    subtitles,
    translations
) {

    const expectedIds =
        subtitles.map(
            subtitle => subtitle.number
        );

    const actualIds =
        Object.keys(translations)
            .map(Number);

    if (
        expectedIds.length !==
        actualIds.length
    ) {

        throw new Error(
            "Final translation contains a different number of subtitles."
        );
    }

    for (const subtitle of subtitles) {

        const translated =
            translations[
                subtitle.number
            ];

        if (
            typeof translated !==
                "string" ||
            !translated.trim()
        ) {

            throw new Error(
                `Subtitle ${subtitle.number} has no translation.`
            );
        }
    }
}


/* =========================================================
   SRT PARSER
   ========================================================= */

function parseSRT(srtText) {

    const normalized =
        srtText
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .trim();

    if (!normalized) {
        return [];
    }

    const blocks =
        normalized.split(
            /\n{2,}/
        );

    const subtitles = [];

    for (const block of blocks) {

        const lines =
            block.split("\n");

        if (lines.length < 3) {
            continue;
        }

        const number =
            Number(lines[0].trim());

        const timestamp =
            lines[1].trim();

        const text =
            lines
                .slice(2)
                .join("\n")
                .trim();

        if (
            !Number.isInteger(number) ||
            !timestamp ||
            !text
        ) {
            continue;
        }

        subtitles.push({
            number,
            timestamp,
            originalText: text,
            editedText: null,
            aiCorrection: null,
            aiIssues: []
        });
    }

    return subtitles;
}


/* =========================================================
   SRT RECONSTRUCTION
   ========================================================= */

function createSRTFromSubtitles(
    subtitles,
    useEditedText = true
) {

    return subtitles.map(subtitle => {

        const text =
            useEditedText &&
            subtitle.editedText !== null
                ? subtitle.editedText
                : subtitle.originalText;

        return [
            subtitle.number,
            subtitle.timestamp,
            text
        ].join("\n");

    }).join("\n\n");
}


/* =========================================================
   FILE NAME
   ========================================================= */

function createTranslatedFileName(
    originalName,
    language
) {

    const baseName =
        originalName.replace(
            /\.srt$/i,
            ""
        );

    return `${baseName}_${language}.srt`;
}


/* =========================================================
   TRANSLATION UI
   ========================================================= */

function showTranslationProgress(
    language
) {

    let overlay =
        document.getElementById(
            "translationProgress"
        );

    if (!overlay) {

        overlay =
            document.createElement("div");

        overlay.id =
            "translationProgress";

        overlay.innerHTML = `
            <div class="translation-progress-box">

                <div class="translation-progress-title">
                    Translating to ${language}
                </div>

                <div class="translation-progress-bar">
                    <div
                        id="translationProgressFill"
                        class="translation-progress-fill"
                    ></div>
                </div>

                <div
                    id="translationProgressText"
                    class="translation-progress-text"
                >
                    Preparing translation...
                </div>

            </div>
        `;

        document.body.appendChild(
            overlay
        );
    }

    overlay.classList.remove("hidden");
}


function updateTranslationProgress(
    percentage,
    text
) {

    const fill =
        document.getElementById(
            "translationProgressFill"
        );

    const label =
        document.getElementById(
            "translationProgressText"
        );

    if (fill) {

        fill.style.width =
            `${percentage}%`;
    }

    if (label) {

        label.textContent =
            text;
    }
}


function hideTranslationProgress() {

    const overlay =
        document.getElementById(
            "translationProgress"
        );

    if (overlay) {

        overlay.classList.add(
            "hidden"
        );
    }
}


function showTranslationError(
    message
) {

    showTranslationProgress(
        getTranslationTarget()
    );

    updateTranslationProgress(
        100,
        `Translation failed: ${message}`
    );
}


/* =========================================================
   TRANSLATED INSTANCE UI
   ========================================================= */

function updateTranslationUI(
    language
) {

    const translateBtn =
        document.getElementById(
            "translateBtn"
        );

    if (translateBtn) {

        translateBtn.textContent =
            "Translate";
    }

    /*
        Optional language indicator.
    */

    let indicator =
        document.getElementById(
            "translationLanguage"
        );

    if (!indicator) {

        indicator =
            document.createElement(
                "div"
            );

        indicator.id =
            "translationLanguage";

        document.body.appendChild(
            indicator
        );
    }

    indicator.textContent =
        language;
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

initializeTranslationFeature();


