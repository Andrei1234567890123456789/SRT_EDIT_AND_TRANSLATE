// ============================================================
// AI SUBTITLE ANALYSIS
// ============================================================


const OPENAI_MODEL = "gpt-5.6-luna";

// window.OPENAI_API_KEY = OPENAI_API_KEY;
// window.OPENAI_MODEL = OPENAI_MODEL;


// ------------------------------------------------------------
// Main AI analysis function
// ------------------------------------------------------------

async function analyzeSubtitlesWithAI(subtitles) {

    // if (!OPENAI_API_KEY ||
    //     OPENAI_API_KEY === "PASTE_YOUR_OPENAI_API_KEY_HERE") {

    //     throw new Error(
    //         "OpenAI API key has not been entered in ai.js."
    //     );
    // }


    const lines = subtitles.map(subtitle => {

        const text =
            subtitle.editedText !== null
                ? subtitle.editedText
                : subtitle.originalText;

        return `${subtitle.number} - ${text}`;
    });


    const chunks = splitIntoChunks(
        lines,
        12000
    );


    let allCorrections = [];


    for (const chunk of chunks) {

        const corrections =
            await analyzeChunkWithAI(chunk);

        allCorrections.push(
            ...corrections
        );
    }


    return allCorrections;
}


// ------------------------------------------------------------
// Analyze one chunk
// ------------------------------------------------------------

async function analyzeChunkWithAI(lines) {

    const prompt = `
You are correcting a Bulgarian, English or Russian subtitle transcription.

English and Russian are the translated versions of the original Bulgarian transcript with most of the trivial mistakes already fixed.
Focus on weird looking phrases, you are allowed to rephrase them(only RUssian and English subtitles, not Bulgarian).
Rephasing must maintain the amount of lines the same as the original. Do not move the contents of one line to another.
Bulgarian is the original language, follow the rules below for it.

Your task is to find transcription and language mistakes.

IMPORTANT RULES:

1. The original line numbers MUST remain unchanged.

2. The ORDER OF WORDS CANNOT CHANGE.

3. You may:
   - correct misspelled words
   - correct obvious transcription mistakes
   - combine nearby words
   - split words when necessary
   - correct punctuation
   - flag strange/uncertain parts that should be compared with the original audio

4. Do NOT rewrite the sentence stylistically.

5. Do NOT improve the author's writing style.

6. Do NOT change the meaning.

7. Do NOT move words from one position to another.

8. If a word is clearly wrong, correct it.

Example:
отроба -> утроба

Example:
около плодния -> околоплодния

9. Punctuation corrections should also be returned as corrected text.

10. If something sounds strange or potentially incorrect but you cannot confidently determine the correct transcription, preserve the text and report that line as an AUDIO_CHECK issue.

11. Only return lines that require a correction or review.

12. If a line is already correct, DO NOT return it.

13. Return ONLY JSON. No explanations.

14. Do not move words from one line to another. The Only exception are words divided by '-'

Example:
1 ... по
2 -бързо

Fix:
1 ...
2 по-бързо

15. There is a often used parasite word 'така'. Remove it only in cases where id doesn't make sense.

Example: какви така съображения би могло да има -> какви съображения би могло да има

16. Sometimes there are english words used(mostly medical/childbirth terms) they are not transcribed correctly.
Use the original english version it these cases.

Example:
резки уремиди капки -> Rescue remedy капки
ВИБАК -> VBAC
Лавита Нова -> La Vita Nova
прайвасито -> privacy-то

INPUT FORMAT:

number - subtitle text

Example:

1 - Здравейте, аз съм Олга.
2 - Вие гледате онлайн версията на курса "Информиран избор
3 - за ражбането".

Possible output:

{
  "corrections": [
    {
      "line": 3,
      "correctedText": "за раждането\".",
      "issues": [
        {
          "type": "spelling",
          "original": "ражбането",
          "corrected": "раждането"
        }
      ]
    }
  ]
}

ISSUE TYPES:

"spelling"
- misspelled word
- transcription spelling mistake
- display as RED

"punctuation"
- missing/wrong punctuation
- display as YELLOW

"audio"
- strange or uncertain wording that needs comparison with original audio
- display as BLUE

For audio issues:
- Do NOT invent a correction.
- Return the line with its current text.
- The issue tells the user that the line needs to be checked against the audio.

Return only corrections/reviews.

SUBTITLES:

${lines.join("\n")}
`;

const response = await fetch(
    "https://str-studio-api-key-worker.andrei-d-dukat.workers.dev",
    {
        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            model: OPENAI_MODEL,

            input: prompt,

            text: {
                format: {
                    type: "json_schema",
                    name: "subtitle_corrections",
                    strict: true,

                    schema: {
                        type: "object",

                        properties: {
                            corrections: {
                                type: "array",

                                items: {
                                    type: "object",

                                    properties: {
                                        line: {
                                            type: "integer"
                                        },

                                        correctedText: {
                                            type: "string"
                                        },

                                        issues: {
                                            type: "array",

                                            items: {
                                                type: "object",

                                                properties: {
                                                    type: {
                                                        type: "string",
                                                        enum: [
                                                            "spelling",
                                                            "punctuation",
                                                            "audio"
                                                        ]
                                                    },

                                                    original: {
                                                        type: "string"
                                                    },

                                                    corrected: {
                                                        type: "string"
                                                    }
                                                },

                                                required: [
                                                    "type",
                                                    "original",
                                                    "corrected"
                                                ],

                                                additionalProperties: false
                                            }
                                        }
                                    },

                                    required: [
                                        "line",
                                        "correctedText",
                                        "issues"
                                    ],

                                    additionalProperties: false
                                }
                            }
                        },

                        required: [
                            "corrections"
                        ],

                        additionalProperties: false
                    }
                }
            }
        })
    }
);

    const rawResponse = await response.text();

