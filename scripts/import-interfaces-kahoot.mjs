import fs from "node:fs/promises";

const kahootUrls = [
  "https://kahoot.it/solo/?quizId=7076b092-3c7d-42e6-9b19-c08de8241f9c&gameMode=nano",
  "https://kahoot.it/solo/?quizId=703d6444-3876-4bac-9eec-a4d9cb87d255&gameMode=nano",
  "https://kahoot.it/solo/?quizId=37d2a3fe-fc3d-4355-8112-bec00ee9dfa9&gameMode=nano",
  "https://kahoot.it/solo/?quizId=d870e73c-a0ab-4486-a94b-01a3104e0881&gameMode=nano",
  "https://kahoot.it/solo/?quizId=55056ad6-d6bb-4cc4-bc23-75cf832bfc48&gameMode=nano",
  "https://kahoot.it/solo?quizId=7739dcab-8aa7-4ae6-8d6e-b9bcc9d9a278&gameMode=nano",
  "https://kahoot.it/solo?quizId=f99b6509-2bc1-42ba-9c8d-e96530dd685a&gameMode=nano",
  "https://kahoot.it/solo?quizId=20f79a11-b9fd-4042-a937-5e221f0b7e3b&gameMode=nano",
];

const outputFile = new URL("../data/Interfaces Kahoot.json", import.meta.url);

const uniqueQuizIds = [
  ...new Map(
    kahootUrls.map((url) => {
      const quizId = new URL(url).searchParams.get("quizId");
      if (!quizId) {
        throw new Error(`Missing quizId in URL: ${url}`);
      }
      return [quizId, url];
    })
  ).entries(),
];

const skipped = [];
const imported = [];

for (const [quizId, sourceUrl] of uniqueQuizIds) {
  const kahoot = await fetchKahoot(quizId);

  for (const [index, question] of (kahoot.questions ?? []).entries()) {
    const mappedQuestion = mapQuestion(question, imported.length + 1, sourceUrl);

    if (!mappedQuestion) {
      skipped.push({
        quizId,
        index: index + 1,
        title: kahoot.title,
        reason: "unsupported or missing exactly one correct answer",
      });
      continue;
    }

    imported.push(mappedQuestion);
  }
}

await fs.writeFile(outputFile, `${JSON.stringify(imported, null, 2)}\n`, "utf8");

console.log(`Imported questions: ${imported.length}`);
console.log(`Skipped questions: ${skipped.length}`);

if (skipped.length) {
  console.log(JSON.stringify(skipped, null, 2));
}

async function fetchKahoot(quizId) {
  const response = await fetch(`https://create.kahoot.it/rest/kahoots/${quizId}`);

  if (!response.ok) {
    throw new Error(`Kahoot ${quizId} failed with HTTP ${response.status}`);
  }

  return response.json();
}

function mapQuestion(question, id, sourceUrl) {
  if (!question || question.type !== "quiz" || !Array.isArray(question.choices)) {
    return null;
  }

  const options = question.choices
    .map((choice) => ({
      text: normalizeText(choice.answer),
      isCorrect: choice.correct === true,
    }))
    .filter((choice) => choice.text);

  if (options.length < 2 || options.filter((choice) => choice.isCorrect).length !== 1) {
    return null;
  }

  const questionText = normalizeQuestionText(question.question);

  if (!questionText) {
    return null;
  }

  return {
    id,
    question: questionText,
    options,
    answerSource: "kahoot",
    confidence: "alta",
    sourceFile: sourceUrl,
    sourcePart: "interfaces-kahoot",
  };
}

function normalizeQuestionText(value) {
  return normalizeText(value).replace(/^\d+[\s.)-]+/, "").trim();
}

function normalizeText(value) {
  return decodeHtmlEntities(String(value ?? ""))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, codePoint) => String.fromCodePoint(Number(codePoint)))
    .replace(/&#x([\da-f]+);/gi, (_, codePoint) => String.fromCodePoint(Number.parseInt(codePoint, 16)));
}
