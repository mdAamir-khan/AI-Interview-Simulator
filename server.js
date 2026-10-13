require("dotenv").config();
const express = require("express");
const OpenAI = require("openai");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static("public"));

// ✅ OpenRouter config (FIXED)
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const PORT = process.env.PORT || 3000;

// Create router for API endpoints
const apiRouter = express.Router();

// ---------- API: Generate Interview Questions ----------
apiRouter.post("/generate-questions", async (req, res) => {
  try {
    const { name, qualification, marks, areaOfInterest, numberOfQuestions } = req.body;

    if (!name || !qualification || marks === undefined || !areaOfInterest || !numberOfQuestions) {
      return res.status(400).json({ error: "All fields are required." });
    }

    const marksNum = parseFloat(marks);
    if (isNaN(marksNum)) {
      return res.status(400).json({ error: "Marks must be a valid number." });
    }

    const qCount = parseInt(numberOfQuestions, 10);
    if (isNaN(qCount) || qCount < 1 || qCount > 20) {
      return res.status(400).json({ error: "Number of questions must be between 1 and 20." });
    }

    const prompt = `You are an expert technical interviewer. Generate ${qCount} unique interview questions for a candidate:

Name: ${name}
Qualification: ${qualification}
Marks: ${marksNum}%
Area: ${areaOfInterest}

Rules:
- Mix theory, practical, and scenario questions
- Difficulty based on profile
- Each question answerable in 1–3 min
- Return ONLY JSON array

Example:
["Q1?", "Q2?"]`;

    const completion = await openai.chat.completions.create({
      model: "openai/gpt-4o-mini", // ✅ FIXED
      messages: [
        { role: "system", content: "Return only valid JSON array." },
        { role: "user", content: prompt },
      ],
      temperature: 0.8,
      max_tokens: 1000,
    });

    const raw = completion.choices[0].message.content.trim();

    let questions;
    try {
      questions = JSON.parse(raw);
    } catch {
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) {
        questions = JSON.parse(match[0]);
      } else {
        throw new Error("Invalid JSON response");
      }
    }

    res.json({ questions: questions.slice(0, qCount) });
  } catch (err) {
    console.error("OpenRouter error:", err.message);
    res.status(500).json({ error: "Failed to generate questions" });
  }
});

// ---------- API: Evaluate Single Answer (for live feedback) ----------
apiRouter.post("/evaluate-answer", async (req, res) => {
  try {
    const { question, answer, profile } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ error: "Question and answer required." });
    }

    const prompt = `Evaluate this answer:

Question: ${question}
Answer: ${answer}

Give:
- Accuracy
- Clarity
- 1 improvement tip

Keep it short.`;

    const completion = await openai.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an interviewer." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const feedback = completion.choices[0].message.content.trim();

    res.json({ feedback });
  } catch (err) {
    console.error("Evaluation error:", err.message);
    res.status(500).json({ error: "Failed to evaluate answer" });
  }
});

// ---------- API: Log Proctoring Violation ----------
apiRouter.post("/log-violation", (req, res) => {
  try {
    const { name, email, type, timestamp, warningCount } = req.body;
    
    if (!name || !type || !timestamp || warningCount === undefined) {
      return res.status(400).json({ error: "Missing required fields for violation logging." });
    }

    const logEntry = `[${timestamp}] Candidate: ${name} (${email || "N/A"}) | Warning ${warningCount}/3: ${type}\n`;
    
    const fs = require("fs");
    const logPath = path.join(__dirname, "violations.log");
    fs.appendFileSync(logPath, logEntry, "utf8");

    console.log(`[Proctoring] Recorded violation for ${name}: ${type} (${warningCount}/3)`);
    res.json({ success: true });
  } catch (err) {
    console.error("Violation logging error:", err.message);
    res.status(500).json({ error: "Failed to log violation" });
  }
});

