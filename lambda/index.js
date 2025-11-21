const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const {
  ComprehendClient,
  DetectSentimentCommand,
  DetectKeyPhrasesCommand,
} = require("@aws-sdk/client-comprehend");
const { MongoClient } = require("mongodb");

// Environment variables
const LAMBDA_REGION = process.env.REGION || process.env.AWS_REGION || "ap-south-1";
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "beautiq"; // ✅ Fixed default
const FEEDBACK_COLLECTION = process.env.FEEDBACK_COLLECTION || "feedbacks"; // ✅ Fixed default
const DEFAULT_LANGUAGE = process.env.SENTIMENT_LANGUAGE_CODE || "en";
const FEEDBACK_TEXT_KEYS = (process.env.FEEDBACK_TEXT_FIELDS || "feedback,feedbackText,text,comment")
  .split(",")
  .map((key) => key.trim())
  .filter(Boolean);

// Validation
if (!MONGODB_URI) {
  throw new Error("MONGODB_URI environment variable is required");
}

// Initialize AWS clients
const s3Client = new S3Client({ region: LAMBDA_REGION });
const comprehendClient = new ComprehendClient({ region: LAMBDA_REGION });

// Database connection cache
let cachedDb = null;

async function getDbConnection() {
  if (cachedDb) {
    console.log("♻️ Using cached MongoDB connection");
    return cachedDb;
  }

  console.log("🔗 Connecting to MongoDB...");
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  cachedDb = client.db(MONGODB_DB_NAME);
  console.log(`✅ Connected to database: ${MONGODB_DB_NAME}`);
  return cachedDb;
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function analyzeText(text, languageCode = DEFAULT_LANGUAGE) {
  const normalizedText = text.length > 5000 ? text.slice(0, 5000) : text;

  console.log(`🔍 Analyzing text (${normalizedText.length} characters)`);

  const [sentiment, keyPhrases] = await Promise.all([
    comprehendClient.send(
      new DetectSentimentCommand({
        Text: normalizedText,
        LanguageCode: languageCode,
      })
    ),
    comprehendClient.send(
      new DetectKeyPhrasesCommand({
        Text: normalizedText,
        LanguageCode: languageCode,
      })
    ),
  ]);

  return {
    sentiment: sentiment.Sentiment,
    sentimentScores: {
      positive: sentiment.SentimentScore.Positive,
      negative: sentiment.SentimentScore.Negative,
      neutral: sentiment.SentimentScore.Neutral,
      mixed: sentiment.SentimentScore.Mixed,
    },
    keyPhrases: (keyPhrases.KeyPhrases || []).map((phrase) => phrase.Text),
  };
}

function extractFeedbackText(feedback) {
  for (const key of FEEDBACK_TEXT_KEYS) {
    if (feedback[key]) {
      return feedback[key];
    }
  }
  return null;
}

exports.handler = async (event) => {
  console.log("=== 🚀 Lambda Triggered ===");
  console.log("Event:", JSON.stringify(event, null, 2));

  if (!event.Records || !Array.isArray(event.Records)) {
    console.warn("⚠️ No S3 records in the event payload");
    return { status: "error", message: "No S3 records found" };
  }

  const db = await getDbConnection();
  const collection = db.collection(FEEDBACK_COLLECTION);
  
  let processedCount = 0;
  let failedCount = 0;

  for (const record of event.Records) {
    try {
      const bucket = record?.s3?.bucket?.name;
      const key = record?.s3?.object?.key;

      if (!bucket || !key) {
        console.warn("⚠️ Skipping record with missing bucket or key");
        failedCount++;
        continue;
      }

      const decodedKey = decodeURIComponent(key.replace(/\+/g, " "));
      console.log(`📁 Processing: s3://${bucket}/${decodedKey}`);

      // Get object from S3
      const object = await s3Client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: decodedKey,
        })
      );

      const body = await streamToString(object.Body);
      const feedback = JSON.parse(body);
      console.log("📋 Feedback data:", feedback);

      // Extract feedback text
      const feedbackText = extractFeedbackText(feedback);
      if (!feedbackText) {
        console.warn(`⚠️ No feedback text found in ${decodedKey}`);
        failedCount++;
        continue;
      }

      console.log(`💬 Feedback: "${feedbackText}"`);

      // Analyze with Comprehend
      const analysis = await analyzeText(feedbackText, feedback.languageCode);
      console.log(`😊 Sentiment: ${analysis.sentiment}`);
      console.log(`🔑 Key phrases:`, analysis.keyPhrases);

      // Prepare document
      const document = {
        ...feedback,
        sentiment: analysis.sentiment,
        sentimentScores: analysis.sentimentScores,
        keyPhrases: analysis.keyPhrases,
        _s3: {
          bucket,
          key: decodedKey,
          etag: record?.s3?.object?.eTag,
        },
        processedAt: new Date().toISOString(),
      };

      // Insert into MongoDB
      const result = await collection.insertOne(document);
      console.log(`✅ Inserted document with _id: ${result.insertedId}`);
      
      processedCount++;
    } catch (err) {
      failedCount++;
      console.error("❌ Failed to process record:", err);
    }
  }

  console.log(`\n📊 Summary: ${processedCount} processed, ${failedCount} failed`);

  return {
    status: failedCount > 0 ? "partial" : "success",
    processedCount,
    failedCount,
  };
};