console.log("OpenAI HTTP status:", response.status);
console.log("OpenAI raw response:", rawResponse);

if (!response.ok) {
    throw new Error(
        `OpenAI API error ${response.status}: ${rawResponse}`
    );
}

if (!rawResponse.trim()) {
    throw new Error(
        "OpenAI returned an empty HTTP response."
    );
}

let data;

try {
    data = JSON.parse(rawResponse);
} catch (error) {
    throw new Error(
        "OpenAI returned invalid JSON:\n\n" +
        rawResponse
    );
}

console.log("OpenAI parsed response:", data);

let outputText = data.output_text;

/*
   Fallback: extract output text manually
   if output_text isn't provided.
*/

if (!outputText && Array.isArray(data.output)) {

    for (const item of data.output) {

        if (!Array.isArray(item.content)) {
            continue;
        }

        for (const content of item.content) {

            if (
                content.type === "output_text" &&
                typeof content.text === "string"
            ) {
                outputText = content.text;
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
        "OpenAI returned a successful response, " +
        "but no generated text was found.\n\n" +
        JSON.stringify(data, null, 2)
    );
}

console.log(
    "OpenAI generated text:",
    outputText
);

let parsed;

try {

    parsed = JSON.parse(outputText);

} catch (error) {

    throw new Error(
        "OpenAI returned text that was not valid JSON:\n\n" +
        outputText
    );
}

return parsed.corrections || [];
}


// ------------------------------------------------------------
// Split large subtitle files into chunks
// ------------------------------------------------------------

function splitIntoChunks(lines, maxCharacters) {

    const chunks = [];
    let currentChunk = [];
    let currentLength = 0;

    for (const line of lines) {

        const lineLength = line.length + 1;

        if (
            currentChunk.length > 0 &&
            currentLength + lineLength > maxCharacters
        ) {
            chunks.push(currentChunk);

            currentChunk = [];
            currentLength = 0;
        }

        currentChunk.push(line);
        currentLength += lineLength;
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    return chunks;
}