// ---------- Determine Grade Dynamically ----------
function getGrade(percentage) {
  if (percentage >= 95) return "A+";
  if (percentage >= 85) return "A";
  if (percentage >= 75) return "B+";
  if (percentage >= 60) return "B";
  if (percentage >= 45) return "C";
  return "F";
}

// ---------- API: Evaluate All Answers & Generate Scorecard ----------
apiRouter.post("/evaluate-all", async (req, res) => {
  try {
    const { profile, answers } = req.body;

    if (!profile || !answers || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: "Profile and answers array required." });
    }

    // Build a detailed prompt with all Q&A pairs
    let qaSection = answers.map((a, i) =>
      `Q${i + 1}: ${a.question}\nA${i + 1}: ${a.answer || "[No answer provided]"}`
    ).join("\n\n");

    const totalQuestions = answers.length;

    const prompt = `You are an expert technical interviewer. Evaluate ALL answers from this interview and generate a scorecard.

CANDIDATE PROFILE:
- Name: ${profile.name}
- Email: ${profile.email || "N/A"}
- Qualification: ${profile.qualification}
- Marks/Percentage in studies: ${profile.marks}%
- Area of Interest: ${profile.areaOfInterest}

QUESTIONS & ANSWERS:
${qaSection}

INSTRUCTIONS:
1. Score each answer out of 10 based on accuracy, depth, clarity, and relevance.
2. Provide brief feedback for each answer (1-2 sentences).
3. Give overall remarks about the candidate's performance.

Return ONLY valid JSON with this exact structure (no markdown, no commentary):
{
  "candidate_name": "${profile.name}",
  "email": "${profile.email || ""}",
  "qualification": "${profile.qualification}",
  "topic": "${profile.areaOfInterest}",
  "overall_remarks": "string",
  "per_question": [
    {
      "question": "string",
      "answer": "string",
      "score": number,
      "feedback": "string"
    }
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a strict JSON generator. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 2000,
    });

    const raw = completion.choices[0].message.content.trim();

    let scorecard;
    try {
      scorecard = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        scorecard = JSON.parse(match[0]);
      } else {
        throw new Error("Invalid JSON from AI");
      }
    }

    // Validate required fields
    if (!scorecard.per_question || !Array.isArray(scorecard.per_question)) {
      throw new Error("Scorecard missing per_question array");
    }

    // ================================================================
    // DYNAMIC SCORING: Compute total_score as AVERAGE of per-question scores
    // total_score = sum of scores / number of questions  (average out of 10)
    // percentage = (total_score / 10) * 100
    // grade = determined dynamically from percentage
    // ================================================================
    const sumScores = scorecard.per_question.reduce((acc, q) => acc + (q.score || 0), 0);
    const computedTotalScore = totalQuestions > 0 ? parseFloat((sumScores / totalQuestions).toFixed(2)) : 0;
    const computedPercentage = parseFloat(((computedTotalScore / 10) * 100).toFixed(2));
    const computedGrade = getGrade(computedPercentage);
    const computedMaxScore = 10; // Average score is out of 10

    // Override AI values with our computed values
    scorecard.total_score = computedTotalScore;
    scorecard.max_score = computedMaxScore;
    scorecard.percentage = computedPercentage;
    scorecard.grade = computedGrade;

    res.json({ scorecard });
  } catch (err) {
    console.error("Scorecard error:", err.message);
    res.status(500).json({ error: "Failed to generate scorecard: " + err.message });
  }
});

// Mount the API router to handle both standard local and Netlify function paths
app.use("/api", apiRouter);
app.use("/.netlify/functions/api", apiRouter);

// ---------- Start Server ----------
if (require.main === module && !process.env.NETLIFY) {
  app.listen(PORT, () => {
    console.log(`⚡ AI Interview Simulator running at http://localhost:${PORT}`);
  });
}

// Export app for Netlify / Serverless-HTTP wrapping
module.exports = app;
